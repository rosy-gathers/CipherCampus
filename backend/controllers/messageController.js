const db = require('../config/database');
const ECC = require('../crypto/ecc');
const HMAC = require('../crypto/hmac');
const sessionVault = require('../crypto/sessionVault');
const { usernameFromRow } = require('../utils/usernameDisplay');
const { notify } = require('../services/notificationService');

const ecc = new ECC();
const hmac = new HMAC('ciphercampus_secret_key_for_hmac');

/**
 * Store ciphertext as base64 so MySQL/JSON never truncates on NUL bytes or binary-looking chars.
 * Legacy rows omit _enc and use raw UTF-8 strings.
 */
function serializeCipherBlob(blob) {
    if (!blob || !blob.ciphertext) return blob;
    return {
        _enc: 'b64',
        ciphertext: Buffer.from(blob.ciphertext, 'utf8').toString('base64'),
        ephemeralPublicKey: blob.ephemeralPublicKey,
    };
}

/** MySQL/JSON may stringify coordinates; wrong types break ECC and HMAC after decrypt. */
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

const sendMessage = async (req, res) => {
    try {
        const { receiverId, message } = req.body;
        const senderId = req.user.id;
        
        if (parseInt(receiverId) === senderId) {
            return res.status(400).json({ error: 'Cannot send message to yourself.' });
        }

        const [receiverRow] = await db.query('SELECT ecc_public_key FROM users WHERE id = ?', [receiverId]);
        const [senderRow] = await db.query('SELECT ecc_public_key FROM users WHERE id = ?', [senderId]);

        if (receiverRow.length === 0 || senderRow.length === 0) {
            return res.status(404).json({ error: 'Receiver or sender not found.' });
        }

        const receiverPublicKey = JSON.parse(receiverRow[0].ecc_public_key);
        const senderPublicKey = JSON.parse(senderRow[0].ecc_public_key);

        // Encrypt for receiver (privacy) and for sender (so sender can read history + verify HMAC)
        const encryptedForReceiver = ecc.encrypt(message, receiverPublicKey);
        const encryptedForSender = ecc.encrypt(message, senderPublicKey);

        const rxSt = serializeCipherBlob(encryptedForReceiver);
        const sxSt = serializeCipherBlob(encryptedForSender);

        // Ensure sender’s copy round-trips (catches DB/JSON corruption and key drift)
        const senderKeys = sessionVault.getKeys(senderId);
        if (senderKeys) {
            const trial = ecc.decrypt(
                normalizeCipherBlob(sxSt),
                Number(senderKeys.eccPrivateKey)
            );
            if (trial !== message) {
                console.error('ECC sender self-check failed for user', senderId);
                return res.status(500).json({ error: 'Could not verify encrypted message. Please try again.' });
            }
        }

        const payload = JSON.stringify({
            v: 2,
            rx: rxSt,
            sx: sxSt,
        });

        const messageHMAC = hmac.generateHMAC(message);

        await db.query(
            'INSERT INTO messages (sender_id, receiver_id, encrypted_message, message_hmac) VALUES (?, ?, ?, ?)',
            [senderId, receiverId, payload, messageHMAC]
        );

        try {
            const [snd] = await db.query('SELECT encrypted_username FROM users WHERE id = ?', [senderId]);
            const name = usernameFromRow(snd[0]?.encrypted_username, senderId);
            await notify(
                parseInt(receiverId, 10),
                'message',
                'New message',
                `${name} sent you a message.`,
                { fromUserId: senderId }
            );
        } catch (e) {
            console.error('Notification (message) failed:', e);
        }

        res.status(201).json({ message: 'Message sent successfully.' });
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ error: 'Failed to send message.' });
    }
};

