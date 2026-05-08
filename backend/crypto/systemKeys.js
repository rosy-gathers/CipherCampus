const RSA = require('./rsa');
const fs = require('fs');
const path = require('path');

const KEYS_DIR = path.join(__dirname, '../config');
const PUBLIC_KEY_PATH = path.join(KEYS_DIR, 'system_rsa_public.json');
const PRIVATE_KEY_PATH = path.join(KEYS_DIR, 'system_rsa_private.json');

class SystemKeys {
    constructor() {
        this.rsa = new RSA();
        this.keys = null;
        this.initializeKeys();
    }

    initializeKeys() {
        try {
            if (fs.existsSync(PUBLIC_KEY_PATH) && fs.existsSync(PRIVATE_KEY_PATH)) {
                this.keys = {
                    publicKey: JSON.parse(fs.readFileSync(PUBLIC_KEY_PATH, 'utf8')),
                    privateKey: JSON.parse(fs.readFileSync(PRIVATE_KEY_PATH, 'utf8'))
                };
            } else {
                console.log('Generating System Feed RSA Keys...');
                this.keys = this.rsa.generateKeyPair();
                
                // Ensure directory exists
                if (!fs.existsSync(KEYS_DIR)) {
                    fs.mkdirSync(KEYS_DIR, { recursive: true });
                }
                
                fs.writeFileSync(PUBLIC_KEY_PATH, JSON.stringify(this.keys.publicKey));
                fs.writeFileSync(PRIVATE_KEY_PATH, JSON.stringify(this.keys.privateKey));
            }
        } catch (error) {
            console.error('Error initializing system keys:', error);
            // Fallback to in-memory if file system fails
            this.keys = this.rsa.generateKeyPair();
        }
    }

    getPublicKey() {
        return this.keys.publicKey;
    }

    getPrivateKey() {
        return this.keys.privateKey;
    }
}

module.exports = new SystemKeys();
