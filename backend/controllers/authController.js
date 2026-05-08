const db = require('../config/database');
const { generateToken, hashToken, getClientIp, getUserAgentSignature } = require('../middleware/auth');
const SecureHash = require('../crypto/hash');
const KeyManager = require('../crypto/keyManager');
const sessionVault = require('../crypto/sessionVault');
const systemKeys = require('../crypto/systemKeys');
const nodemailer = require('nodemailer');
const RSA = require('../crypto/rsa');
const fs = require('fs');
require('dotenv').config();

// Non-cryptographic unique identifier for the token's `jti` claim.
// Uniqueness is sufficient here; no cryptographic randomness needed because
// the token signature itself binds the payload to the server secret.
const generateJti = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;

const hash = new SecureHash();
const keyManager = new KeyManager();
const rsa = new RSA();
let profileColumnsReadyPromise = null;

async function ensureExtendedProfileColumns() {
    if (!profileColumnsReadyPromise) {
        profileColumnsReadyPromise = (async () => {
            try {
                await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS encrypted_full_name TEXT");
                await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS encrypted_phone TEXT");
                await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS encrypted_department TEXT");
                await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS encrypted_bio TEXT");
            } catch (e) {
                // If DB doesn't support IF NOT EXISTS syntax, fall back silently.
                // In that case, missing-column errors will still be visible in logs.
                console.error('Profile column migration warning:', e.message);
            }
        })();
    }
    return profileColumnsReadyPromise;
}

// Setup Nodemailer
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Store OTPs temporarily (in production, use Redis)
const otpStore = new Map();

// Generate random OTP
const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};
const RESEND_COOLDOWN_MS = 30 * 1000;
const SESSION_DURATION_MS = 5 * 60 * 1000;