const getMessages = async (req, res) => {
    try {
        const { userId } = req.params; // The other user
        const currentUserId = req.user.id;
        
        // Ensure session keys are available
        const keys = sessionVault.getKeys(currentUserId);
        if (!keys) {
            return res.status(401).json({ error: 'Session keys not found, please login again.' });
        }
        
        // Get messages between current user and the specified user
        const [messages] = await db.query(
            `SELECT m.*, 
                    s.id as sender_id, 
                    r.id as receiver_id
             FROM messages m
             JOIN users s ON m.sender_id = s.id
             JOIN users r ON m.receiver_id = r.id
             WHERE (m.sender_id = ? AND m.receiver_id = ?) 
                OR (m.sender_id = ? AND m.receiver_id = ?)
             ORDER BY m.timestamp ASC`,
            [currentUserId, userId, userId, currentUserId]
        );
        
        const cur = Number(currentUserId);

        const processedMessages = messages.map((msg) => {
            let decrypted = '';
            let isValid = false;

            try {
                const parsed = JSON.parse(msg.encrypted_message);
                const recvId = Number(msg.receiver_id);
                const sendId = Number(msg.sender_id);

                const eccSk = Number(keys.eccPrivateKey);

                if (parsed.v === 2) {
                    const rx = normalizeCipherBlob(parsed.rx);
                    const sx = normalizeCipherBlob(parsed.sx);
                    if (recvId === cur) {
                        decrypted = ecc.decrypt(rx, eccSk);
                    } else if (sendId === cur) {
                        decrypted = ecc.decrypt(sx, eccSk);
                    } else {
                        decrypted = '[Unavailable]';
                    }
                } else {
                    const legacy = normalizeCipherBlob(parsed);
                    if (recvId === cur) {
                        decrypted = ecc.decrypt(legacy, eccSk);
                    } else {
                        decrypted = '[Sent — legacy ciphertext not readable by sender]';
                    }
                }

                if (decrypted && !decrypted.startsWith('[')) {
                    isValid = hmac.verifyHMAC(decrypted, msg.message_hmac);
                }
            } catch (e) {
                console.error('Failed to decrypt message', msg.id, e);
                decrypted = 'Error decrypting message';
                isValid = false;
            }

            return {
                id: Number(msg.id),
                sender_id: Number(msg.sender_id),
                receiver_id: Number(msg.receiver_id),
                message: decrypted,
                validIntegrity: isValid,
                timestamp: msg.timestamp,
            };
        });
        
        res.json(processedMessages);
    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ error: 'Failed to get messages.' });
    }
};

const getConversations = async (req, res) => {
    try {
        const currentUserId = req.user.id;
        
        // Get unique users the current user has chatted with
        const [results] = await db.query(
            `SELECT DISTINCT 
                CASE 
                    WHEN m.sender_id = ? THEN m.receiver_id 
                    ELSE m.sender_id 
                END as other_user_id
             FROM messages m
             WHERE m.sender_id = ? OR m.receiver_id = ?`,
            [currentUserId, currentUserId, currentUserId]
        );
        
        const ids = results.map((row) => row.other_user_id);
        if (ids.length === 0) {
            return res.json([]);
        }

        const placeholders = ids.map(() => '?').join(',');
        const [userRows] = await db.query(
            `SELECT id, encrypted_username FROM users WHERE id IN (${placeholders})`,
            ids
        );
        const nameById = {};
        for (const u of userRows) {
            nameById[u.id] = usernameFromRow(u.encrypted_username, u.id);
        }

        const conversations = results.map((row) => {
            const oid = Number(row.other_user_id);
            const resolved =
                nameById[row.other_user_id] ?? nameById[oid] ?? `User ${oid}`;
            return {
                other_user_id: oid,
                other_username: resolved,
                last_message: 'Open chat to view encrypted messages',
            };
        });

        res.json(conversations);
    } catch (error) {
        console.error('Get conversations error:', error);
        res.status(500).json({ error: 'Failed to get conversations.' });
    }
};

const getAllUsersForChat = async (req, res) => {
    try {
        const currentUserId = req.user.id;
        
        const [users] = await db.query(
            'SELECT id, encrypted_username FROM users WHERE id != ?',
            [currentUserId]
        );

        const safeUsers = users.map((u) => ({
            id: Number(u.id),
            username: usernameFromRow(u.encrypted_username, u.id),
        }));
        
        res.json(safeUsers);
    } catch (error) {
        console.error('Get all users error:', error);
        res.status(500).json({ error: 'Failed to fetch users.' });
    }
};

module.exports = { sendMessage, getMessages, getConversations, getAllUsersForChat };