const db = require('../config/database');
const KeyManager = require('../crypto/keyManager');

const keyManager = new KeyManager();

const getMyKeyInfo = async (req, res) => {
    try {
        const [users] = await db.query(
            'SELECT id, rsa_public_key, ecc_public_key, created_at FROM users WHERE id = ?',
            [req.user.id]
        );
        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found.' });
        }

        const [lastRotRows] = await db.query(
            'SELECT rotated_at FROM key_rotation_log WHERE user_id = ? ORDER BY rotated_at DESC LIMIT 1',
            [req.user.id]
        );

        const user = users[0];
        const rsaPublicKey = JSON.parse(user.rsa_public_key);
        const eccPublicKey = JSON.parse(user.ecc_public_key);
        const lastRotation = lastRotRows[0]?.rotated_at || null;
        const basisDate = lastRotation || user.created_at;

        res.json({
            userId: Number(user.id),
            ...keyManager.buildPublicKeyBundle(rsaPublicKey, eccPublicKey),
            keyLifecycle: {
                generatedAt: user.created_at,
                lastRotationAt: lastRotation,
                rotationPolicyDays: keyManager.keyRotationDays,
                rotationDue: keyManager.needsRotation(basisDate)
            }
        });
    } catch (error) {
        console.error('Get my key info error:', error);
        res.status(500).json({ error: 'Failed to get key information.' });
    }
};

const getUserPublicKeys = async (req, res) => {
    try {
        const targetUserId = Number(req.params.userId);
        if (!targetUserId) {
            return res.status(400).json({ error: 'Invalid user ID.' });
        }

        const [users] = await db.query(
            'SELECT id, rsa_public_key, ecc_public_key FROM users WHERE id = ?',
            [targetUserId]
        );
        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found.' });
        }

        const user = users[0];
        const rsaPublicKey = JSON.parse(user.rsa_public_key);
        const eccPublicKey = JSON.parse(user.ecc_public_key);

        res.json({
            userId: Number(user.id),
            ...keyManager.buildPublicKeyBundle(rsaPublicKey, eccPublicKey)
        });
    } catch (error) {
        console.error('Get user public keys error:', error);
        res.status(500).json({ error: 'Failed to distribute public keys.' });
    }
};

const getKeyOverviewForAdmin = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied. Admin only.' });
        }

        const [users] = await db.query(
            `SELECT id, role, created_at, rsa_public_key, ecc_public_key
             FROM users
             ORDER BY created_at DESC`
        );

        const [rotationRows] = await db.query(
            `SELECT user_id, MAX(rotated_at) AS last_rotation_at
             FROM key_rotation_log
             GROUP BY user_id`
        );
        const rotationMap = new Map(rotationRows.map((r) => [Number(r.user_id), r.last_rotation_at]));

        const overview = users.map((user) => {
            const rsaPublicKey = JSON.parse(user.rsa_public_key);
            const eccPublicKey = JSON.parse(user.ecc_public_key);
            const lastRotationAt = rotationMap.get(Number(user.id)) || null;
            const basisDate = lastRotationAt || user.created_at;

            const bundle = keyManager.buildPublicKeyBundle(rsaPublicKey, eccPublicKey);
            return {
                userId: Number(user.id),
                role: user.role,
                fingerprints: bundle.fingerprints,
                keyLifecycle: {
                    generatedAt: user.created_at,
                    lastRotationAt,
                    rotationPolicyDays: keyManager.keyRotationDays,
                    rotationDue: keyManager.needsRotation(basisDate)
                }
            };
        });

        res.json(overview);
    } catch (error) {
        console.error('Get key overview error:', error);
        res.status(500).json({ error: 'Failed to get key overview.' });
    }
};

module.exports = { getMyKeyInfo, getUserPublicKeys, getKeyOverviewForAdmin };