const register = async (req, res) => {
    try {
        await ensureExtendedProfileColumns();
        const {
            username,
            email,
            password,
            fullName = '',
            phone = '',
            department = '',
            bio = ''
        } = req.body;
        
        console.log('Registration attempt for:', username);

        const usernameHash = hash.simpleHash(username.toLowerCase());
        const emailHash = hash.simpleHash(email.toLowerCase());
        
        // Check if user exists
        const [existing] = await db.query(
            'SELECT id FROM users WHERE username = ? OR email = ?',
            [usernameHash, emailHash]
        );
        
        if (existing.length > 0) {
            return res.status(400).json({ error: 'Username or email already exists.' });
        }
        
        // Hash password with salt (from scratch)
        const { hash: passwordHash, salt: passwordSalt } = hash.hashPassword(password);
        
        // Generate encryption keys (RSA + ECC)
        const keys = keyManager.generateUserKeys();
        
        // Encrypt private keys with password
        const encryptedRSAPrivateKey = keyManager.encryptPrivateKey(keys.rsa.privateKey, password);
        const encryptedECCPrivateKey = keyManager.encryptPrivateKey(keys.ecc.privateKey, password);
        
        // Encrypt username using System RSA public key, email with personal key
        const encryptedUsername = rsa.encrypt(username, systemKeys.getPublicKey());
        const encryptedEmail = rsa.encrypt(email, keys.rsa.publicKey);
        const encryptedFullName = rsa.encrypt(fullName || username, keys.rsa.publicKey);
        const encryptedPhone = rsa.encrypt(phone || '', keys.rsa.publicKey);
        const encryptedDepartment = rsa.encrypt(department || '', keys.rsa.publicKey);
        const encryptedBio = rsa.encrypt(bio || '', keys.rsa.publicKey);

        // Store user with encrypted data
        const [result] = await db.query(
            `INSERT INTO users 
            (username, encrypted_username, encrypted_full_name, email, encrypted_email, encrypted_phone, encrypted_department, encrypted_bio, password_hash, password_salt, role, 
             rsa_public_key, rsa_private_key_encrypted, 
             ecc_public_key, ecc_private_key_encrypted) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'user', ?, ?, ?, ?)`,
            [
                usernameHash, encryptedUsername, encryptedFullName, emailHash, encryptedEmail, encryptedPhone, encryptedDepartment, encryptedBio, passwordHash, passwordSalt,
                JSON.stringify(keys.rsa.publicKey),
                encryptedRSAPrivateKey,
                JSON.stringify(keys.ecc.publicKey),
                encryptedECCPrivateKey
            ]
        );
        
        console.log('User registered successfully:', username);
        res.status(201).json({ 
            message: 'Registration successful. Please login.',
            userId: result.insertId 
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed: ' + error.message });
    }
};

const login = async (req, res) => {
    try {
        const { username, password } = req.body;
        
        console.log('Login attempt for:', username);

        const inputHash = hash.simpleHash(username.toLowerCase());
        
        // Get user by hash
        const [users] = await db.query(
            'SELECT * FROM users WHERE username = ? OR email = ?',
            [inputHash, inputHash]
        );
        
        if (users.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }
        
        const user = users[0];
        
        // Verify password
        const isValid = hash.verifyPassword(password, user.password_hash, user.password_salt);
        
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }
        
        // Unlock private keys using the password
        let rsaPrivateKey;
        let eccPrivateKey;
        try {
            rsaPrivateKey = keyManager.decryptPrivateKey(user.rsa_private_key_encrypted, password);
            eccPrivateKey = keyManager.decryptPrivateKey(user.ecc_private_key_encrypted, password);
        } catch (decryptError) {
            console.error('Failed to unlock private keys during login:', decryptError.message);
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        // Decrypt email using RSA private key to send the OTP
        let actualEmail;
        try {
            actualEmail = rsa.decrypt(user.encrypted_email, rsaPrivateKey);
        } catch(e) {
            console.error('Failed to decrypt email', e);
            actualEmail = "unknown"; // Fallback for testing if decryption fails
        }

        // Generate OTP for 2FA
        const otp = generateOTP();
        
        // Store OTP and unlocked keys temporarily
        otpStore.set(user.id, {
            otp, 
            expires: Date.now() + 10 * 60 * 1000,
            keys: { rsaPrivateKey, eccPrivateKey },
            email: actualEmail,
            lastSentAt: Date.now()
        });
        
        // Send OTP via Email
        if (actualEmail !== "unknown") {
            try {
                await transporter.sendMail({
                    from: process.env.EMAIL_USER,
                    to: actualEmail,
                    subject: 'CipherCampus Login OTP',
                    text: `Your OTP for login is: ${otp}. It will expire in 10 minutes.`
                });
                console.log(`OTP sent to email: ${actualEmail}`);
            } catch (emailError) {
                console.error('Failed to send email:', emailError);
                // Fallback to console for debugging if email config is missing
                console.log(`🔐 TEST OTP for ${user.id}: ${otp}`);
            }
        } else {
             console.log(`🔐 TEST OTP for ${user.id}: ${otp}`);
        }

        res.json({ 
            message: 'OTP sent to your email.',
            userId: user.id,
            requires2FA: true,
            resendInSeconds: 30
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed. Please try again.' });
    }
};

const resendOTP = async (req, res) => {
    try {
        const { userId } = req.body;
        const parsedUserId = parseInt(userId);

        if (!parsedUserId) {
            return res.status(400).json({ error: 'User ID is required.' });
        }

        const stored = otpStore.get(parsedUserId);
        if (!stored) {
            return res.status(401).json({ error: '2FA session expired. Please login again.' });
        }

        if (Date.now() > stored.expires) {
            otpStore.delete(parsedUserId);
            return res.status(401).json({ error: 'OTP expired. Please login again.' });
        }

        const now = Date.now();
        const elapsed = now - (stored.lastSentAt || 0);
        if (elapsed < RESEND_COOLDOWN_MS) {
            const remainingSeconds = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
            return res.status(429).json({
                error: `Please wait ${remainingSeconds}s before resending OTP.`,
                resendInSeconds: remainingSeconds
            });
        }

        const otp = generateOTP();
        stored.otp = otp;
        stored.expires = now + 10 * 60 * 1000;
        stored.lastSentAt = now;
        otpStore.set(parsedUserId, stored);

        if (stored.email && stored.email !== "unknown") {
            try {
                await transporter.sendMail({
                    from: process.env.EMAIL_USER,
                    to: stored.email,
                    subject: 'CipherCampus Login OTP (Resent)',
                    text: `Your new OTP for login is: ${otp}. It will expire in 10 minutes.`
                });
                console.log(`Resent OTP to email: ${stored.email}`);
            } catch (emailError) {
                console.error('Failed to resend email:', emailError);
                console.log(`🔐 TEST OTP (resent) for ${parsedUserId}: ${otp}`);
            }
        } else {
            console.log(`🔐 TEST OTP (resent) for ${parsedUserId}: ${otp}`);
        }

        res.json({
            message: 'A new OTP has been sent to your email.',
            resendInSeconds: 30
        });
    } catch (error) {
        console.error('Resend OTP error:', error);
        res.status(500).json({ error: 'Failed to resend OTP.' });
    }
};

const verify2FA = async (req, res) => {
    try {
        const { userId, otp } = req.body;
        
        const stored = otpStore.get(parseInt(userId));
        
        if (!stored) {
            return res.status(401).json({ error: '2FA session expired. Please login again.' });
        }
        
        if (Date.now() > stored.expires) {
            otpStore.delete(parseInt(userId));
            return res.status(401).json({ error: 'OTP expired. Please login again.' });
        }
        
        if (stored.otp !== otp) {
            return res.status(401).json({ error: 'Invalid OTP.' });
        }
        
        // Generate session token
        const token = generateToken(parseInt(userId), { jti: generateJti() });
        const tokenHash = hashToken(token);
        
        // Store unlocked keys in session vault
        sessionVault.storeKeys(userId, stored.keys);

        // Store session in database
        const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
        const ipAddress = getClientIp(req);
        const userAgent = getUserAgentSignature(req);
        
        await db.query(
            'INSERT INTO sessions (user_id, session_token, ip_address, user_agent, expires_at) VALUES (?, ?, ?, ?, ?)',
            [userId, tokenHash, ipAddress || null, userAgent || null, expiresAt]
        );
        
        // Get user info
        const [users] = await db.query(
            'SELECT id, encrypted_username, encrypted_email, role FROM users WHERE id = ?',
            [userId]
        );
        
        otpStore.delete(parseInt(userId));
        
        // Decrypt username and email to send to frontend
        let actualUsername = "User";
        try {
            actualUsername = rsa.decrypt(users[0].encrypted_username, systemKeys.getPrivateKey());
        } catch(e) {
            actualUsername = `User ${userId}`; // Fallback for old users
        }
        const actualEmail = rsa.decrypt(users[0].encrypted_email, stored.keys.rsaPrivateKey);

        console.log('User logged in:', actualUsername);

        res.cookie('accessToken', token, {
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
            maxAge: SESSION_DURATION_MS
        });
        
        res.json({
            message: 'Login successful.',
            token,
            sessionExpiresAt: expiresAt.toISOString(),
            user: {
                id: Number(users[0].id),
                username: actualUsername,
                email: actualEmail,
                role: users[0].role
            }
        });
    } catch (error) {
        console.error('2FA verification error:', error);
        res.status(500).json({ error: 'Verification failed: ' + error.message });
    }
};

const logout = async (req, res) => {
    try {
        if (req.sessionToken) {
            await db.query(
                'DELETE FROM sessions WHERE session_token = ? OR session_token = ?',
                [req.sessionTokenHash || '', req.sessionToken]
            );
        }
        if (req.user && req.user.id) {
            sessionVault.removeKeys(req.user.id);
        }
        res.clearCookie('accessToken');
        res.json({ message: 'Logged out successfully.' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: 'Logout failed.' });
    }
};

const getProfile = async (req, res) => {
    try {
        await ensureExtendedProfileColumns();
        const [users] = await db.query(
            `SELECT id, encrypted_username, encrypted_full_name, encrypted_email, encrypted_phone, encrypted_department, encrypted_bio, role, created_at
             FROM users WHERE id = ?`,
            [req.user.id]
        );
        
        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found.' });
        }
        
        const keys = sessionVault.getKeys(req.user.id);
        if (!keys) {
            return res.status(401).json({ error: 'Session keys not found, please login again.' });
        }

        let actualUsername = "User";
        try {
            actualUsername = rsa.decrypt(users[0].encrypted_username, systemKeys.getPrivateKey());
        } catch(e) {
            actualUsername = `User ${users[0].id}`; // Fallback for old users
        }
        const actualEmail = rsa.decrypt(users[0].encrypted_email, keys.rsaPrivateKey);
        let actualFullName = '';
        let actualPhone = '';
        let actualDepartment = '';
        let actualBio = '';
        try {
            actualFullName = users[0].encrypted_full_name ? rsa.decrypt(users[0].encrypted_full_name, keys.rsaPrivateKey) : '';
            actualPhone = users[0].encrypted_phone ? rsa.decrypt(users[0].encrypted_phone, keys.rsaPrivateKey) : '';
            actualDepartment = users[0].encrypted_department ? rsa.decrypt(users[0].encrypted_department, keys.rsaPrivateKey) : '';
            actualBio = users[0].encrypted_bio ? rsa.decrypt(users[0].encrypted_bio, keys.rsaPrivateKey) : '';
        } catch (e) {
            // Keep graceful fallbacks for older rows.
        }

        res.json({
            id: Number(users[0].id),
            username: actualUsername,
            fullName: actualFullName || actualUsername,
            email: actualEmail,
            phone: actualPhone,
            department: actualDepartment,
            bio: actualBio,
            role: users[0].role,
            created_at: users[0].created_at
        });
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ error: 'Failed to get profile.' });
    }
};

const updateProfile = async (req, res) => {
    try {
        await ensureExtendedProfileColumns();
        const { email, username, fullName = '', phone = '', department = '', bio = '' } = req.body;
        
        const keys = sessionVault.getKeys(req.user.id);
        if (!keys) {
            return res.status(401).json({ error: 'Session keys not found, please login again.' });
        }

        // Get user's RSA public key to encrypt the new data
        const [users] = await db.query('SELECT rsa_public_key FROM users WHERE id = ?', [req.user.id]);
        const publicKey = JSON.parse(users[0].rsa_public_key);

        const usernameHash = hash.simpleHash(username.toLowerCase());
        const emailHash = hash.simpleHash(email.toLowerCase());

        const encryptedUsername = rsa.encrypt(username, systemKeys.getPublicKey());
        const encryptedEmail = rsa.encrypt(email, publicKey);
        const encryptedFullName = rsa.encrypt(fullName || username, publicKey);
        const encryptedPhone = rsa.encrypt(phone || '', publicKey);
        const encryptedDepartment = rsa.encrypt(department || '', publicKey);
        const encryptedBio = rsa.encrypt(bio || '', publicKey);

        await db.query(
            `UPDATE users 
             SET email = ?, encrypted_email = ?, username = ?, encrypted_username = ?,
                 encrypted_full_name = ?, encrypted_phone = ?, encrypted_department = ?, encrypted_bio = ?
             WHERE id = ?`,
            [emailHash, encryptedEmail, usernameHash, encryptedUsername, encryptedFullName, encryptedPhone, encryptedDepartment, encryptedBio, req.user.id]
        );
        
        res.json({ message: 'Profile updated successfully.' });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Failed to update profile.' });
    }
};

const resetPassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Current password and new password are required.' });
        }

        const [users] = await db.query(
            'SELECT password_hash, password_salt, rsa_private_key_encrypted, ecc_private_key_encrypted FROM users WHERE id = ?',
            [req.user.id]
        );
        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found.' });
        }

        const user = users[0];
        const ok = hash.verifyPassword(currentPassword, user.password_hash, user.password_salt);
        if (!ok) {
            return res.status(400).json({ error: 'Current password is incorrect.' });
        }

        let rsaPrivateKey;
        let eccPrivateKey;
        try {
            rsaPrivateKey = keyManager.decryptPrivateKey(user.rsa_private_key_encrypted, currentPassword);
            eccPrivateKey = keyManager.decryptPrivateKey(user.ecc_private_key_encrypted, currentPassword);
        } catch (e) {
            // Backward-compatibility fallback for earlier buggy key rotation that used temp_password.
            try {
                rsaPrivateKey = keyManager.decryptPrivateKey(user.rsa_private_key_encrypted, 'temp_password');
                eccPrivateKey = keyManager.decryptPrivateKey(user.ecc_private_key_encrypted, 'temp_password');
            } catch (fallbackErr) {
                return res.status(500).json({ error: 'Failed to unlock existing keys for password reset.' });
            }
        }

        const { hash: newHash, salt: newSalt } = hash.hashPassword(newPassword);
        const newEncRsaPrivate = keyManager.encryptPrivateKey(rsaPrivateKey, newPassword);
        const newEncEccPrivate = keyManager.encryptPrivateKey(eccPrivateKey, newPassword);

        await db.query(
            `UPDATE users SET password_hash = ?, password_salt = ?, rsa_private_key_encrypted = ?, ecc_private_key_encrypted = ?
             WHERE id = ?`,
            [newHash, newSalt, newEncRsaPrivate, newEncEccPrivate, req.user.id]
        );

        sessionVault.removeKeys(req.user.id);
        if (req.sessionToken) {
            await db.query(
                'DELETE FROM sessions WHERE session_token = ? OR session_token = ?',
                [req.sessionTokenHash || '', req.sessionToken]
            );
        }

        res.json({ message: 'Password reset successful. Please login again.' });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: 'Failed to reset password.' });
    }
};

