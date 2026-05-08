// In-memory vault for decrypted private keys to avoid sending them to frontend
// Keys are stored by user ID or session token and expire when session expires

class SessionVault {
    constructor() {
        this.vault = new Map();
        
        // Clean up expired keys every hour
        setInterval(() => this.cleanup(), 60 * 60 * 1000);
    }
    
    // Store keys for a user (indexed by userId)
    // In a real app, you might index by a secure session token
    storeKeys(userId, keys) {
        this.vault.set(userId.toString(), {
            ...keys,
            lastAccessed: Date.now()
        });
        console.log(`Stored private keys in vault for user ${userId}`);
    }
    
    getKeys(userId) {
        const keys = this.vault.get(userId.toString());
        if (keys) {
            keys.lastAccessed = Date.now();
            return keys;
        }
        return null;
    }
    
    removeKeys(userId) {
        this.vault.delete(userId.toString());
    }
    
    cleanup() {
        const now = Date.now();
        // Remove keys not accessed in 24 hours
        const EXPIRY = 24 * 60 * 60 * 1000; 
        
        for (const [userId, data] of this.vault.entries()) {
            if (now - data.lastAccessed > EXPIRY) {
                this.vault.delete(userId);
            }
        }
    }
}

// Export a singleton instance
module.exports = new SessionVault();
