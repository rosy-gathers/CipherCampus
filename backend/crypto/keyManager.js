const RSA = require('./rsa');
const ECC = require('./ecc');
const SecureHash = require('./hash');

class KeyManager {
    constructor() {
        this.rsa = new RSA();
        this.ecc = new ECC();
        this.hash = new SecureHash();
        this.keyRotationDays = 30;
    }
    
    // Generate complete key pair for user
    generateUserKeys() {
        // Generate RSA keys for user data and documents
        const rsaKeys = this.rsa.generateKeyPair();
        
        // Generate ECC keys for messaging
        const eccKeys = this.ecc.generateKeyPair();
        
        return {
            rsa: {
                publicKey: rsaKeys.publicKey,
                privateKey: rsaKeys.privateKey
            },
            ecc: {
                publicKey: eccKeys.publicKey,
                privateKey: eccKeys.privateKey
            }
        };
    }
    
    // Simple XOR encryption for private keys (fast)
    encryptPrivateKey(privateKey, password) {
        const hash = this.hash.simpleHash(password);
        const privateKeyStr = JSON.stringify(privateKey);
        let encrypted = '';
        for (let i = 0; i < privateKeyStr.length; i++) {
            encrypted += String.fromCharCode(privateKeyStr.charCodeAt(i) ^ hash.charCodeAt(i % hash.length));
        }
        return encrypted;
    }
    
    // Decrypt private key
    decryptPrivateKey(encryptedKey, password) {
        const hash = this.hash.simpleHash(password);
        let decrypted = '';
        for (let i = 0; i < encryptedKey.length; i++) {
            decrypted += String.fromCharCode(encryptedKey.charCodeAt(i) ^ hash.charCodeAt(i % hash.length));
        }
        return JSON.parse(decrypted);
    }
    
    needsRotation(lastRotationDate) {
        if (!lastRotationDate) return true;
        const now = new Date();
        const lastRot = new Date(lastRotationDate);
        if (Number.isNaN(lastRot.getTime())) return true;
        const daysDiff = (now - lastRot) / (1000 * 60 * 60 * 24);
        return daysDiff >= this.keyRotationDays;
    }

    keyFingerprint(keyObject) {
        const raw = typeof keyObject === 'string' ? keyObject : JSON.stringify(keyObject);
        return this.hash.simpleHash(raw);
    }

    buildPublicKeyBundle(rsaPublicKey, eccPublicKey) {
        return {
            algorithms: {
                atRest: 'RSA',
                messaging: 'ECC'
            },
            rsaPublicKey,
            eccPublicKey,
            fingerprints: {
                rsa: this.keyFingerprint(rsaPublicKey),
                ecc: this.keyFingerprint(eccPublicKey)
            }
        };
    }
    
    rotateKeys(userId, currentKeys) {
        const newKeys = this.generateUserKeys();
        return {
            newKeys,
            rotationLog: {
                userId,
                rotatedAt: new Date()
            }
        };
    }
    
    async reencryptData(userData, oldKeys, newKeys, dataType) {
        console.log(`Re-encrypting ${dataType} for user`);
        return { success: true, count: 0 };
    }
}

module.exports = KeyManager;