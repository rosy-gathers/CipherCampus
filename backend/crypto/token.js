const jwt = require('jsonwebtoken');

const DEFAULT_EXPIRY = '5m';

function getSecret() {
    const s = process.env.JWT_SECRET;
    if (process.env.NODE_ENV === 'production') {
        if (!s || String(s).length < 32) {
            throw new Error('JWT_SECRET must be set to a random string of at least 32 characters in production.');
        }
    }
    return s || 'dev_only_jwt_secret_change_in_env';
}

/**
 * Standard signed JWT (HS256). Replaces the prior custom HMAC token format.
 */
function generateToken(userId, options = {}) {
    const payload = {
        userId: Number(userId),
        jti: options.jti || '',
    };
    return jwt.sign(payload, getSecret(), {
        expiresIn: options.expiresIn || DEFAULT_EXPIRY,
    });
}

/**
 * Returns normalized payload: userId, iat/exp in milliseconds (for any legacy comparisons).
 */
function verifyToken(token) {
    const payload = jwt.verify(token, getSecret());
    return {
        userId: Number(payload.userId),
        iat: (payload.iat || 0) * 1000,
        exp: (payload.exp || 0) * 1000,
        jti: payload.jti || '',
    };
}

module.exports = { generateToken, verifyToken };
