const express = require('express');
const router = express.Router();
const { listNotifications, markRead, markAllRead } = require('../controllers/notificationController');

router.get('/', listNotifications);
router.patch('/:id/read', markRead);
router.post('/read-all', markAllRead);

module.exports = router;
