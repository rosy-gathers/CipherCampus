const crypto = require('crypto');
const db = require('../config/database');
const { generateToken, hashToken, getClientIp, getUserAgentSignature } = require('../middleware/auth');
const SecureHash = require('../crypto/hash');
const KeyManager = require('../crypto/keyManager');
const sessionVault = require('../crypto/sessionVault');
const systemKeys = require('../crypto/systemKeys');
const otpStore = require('../services/otpStore');
const logger = require('../logger');
const { dispatchOtpEmail } = require('../services/emailDispatch');
const RSA = require('../crypto/rsa');
const HMAC = require('../crypto/hmac');
const { encryptPostEnvelope, decryptStoredContent } = require('../crypto/postEnvelope');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const generateJti = () => crypto.randomBytes(16).toString('hex');

const hash = new SecureHash();
const keyManager = new KeyManager();
const rsa = new RSA();
const avatarHmac = new HMAC(process.env.HMAC_SECRET || 'ciphercampus_document_secret');
let profileColumnsReadyPromise = null;

const avatarUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 512 * 1024 },
    fileFilter: (req, file, cb) => {
        const ok = /^image\/(jpeg|png|gif|webp)$/.test(file.mimetype);
        cb(ok ? null : new Error('Only JPEG, PNG, GIF, or WebP images are allowed.'), ok);
    },
});

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
                logger.warn({ err: e.message }, 'Profile column migration warning');
            }
        })();
    }
    return profileColumnsReadyPromise;
}

const generateOTP = () => crypto.randomInt(100000, 1000000).toString();
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
        
        logger.info({ username }, 'Registration attempt');

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
        
        const { hash: passwordHash, salt: passwordSalt } = await hash.hashPassword(password);
        
        // Generate encryption keys (RSA + ECC)
        const keys = keyManager.generateUserKeys();
        
        // Encrypt private keys using asymmetric wrapping (system RSA).
        const encryptedRSAPrivateKey = keyManager.encryptPrivateKey(keys.rsa.privateKey);
        const encryptedECCPrivateKey = keyManager.encryptPrivateKey(keys.ecc.privateKey);
        
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
        
        logger.info({ username }, 'User registered');
        res.status(201).json({ 
            message: 'Registration successful. Please login.',
            userId: result.insertId 
        });
    } catch (error) {
        logger.error({ err: error }, 'Registration error');
        res.status(500).json({ error: 'Registration failed: ' + error.message });
    }
};

