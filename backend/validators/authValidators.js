const { body, validationResult } = require('express-validator');
const { problem } = require('../middleware/problemJson');

const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const msg = errors.array()[0]?.msg || 'Validation failed.';
        return problem(res, 400, 'Validation failed', msg, 'validation-error', {
            details: errors.array(),
        });
    }
    next();
};

const registerRules = [
    body('username').trim().notEmpty().withMessage('Username is required.'),
    body('username').isLength({ max: 100 }).withMessage('Username too long.'),
    body('email').trim().isEmail().withMessage('Valid email is required.'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters.'),
];

const loginRules = [
    body('username').trim().notEmpty().withMessage('Username is required.'),
    body('password').notEmpty().withMessage('Password is required.'),
];

const verify2FARules = [
    body('userId').notEmpty().withMessage('User ID is required.'),
    body('otp').trim().isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits.'),
];

const resendOtpRules = [body('userId').notEmpty().withMessage('User ID is required.')];

module.exports = {
    registerRules,
    loginRules,
    verify2FARules,
    resendOtpRules,
    handleValidationErrors,
};