const deleteAccount = async (req, res) => {
    try {
        const { password } = req.body;
        if (!password) {
            return res.status(400).json({ error: 'Password is required to delete account.' });
        }

        const [users] = await db.query(
            'SELECT password_hash, password_salt FROM users WHERE id = ?',
            [req.user.id]
        );
        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found.' });
        }
        const ok = hash.verifyPassword(password, users[0].password_hash, users[0].password_salt);
        if (!ok) {
            return res.status(400).json({ error: 'Invalid password.' });
        }

        // Remove encrypted document files from disk first.
        const [docs] = await db.query('SELECT encrypted_file_path FROM documents WHERE user_id = ?', [req.user.id]);
        for (const doc of docs) {
            if (doc.encrypted_file_path && fs.existsSync(doc.encrypted_file_path)) {
                try { fs.unlinkSync(doc.encrypted_file_path); } catch (_) {}
            }
        }

        await db.query('DELETE FROM users WHERE id = ?', [req.user.id]);
        sessionVault.removeKeys(req.user.id);

        res.json({ message: 'Account deleted permanently.' });
    } catch (error) {
        console.error('Delete account error:', error);
        res.status(500).json({ error: 'Failed to delete account.' });
    }
};

module.exports = { register, login, resendOTP, verify2FA, logout, getProfile, updateProfile, resetPassword, deleteAccount };