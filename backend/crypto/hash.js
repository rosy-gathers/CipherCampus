// Simple but fast hash implementation for testing
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
    
    // Simple but fast hash function
    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16);
    }
    
    hashPassword(password) {
        const salt = this.generateSalt(this.saltLength);
        const saltedPassword = salt + password;
        const hash = this.simpleHash(saltedPassword);
        return { hash, salt };
    }
    
    verifyPassword(password, storedHash, storedSalt) {
        const saltedPassword = storedSalt + password;
        const computedHash = this.simpleHash(saltedPassword);
        return computedHash === storedHash;
    }
}

module.exports = SecureHash;