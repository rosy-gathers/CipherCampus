const db = require('../config/database');
const logger = require('../logger');

function parsePayload(row) {
    if (row.payload == null) return null;
    if (typeof row.payload === 'object') return row.payload;
    try {
        return JSON.parse(row.payload);
    } catch {
        return null;
    }
}

const listNotifications = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT id, type, title, body, payload, read_at, created_at
             FROM notifications
             WHERE user_id = ?
             ORDER BY created_at DESC
             LIMIT 80`,
            [req.user.id]
        );
        const items = rows.map((r) => ({
            id: Number(r.id),
            type: r.type,
            title: r.title,
            body: r.body,
            payload: parsePayload(r),
            read: r.read_at != null,
            created_at: r.created_at,
        }));
        const unread = items.filter((i) => !i.read).length;
        res.json({ items, unreadCount: unread });
    } catch (e) {
        logger.error({ err: e }, 'listNotifications');
        res.status(500).json({ error: 'Failed to load notifications.' });
    }
};

const markRead = async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const [result] = await db.query(
            'UPDATE notifications SET read_at = NOW() WHERE id = ? AND user_id = ?',
            [id, req.user.id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Notification not found.' });
        }
        res.json({ ok: true });
    } catch (e) {
        logger.error({ err: e }, 'markRead');
        res.status(500).json({ error: 'Failed to update notification.' });
    }
};

const markAllRead = async (req, res) => {
    try {
        await db.query('UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL', [
            req.user.id,
        ]);
        res.json({ ok: true });
    } catch (e) {
        logger.error({ err: e }, 'markAllRead');
        res.status(500).json({ error: 'Failed to mark all read.' });
    }
};

module.exports = { listNotifications, markRead, markAllRead };
