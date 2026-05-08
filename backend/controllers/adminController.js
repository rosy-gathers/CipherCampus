const db = require('../config/database');
const KeyManager = require('../crypto/keyManager');
const RSA = require('../crypto/rsa');
const ECC = require('../crypto/ecc');
const HMAC = require('../crypto/hmac');
const systemKeys = require('../crypto/systemKeys');
const fs = require('fs');

const keyManager = new KeyManager();
const rsa = new RSA();
const ecc = new ECC();

function serializeCipherBlob(blob) {
    if (!blob || !blob.ciphertext) return blob;
    return {
        _enc: 'b64',
        ciphertext: Buffer.from(blob.ciphertext, 'utf8').toString('base64'),
        ephemeralPublicKey: blob.ephemeralPublicKey,
    };
}

function normalizeCipherBlob(blob) {
    if (!blob || typeof blob !== 'object') return blob;
    let ciphertext = blob.ciphertext;
    if (blob._enc === 'b64' && typeof ciphertext === 'string') {
        ciphertext = Buffer.from(ciphertext, 'base64').toString('utf8');
    }
    const ep = blob.ephemeralPublicKey;
    const point =
        ep && typeof ep === 'object'
            ? { x: Number(ep.x), y: Number(ep.y) }
            : ep;
    return {
        ciphertext,
        ephemeralPublicKey: point,
    };
}

const getAllUsers = async (req, res) => {
    try {
        const [users] = await db.query(
            'SELECT id, encrypted_username, email, role, created_at FROM users ORDER BY created_at DESC'
        );
        const out = users.map((u) => {
            let displayName = `User ${u.id}`;
            try {
                if (u.encrypted_username) {
                    displayName = rsa.decrypt(u.encrypted_username, systemKeys.getPrivateKey());
                }
            } catch (e) {
                // keep fallback
            }
            return {
                id: Number(u.id),
                username: displayName,
                email: '(stored as encrypted hash — not shown)',
                role: u.role,
                created_at: u.created_at,
            };
        });
        res.json(out);
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Failed to get users.' });
    }
};

const deleteUser = async (req, res) => {
    const { id } = req.params;
    
    try {
        // Delete user's files from uploads folder
        const [docs] = await db.query('SELECT encrypted_file_path FROM documents WHERE user_id = ?', [id]);
        const fs = require('fs');
        docs.forEach(doc => {
            if (fs.existsSync(doc.encrypted_file_path)) {
                fs.unlinkSync(doc.encrypted_file_path);
            }
        });
        
        // Delete user from database (cascading will delete related records)
        await db.query('DELETE FROM users WHERE id = ?', [id]);
        
        res.json({ message: 'User deleted successfully.' });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ error: 'Failed to delete user.' });
    }
};

const getSystemStats = async (req, res) => {
    try {
        const [userCount] = await db.query('SELECT COUNT(*) as count FROM users');
        const [postCount] = await db.query('SELECT COUNT(*) as count FROM posts');
        const [reportCount] = await db.query('SELECT COUNT(*) as count FROM reports');
        const [pendingReports] = await db.query(
            'SELECT COUNT(*) as count FROM reports WHERE status = "pending"'
        );
        const [lastRotation] = await db.query(
            'SELECT rotated_at FROM key_rotation_log ORDER BY rotated_at DESC LIMIT 1'
        );
        
        res.json({
            totalUsers: userCount[0].count,
            totalPosts: postCount[0].count,
            totalReports: reportCount[0].count,
            pendingReports: pendingReports[0].count,
            lastRotation: lastRotation[0]?.rotated_at || null,
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: 'Failed to get stats.' });
    }
};

