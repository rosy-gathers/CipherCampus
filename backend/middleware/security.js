const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
    windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: Number(process.env.AUTH_RATE_LIMIT_MAX) || 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many authentication attempts. Please try again later.' },
});

const strictAuthLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests for this endpoint.' },
});

function securityHeaders() {
    return helmet({
        contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
    });
}

module.exports = { authLimiter, strictAuthLimiter, securityHeaders };
