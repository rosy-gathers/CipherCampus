const express = require('express');
const router = express.Router();
const {
    sendMessage,
    getMessages,
    getConversations,
    getAllUsersForChat
} = require('../controllers/messageController');

router.post('/', sendMessage);
router.get('/users/all', getAllUsersForChat);
router.get('/conversations', getConversations);
router.get('/:userId', getMessages);

module.exports = router;