const login = async (req, res) => {
    try {
        const { username, password } = req.body;
        
        logger.info({ username }, 'Login attempt');

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
        
        const isValid = await hash.verifyPassword(password, user.password_hash, user.password_salt);
        
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }
        
        // Unlock private keys (stored with asymmetric wrapping).
        let rsaPrivateKey;
        let eccPrivateKey;
        try {
            rsaPrivateKey = keyManager.decryptPrivateKey(user.rsa_private_key_encrypted);
            eccPrivateKey = keyManager.decryptPrivateKey(user.ecc_private_key_encrypted);
        } catch (decryptError) {
            logger.warn({ err: decryptError.message }, 'Failed to unlock private keys during login');
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        // Decrypt email using RSA private key to send the OTP
        let actualEmail;
        try {
            actualEmail = rsa.decrypt(user.encrypted_email, rsaPrivateKey);
        } catch(e) {
            logger.warn({ err: e.message }, 'Failed to decrypt email');
            actualEmail = "unknown"; // Fallback for testing if decryption fails
        }

        // Generate OTP for 2FA
        const otp = generateOTP();
        
        await otpStore.setChallenge(user.id, {
            otp,
            expires: Date.now() + 10 * 60 * 1000,
            keys: { rsaPrivateKey, eccPrivateKey },
            email: actualEmail,
            lastSentAt: Date.now(),
        });
        
        // Send OTP via Email (required for login completion).
        if (actualEmail !== "unknown") {
            try {
                await dispatchOtpEmail({
                    to: actualEmail,
                    subject: 'CipherCampus Login OTP',
                    text: `Your OTP for login is: ${otp}. It will expire in 10 minutes.`
                });
                logger.info('OTP email sent');
            } catch (emailError) {
                logger.error({ err: emailError.message }, 'Failed to send email');
                await otpStore.deleteChallenge(user.id);
                return res.status(500).json({ error: 'Failed to send OTP email. Please verify email configuration.' });
            }
        } else {
            await otpStore.deleteChallenge(user.id);
            return res.status(500).json({ error: 'Could not resolve a valid email for OTP delivery.' });
        }

        res.json({
            message: 'OTP sent to your email.',
            userId: user.id,
            requires2FA: true,
            resendInSeconds: 30
        });
    } catch (error) {
        logger.error({ err: error }, 'Login error');
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

        const stored = await otpStore.getChallenge(parsedUserId);
        if (!stored) {
            return res.status(401).json({ error: '2FA session expired. Please login again.' });
        }

        if (Date.now() > stored.expires) {
            await otpStore.deleteChallenge(parsedUserId);
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
        await otpStore.setChallenge(parsedUserId, stored);

        if (stored.email && stored.email !== "unknown") {
            try {
                await dispatchOtpEmail({
                    to: stored.email,
                    subject: 'CipherCampus Login OTP (Resent)',
                    text: `Your new OTP for login is: ${otp}. It will expire in 10 minutes.`
                });
                logger.info('OTP resent');
            } catch (emailError) {
                logger.error({ err: emailError.message }, 'Failed to resend email');
                return res.status(500).json({ error: 'Failed to resend OTP email. Please verify email configuration.' });
            }
        } else {
            return res.status(500).json({ error: 'Could not resolve a valid email for OTP resend.' });
        }

        res.json({
            message: 'A new OTP has been sent to your email.',
            resendInSeconds: 30
        });
    } catch (error) {
        logger.error({ err: error }, 'Resend OTP error');
        res.status(500).json({ error: 'Failed to resend OTP.' });
    }
};

const verify2FA = async (req, res) => {
    try {
        const { userId, otp } = req.body;
        
        const stored = await otpStore.getChallenge(parseInt(userId, 10));

        if (!stored) {
            return res.status(401).json({ error: '2FA session expired. Please login again.' });
        }

        if (Date.now() > stored.expires) {
            await otpStore.deleteChallenge(parseInt(userId, 10));
            return res.status(401).json({ error: 'OTP expired. Please login again.' });
        }
        
        if (stored.otp !== otp) {
            return res.status(401).json({ error: 'Invalid OTP.' });
        }
        
        // Generate session token
        const token = generateToken(parseInt(userId), { jti: generateJti() });
        const tokenHash = hashToken(token);
        
        // Store unlocked keys in session vault
        sessionVault.storeKeys(Number(userId), stored.keys);

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
        
        await otpStore.deleteChallenge(parseInt(userId, 10));

        // Decrypt username and email to send to frontend
        let actualUsername = "User";
        try {
            actualUsername = rsa.decrypt(users[0].encrypted_username, systemKeys.getPrivateKey());
        } catch(e) {
            actualUsername = `User ${userId}`; // Fallback for old users
        }
        const actualEmail = rsa.decrypt(users[0].encrypted_email, stored.keys.rsaPrivateKey);

        logger.info({ userId, username: actualUsername }, 'User logged in');

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
        logger.error({ err: error }, '2FA verification error');
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
        logger.error({ err: error }, 'Logout error');
        res.status(500).json({ error: 'Logout failed.' });
    }
};

const getProfile = async (req, res) => {
    try {
        await ensureExtendedProfileColumns();
        const [users] = await db.query(
            `SELECT id, encrypted_username, encrypted_full_name, encrypted_email, encrypted_phone, encrypted_department, encrypted_bio, role, created_at,
                    avatar_cipher_path
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
            created_at: users[0].created_at,
            hasAvatar: Boolean(users[0].avatar_cipher_path),
        });
    } catch (error) {
        logger.error({ err: error }, 'Profile error');
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
        logger.error({ err: error }, 'Update profile error');
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
        const ok = await hash.verifyPassword(currentPassword, user.password_hash, user.password_salt);
        if (!ok) {
            return res.status(400).json({ error: 'Current password is incorrect.' });
        }

        let rsaPrivateKey;
        let eccPrivateKey;
        try {
            rsaPrivateKey = keyManager.decryptPrivateKey(user.rsa_private_key_encrypted);
            eccPrivateKey = keyManager.decryptPrivateKey(user.ecc_private_key_encrypted);
        } catch (e) {
            return res.status(500).json({ error: 'Failed to unlock existing keys for password reset.' });
        }

        const { hash: newHash, salt: newSalt } = await hash.hashPassword(newPassword);
        const newEncRsaPrivate = keyManager.encryptPrivateKey(rsaPrivateKey);
        const newEncEccPrivate = keyManager.encryptPrivateKey(eccPrivateKey);

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
        logger.error({ err: error }, 'Reset password error');
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
            'SELECT password_hash, password_salt, avatar_cipher_path FROM users WHERE id = ?',
            [req.user.id]
        );
        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found.' });
        }
        const ok = await hash.verifyPassword(password, users[0].password_hash, users[0].password_salt);
        if (!ok) {
            return res.status(400).json({ error: 'Invalid password.' });
        }

        if (users[0].avatar_cipher_path && fs.existsSync(users[0].avatar_cipher_path)) {
            try {
                fs.unlinkSync(users[0].avatar_cipher_path);
            } catch {
                /* ignore */
            }
        }

        // Remove encrypted document files from disk first.
        const [docs] = await db.query('SELECT encrypted_file_path FROM documents WHERE user_id = ?', [req.user.id]);
        for (const doc of docs) {
            if (doc.encrypted_file_path && fs.existsSync(doc.encrypted_file_path)) {
                try {
                    fs.unlinkSync(doc.encrypted_file_path);
                } catch {
                    /* ignore missing or locked files */
                }
            }
        }

        await db.query('DELETE FROM users WHERE id = ?', [req.user.id]);
        sessionVault.removeKeys(req.user.id);

        res.json({ message: 'Account deleted permanently.' });
    } catch (error) {
        logger.error({ err: error }, 'Delete account error');
        res.status(500).json({ error: 'Failed to delete account.' });
    }
};

const uploadAvatar = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image uploaded.' });
        }
        const base64 = req.file.buffer.toString('base64');
        const mime = req.file.mimetype;
        const fileHmac = avatarHmac.generateHMAC(base64);
        const encryptedContent = encryptPostEnvelope(base64, systemKeys.getPublicKey());

        const [existing] = await db.query('SELECT avatar_cipher_path FROM users WHERE id = ?', [req.user.id]);
        if (
            existing.length &&
            existing[0].avatar_cipher_path &&
            fs.existsSync(existing[0].avatar_cipher_path)
        ) {
            try {
                fs.unlinkSync(existing[0].avatar_cipher_path);
            } catch {
                /* ignore */
            }
        }

        const uploadDir = path.join(__dirname, '../uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        const encPath = path.join(uploadDir, `avatar_${req.user.id}_${Date.now()}.enc`);
        fs.writeFileSync(encPath, encryptedContent);

        await db.query(
            'UPDATE users SET avatar_cipher_path = ?, avatar_hmac = ?, avatar_mime = ? WHERE id = ?',
            [encPath, fileHmac, mime, req.user.id]
        );
        res.json({ message: 'Avatar updated.' });
    } catch (error) {
        logger.error({ err: error }, 'Avatar upload error');
        res.status(500).json({ error: 'Failed to upload avatar.' });
    }
};

const getAvatar = async (req, res) => {
    try {
        const uid = parseInt(req.params.userId, 10);
        if (!uid) {
            return res.status(400).json({ error: 'Invalid user.' });
        }

        const [rows] = await db.query(
            'SELECT avatar_cipher_path, avatar_hmac, avatar_mime FROM users WHERE id = ?',
            [uid]
        );
        if (rows.length === 0 || !rows[0].avatar_cipher_path) {
            return res.status(404).json({ error: 'No avatar.' });
        }
        const row = rows[0];
        if (!fs.existsSync(row.avatar_cipher_path)) {
            return res.status(404).json({ error: 'Avatar file missing.' });
        }
        const encryptedContent = fs.readFileSync(row.avatar_cipher_path, 'utf8');
        const decryptedBase64 = decryptStoredContent(encryptedContent, systemKeys.getPrivateKey());
        if (!avatarHmac.verifyHMAC(decryptedBase64, row.avatar_hmac)) {
            return res.status(400).json({ error: 'Avatar integrity check failed.' });
        }
        const buf = Buffer.from(decryptedBase64, 'base64');
        res.setHeader('Content-Type', row.avatar_mime || 'image/jpeg');
        res.setHeader('Cache-Control', 'private, max-age=120');
        res.send(buf);
    } catch (error) {
        logger.error({ err: error }, 'Get avatar error');
        res.status(500).json({ error: 'Failed to load avatar.' });
    }
};

const deleteAvatar = async (req, res) => {
    try {
        const [rows] = await db.query('SELECT avatar_cipher_path FROM users WHERE id = ?', [req.user.id]);
        if (rows.length && rows[0].avatar_cipher_path && fs.existsSync(rows[0].avatar_cipher_path)) {
            try {
                fs.unlinkSync(rows[0].avatar_cipher_path);
            } catch {
                /* ignore */
            }
        }
        await db.query(
            'UPDATE users SET avatar_cipher_path = NULL, avatar_hmac = NULL, avatar_mime = NULL WHERE id = ?',
            [req.user.id]
        );
        res.json({ message: 'Avatar removed.' });
    } catch (error) {
        logger.error({ err: error }, 'Delete avatar error');
        res.status(500).json({ error: 'Failed to remove avatar.' });
    }
};

module.exports = {
    register,
    login,
    resendOTP,
    verify2FA,
    logout,
    getProfile,
    updateProfile,
    resetPassword,
    deleteAccount,
    uploadAvatar,
    getAvatar,
    deleteAvatar,
    avatarUpload,
};