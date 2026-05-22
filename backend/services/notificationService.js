const db = require('../config/database');

/**
 * @param {number} userId
 * @param {'message'|'document_share'} type
 * @param {string} title
 * @param {string} [body]
 * @param {Record<string, unknown>|null} [payload]
 */
async function notify(userId, type, title, body = '', payload = null) {
    const payloadJson = payload ? JSON.stringify(payload) : null;
    await db.query(
        'INSERT INTO notifications (user_id, type, title, body, payload) VALUES (?, ?, ?, ?, ?)',
        [userId, type, title, body || '', payloadJson]
    );
}

module.exports = { notify };