const rotateUserKeys = async (req, res) => {
    const { userId } = req.params;
    const { currentPassword } = req.body || {};
    const uid = Number(userId);
    
    try {
        // Admins should not know other users' passwords; key rotation is self-service per account.
        if (Number(req.user.id) !== uid) {
            return res.status(403).json({
                error: 'Users must rotate their own keys using their own current password.'
            });
        }

        if (!currentPassword) {
            return res.status(400).json({ error: 'Current password is required to rotate keys safely.' });
        }

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            const [users] = await conn.query(
                `SELECT id, encrypted_email, password_hash, password_salt, rsa_public_key, ecc_public_key,
                        rsa_private_key_encrypted, ecc_private_key_encrypted
                 FROM users WHERE id = ?`,
                [uid]
            );
        
            if (users.length === 0) {
                await conn.rollback();
                return res.status(404).json({ error: 'User not found.' });
            }
            const user = users[0];
            const verify = keyManager.hash.verifyPassword(currentPassword, user.password_hash, user.password_salt);
            if (!verify) {
                await conn.rollback();
                return res.status(401).json({ error: 'Invalid current password.' });
            }

            const oldRsaPrivate = keyManager.decryptPrivateKey(user.rsa_private_key_encrypted, currentPassword);
            const oldEccPrivate = keyManager.decryptPrivateKey(user.ecc_private_key_encrypted, currentPassword);
            // Generate new keypairs
            const newKeys = keyManager.generateUserKeys();
            const newRsaPublic = newKeys.rsa.publicKey;
            const newEccPublic = newKeys.ecc.publicKey;
            const newRsaPrivateEncrypted = keyManager.encryptPrivateKey(newKeys.rsa.privateKey, currentPassword);
            const newEccPrivateEncrypted = keyManager.encryptPrivateKey(newKeys.ecc.privateKey, currentPassword);

            // Re-encrypt email (encrypted with user's RSA public key)
            let plaintextEmail = null;
            try {
                plaintextEmail = rsa.decrypt(user.encrypted_email, oldRsaPrivate);
            } catch (e) {
                await conn.rollback();
                return res.status(500).json({ error: 'Could not decrypt existing email for rotation.' });
            }
            const reencryptedEmail = rsa.encrypt(plaintextEmail, newRsaPublic);

            // Re-encrypt documents owned by this user
            const [docs] = await conn.query(
                'SELECT id, encrypted_file_path, file_hmac FROM documents WHERE user_id = ?',
                [uid]
            );
            for (const doc of docs) {
                if (!fs.existsSync(doc.encrypted_file_path)) continue;
                const encContent = fs.readFileSync(doc.encrypted_file_path, 'utf8');
                const plainBase64 = rsa.decrypt(encContent, oldRsaPrivate);
                const newEncContent = rsa.encrypt(plainBase64, newRsaPublic);
                fs.writeFileSync(doc.encrypted_file_path, newEncContent, 'utf8');
            }

            // Re-encrypt messages where this user needs decryptability
            const [messages] = await conn.query(
                'SELECT id, sender_id, receiver_id, encrypted_message FROM messages WHERE sender_id = ? OR receiver_id = ?',
                [uid, uid]
            );

            for (const msg of messages) {
                let parsed;
                try {
                    parsed = JSON.parse(msg.encrypted_message);
                } catch (e) {
                    continue;
                }

                const isSender = Number(msg.sender_id) === uid;
                const isReceiver = Number(msg.receiver_id) === uid;
                let updatedPayload = parsed;

                if (parsed.v === 2) {
                    if (isSender && parsed.sx) {
                        const senderBlob = normalizeCipherBlob(parsed.sx);
                        const plain = ecc.decrypt(senderBlob, Number(oldEccPrivate));
                        updatedPayload.sx = serializeCipherBlob(ecc.encrypt(plain, newEccPublic));
                    }
                    if (isReceiver && parsed.rx) {
                        const receiverBlob = normalizeCipherBlob(parsed.rx);
                        const plain = ecc.decrypt(receiverBlob, Number(oldEccPrivate));
                        updatedPayload.rx = serializeCipherBlob(ecc.encrypt(plain, newEccPublic));
                    }
                } else {
                    // Legacy format: only receiver copy is available.
                    if (isReceiver) {
                        const legacyBlob = normalizeCipherBlob(parsed);
                        const plain = ecc.decrypt(legacyBlob, Number(oldEccPrivate));
                        updatedPayload = serializeCipherBlob(ecc.encrypt(plain, newEccPublic));
                    }
                }

                await conn.query(
                    'UPDATE messages SET encrypted_message = ? WHERE id = ?',
                    [JSON.stringify(updatedPayload), msg.id]
                );
            }

            const oldRsaHash = HMAC.sha256(user.rsa_private_key_encrypted);
            const oldEccHash = HMAC.sha256(user.ecc_private_key_encrypted);
            const newRsaHash = HMAC.sha256(JSON.stringify(newKeys.rsa.privateKey));
            const newEccHash = HMAC.sha256(JSON.stringify(newKeys.ecc.privateKey));

            await conn.query(
                `INSERT INTO key_rotation_log (user_id, rotation_type, old_key_hash, new_key_hash)
                 VALUES (?, 'rsa', ?, ?)`,
                [uid, oldRsaHash, newRsaHash]
            );
            await conn.query(
                `INSERT INTO key_rotation_log (user_id, rotation_type, old_key_hash, new_key_hash)
                 VALUES (?, 'ecc', ?, ?)`,
                [uid, oldEccHash, newEccHash]
            );

            await conn.query(
                `UPDATE users SET
                    encrypted_email = ?,
                    rsa_public_key = ?,
                    rsa_private_key_encrypted = ?,
                    ecc_public_key = ?,
                    ecc_private_key_encrypted = ?
                 WHERE id = ?`,
                [
                    reencryptedEmail,
                    JSON.stringify(newRsaPublic),
                    newRsaPrivateEncrypted,
                    JSON.stringify(newEccPublic),
                    newEccPrivateEncrypted,
                    uid
                ]
            );

            await conn.commit();
            res.json({
                message: 'Keys rotated successfully with data re-encryption.',
                rotated: {
                    email: 1,
                    documents: docs.length,
                    messages: messages.length
                }
            });
        } catch (innerError) {
            await conn.rollback();
            throw innerError;
        } finally {
            conn.release();
        }
        
    } catch (error) {
        console.error('Rotate keys error:', error);
        res.status(500).json({ error: 'Failed to rotate keys safely.' });
    }
};

module.exports = { getAllUsers, deleteUser, getSystemStats, rotateUserKeys };