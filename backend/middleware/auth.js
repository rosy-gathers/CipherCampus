const db = require('../config/database');
const tokenLib = require('../crypto/token');
const HMAC = require('../crypto/hmac');
const { problem } = require('./problemJson');

const normalizeIp = (ip) => {
    if (!ip) return '';
    if (ip.startsWith('::ffff:')) return ip.replace('::ffff:', '');
    return ip;
};

const getClientIp = (req) => {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
        return normalizeIp(forwarded.split(',')[0].trim());
    }
    return normalizeIp(req.ip || req.socket?.remoteAddress || '');
};

const getUserAgentSignature = (req) => {
    const ua = req.headers['user-agent'] || '';
    return String(ua).slice(0, 255);
};

const hashToken = (token) => HMAC.sha256(String(token));

const authMiddleware = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1] || req.cookies?.accessToken;
    
    if (!token) {
        return problem(res, 401, 'Unauthorized', 'Access denied. No token provided.', 'unauthorized');
    }
    
    try {
        const decoded = tokenLib.verifyToken(token);
        const tokenHash = hashToken(token);
        const currentIp = getClientIp(req);
        const currentUa = getUserAgentSignature(req);
        
        // Check if session exists in database (token hash now; raw token fallback for old rows)
        const [sessions] = await db.query(
            'SELECT * FROM sessions WHERE (session_token = ? OR session_token = ?) AND expires_at > NOW()',
            [tokenHash, token]
        );
        
        if (sessions.length === 0) {
            return problem(res, 401, 'Unauthorized', 'Session expired or invalid.', 'session-invalid');
        }

        const session = sessions[0];
        if (Number(session.user_id) !== Number(decoded.userId)) {
            return problem(res, 401, 'Unauthorized', 'Session user mismatch.', 'session-mismatch');
        }

        // Basic token-binding checks to reduce session hijacking risk.
        if (session.ip_address && currentIp && session.ip_address !== currentIp) {
            await db.query('DELETE FROM sessions WHERE id = ?', [session.id]);
            return problem(res, 401, 'Unauthorized', 'Session validation failed (IP mismatch).', 'session-binding');
        }
        if (session.user_agent && currentUa && session.user_agent !== currentUa) {
            await db.query('DELETE FROM sessions WHERE id = ?', [session.id]);
            return problem(res, 401, 'Unauthorized', 'Session validation failed (device mismatch).', 'session-binding');
        }
        
        // Get user details
        const [users] = await db.query(
            'SELECT id, username, email, role FROM users WHERE id = ?',
            [decoded.userId]
        );
        
        if (users.length === 0) {
            return problem(res, 401, 'Unauthorized', 'User not found.', 'user-not-found');
        }
        
        req.user = users[0];
        req.user.id = Number(req.user.id);
        req.sessionToken = token;
        req.sessionTokenHash = tokenHash;
        next();
    } catch (error) {
        return problem(res, 401, 'Unauthorized', 'Invalid token.', 'invalid-token');
    }
};

const generateToken = (userId, options = {}) => tokenLib.generateToken(userId, options);

module.exports = { authMiddleware, generateToken, hashToken, getClientIp, getUserAgentSignature };