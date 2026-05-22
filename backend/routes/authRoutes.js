const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { strictAuthLimiter } = require('../middleware/security');
const {
    registerRules,
    loginRules,
    verify2FARules,
    resendOtpRules,
    handleValidationErrors,
} = require('../validators/authValidators');
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
    uploadAvatar,
    getAvatar,
    deleteAvatar,
    avatarUpload,
} = require('../controllers/authController');

router.post('/register', strictAuthLimiter, registerRules, handleValidationErrors, register);
router.post('/login', strictAuthLimiter, loginRules, handleValidationErrors, login);
router.post('/resend-otp', strictAuthLimiter, resendOtpRules, handleValidationErrors, resendOTP);
router.post('/verify-2fa', strictAuthLimiter, verify2FARules, handleValidationErrors, verify2FA);
router.post('/logout', authMiddleware, logout);
router.get('/profile', authMiddleware, getProfile);
router.post('/avatar', authMiddleware, avatarUpload.single('avatar'), uploadAvatar);
router.get('/avatar/:userId', authMiddleware, getAvatar);
router.delete('/avatar', authMiddleware, deleteAvatar);
router.put('/profile', authMiddleware, updateProfile);
router.put('/reset-password', authMiddleware, resetPassword);
router.delete('/account', authMiddleware, deleteAccount);

module.exports = router;