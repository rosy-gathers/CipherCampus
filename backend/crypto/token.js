// Lightweight signed-token module that replaces `jsonwebtoken`.
// The signature uses the from-scratch HMAC-SHA-256 in `crypto/hmac.js`,
// so no built-in framework crypto is required to issue or verify tokens.
//
// Token format:
//     base64url(JSON payload) + "." + HMAC-SHA-256(payload, secret)
//
// The hex digest is appended directly (no base64) because the HMAC class
// already returns a hex string. The interface mirrors what the previous
// jsonwebtoken usage relied on (`{ userId, iat, exp, jti }`).

const HMAC = require('./hmac');

const DEFAULT_SECRET = 'ciphercampus_super_secret_key_2026';
const DEFAULT_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes, matches old JWT_EXPIRY

function getSecret() {
    return process.env.JWT_SECRET || DEFAULT_SECRET;
}

function base64UrlEncode(str) {
    return Buffer.from(str, 'utf8')
        .toString('base64')
        .replace(/=+$/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

function base64UrlDecode(str) {
    let padded = String(str).replace(/-/g, '+').replace(/_/g, '/');
    while (padded.length % 4 !== 0) padded += '=';
    return Buffer.from(padded, 'base64').toString('utf8');
}

function sign(encodedPayload) {
    const hmac = new HMAC(getSecret());
    return hmac.generateHMAC(encodedPayload);
}

function generateToken(userId, options = {}) {
    const now = Date.now();
    const payload = {
        userId: Number(userId),
        iat: now,
        exp: now + (options.expiresInMs || DEFAULT_EXPIRY_MS),
        jti: options.jti || ''
    };
    const encoded = base64UrlEncode(JSON.stringify(payload));
    const signature = sign(encoded);
    return `${encoded}.${signature}`;
}

function verifyToken(token) {
    if (!token || typeof token !== 'string') {
        throw new Error('Invalid token.');
    }
    const parts = token.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
        throw new Error('Invalid token format.');
    }
    const [encoded, signature] = parts;
    const expected = sign(encoded);
    if (signature !== expected) {
        throw new Error('Invalid token signature.');
    }
    let payload;
    try {
        payload = JSON.parse(base64UrlDecode(encoded));
    } catch (e) {
        throw new Error('Invalid token payload.');
    }
    if (payload.exp && Date.now() > Number(payload.exp)) {
        throw new Error('Token expired.');
    }
    return payload;
}

module.exports = { generateToken, verifyToken };
