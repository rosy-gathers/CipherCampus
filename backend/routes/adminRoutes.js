const express = require('express');
const router = express.Router();
const {
    getAllUsers,
    deleteUser,
    getSystemStats,
    rotateUserKeys,
} = require('../controllers/adminController');

router.get('/users', getAllUsers);
router.delete('/users/:id', deleteUser);
router.get('/stats', getSystemStats);
router.post('/rotate-keys/:userId', rotateUserKeys);

module.exports = router;