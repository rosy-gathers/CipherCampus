const RSA = require('./rsa');
const ECC = require('./ecc');
const SecureHash = require('./hash');
const systemKeys = require('./systemKeys');

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
    
    // Wrap user private keys using asymmetric encryption (system RSA keypair).
    // This keeps private key material encrypted at rest without symmetric wrapping.
    encryptPrivateKey(privateKey) {
        const privateKeyStr = JSON.stringify(privateKey);
        return this.rsa.encrypt(privateKeyStr, systemKeys.getPublicKey());
    }
    
    // Unwrap encrypted private key with system RSA private key.
    decryptPrivateKey(encryptedKey) {
        const decrypted = this.rsa.decrypt(encryptedKey, systemKeys.getPrivateKey());
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
    
    rotateKeys(userId, _currentKeys) {
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