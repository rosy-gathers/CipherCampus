const argon2 = require('argon2');

/**
 * Password hashing uses Argon2id (production-oriented).
 * Legacy coursework hashes (custom salted digest) are still verified for backward compatibility.
 */
class SecureHash {
    constructor() {
        this.saltLength = 16;
    }

    generateSalt(length = 16) {
        const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let salt = '';
        for (let i = 0; i < length; i++) {
            salt += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return salt;
    }

    simpleHash(str) {
        let h = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            h = ((h << 5) - h) + char;
            h = h & h;
        }
        return Math.abs(h).toString(16);
    }

    async hashPassword(password) {
        const h = await argon2.hash(password, { type: argon2.argon2id });
        return { hash: h, salt: 'argon2id' };
    }

    async verifyPassword(password, storedHash, storedSalt) {
        if (storedHash && String(storedHash).startsWith('$argon2')) {
            try {
                return await argon2.verify(storedHash, password);
            } catch {
                return false;
            }
        }
        const saltedPassword = storedSalt + password;
        let h = 0;
        for (let i = 0; i < saltedPassword.length; i++) {
            const char = saltedPassword.charCodeAt(i);
            h = ((h << 5) - h) + char;
            h = h & h;
        }
        const computedHash = Math.abs(h).toString(16);
        return computedHash === storedHash;
    }
}

module.exports = SecureHash;
