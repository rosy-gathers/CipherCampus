const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const {
    register,
    login,
    resendOTP,
    verify2FA,
    logout,
    getProfile,
    updateProfile,
    resetPassword,
    deleteAccount,
} = require('../controllers/authController');

router.post('/register', register);
router.post('/login', login);
router.post('/resend-otp', resendOTP);
router.post('/verify-2fa', verify2FA);
router.post('/logout', authMiddleware, logout);
router.get('/profile', authMiddleware, getProfile);
router.put('/profile', authMiddleware, updateProfile);
router.put('/reset-password', authMiddleware, resetPassword);
router.delete('/account', authMiddleware, deleteAccount);

module.exports = router;