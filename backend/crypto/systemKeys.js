const RSA = require('./rsa');
const fs = require('fs');
const path = require('path');

const DEFAULT_KEYS_DIR = path.join(__dirname, '../config');

function resolveKeysDir() {
    const fromEnv = process.env.CIPHERCAMPUS_SYSTEM_KEYS_DIR;
    if (fromEnv && String(fromEnv).trim()) {
        return path.resolve(String(fromEnv).trim());
    }
    return DEFAULT_KEYS_DIR;
}

/**
 * Optional: inject keys from environment (e.g. Docker secrets, CI) as JSON strings.
 * Both must be set together. Same shape as files: { e, n } and { d, n }.
 */
function loadKeysFromEnv() {
    const pub = process.env.CIPHERCAMPUS_SYSTEM_RSA_PUBLIC_JSON;
    const prv = process.env.CIPHERCAMPUS_SYSTEM_RSA_PRIVATE_JSON;
    if (pub && prv) {
        return {
            publicKey: JSON.parse(pub),
            privateKey: JSON.parse(prv),
        };
    }
    if (pub || prv) {
        throw new Error(
            'Set both CIPHERCAMPUS_SYSTEM_RSA_PUBLIC_JSON and CIPHERCAMPUS_SYSTEM_RSA_PRIVATE_JSON, or neither.'
        );
    }
    return null;
}

function assertKeyShape(keys) {
    const { publicKey, privateKey } = keys;
    if (!publicKey || typeof publicKey.e !== 'number' || typeof publicKey.n !== 'number') {
        throw new Error('Invalid system RSA public key (expected numeric e, n).');
    }
    if (!privateKey || typeof privateKey.d !== 'number' || typeof privateKey.n !== 'number') {
        throw new Error('Invalid system RSA private key (expected numeric d, n).');
    }
}

function chmodPrivateKeyOnly(filePath) {
    try {
        if (process.platform !== 'win32') {
            fs.chmodSync(filePath, 0o600);
        }
    } catch (_) {
        // Non-fatal (e.g. some FS / containers)
    }
}

class SystemKeys {
    constructor() {
        this.rsa = new RSA();
        this.keys = null;
        this.initializeKeys();
    }

    initializeKeys() {
        const fromEnv = loadKeysFromEnv();
        if (fromEnv) {
            assertKeyShape(fromEnv);
            this.keys = fromEnv;
            return;
        }

        const keysDir = resolveKeysDir();
        const publicKeyPath = path.join(keysDir, 'system_rsa_public.json');
        const privateKeyPath = path.join(keysDir, 'system_rsa_private.json');

        try {
            if (fs.existsSync(publicKeyPath) && fs.existsSync(privateKeyPath)) {
                const publicKey = JSON.parse(fs.readFileSync(publicKeyPath, 'utf8'));
                const privateKey = JSON.parse(fs.readFileSync(privateKeyPath, 'utf8'));
                assertKeyShape({ publicKey, privateKey });
                this.keys = { publicKey, privateKey };
                return;
            }

            console.warn(
                '[CipherCampus] First run: generating system RSA keypair. Persist these files outside version control; ' +
                    'rotating them invalidates all data wrapped with the old key.'
            );
            if (!fs.existsSync(keysDir)) {
                fs.mkdirSync(keysDir, { recursive: true, mode: 0o700 });
            }

            this.keys = this.rsa.generateKeyPair();
            assertKeyShape(this.keys);

            fs.writeFileSync(publicKeyPath, JSON.stringify(this.keys.publicKey), { encoding: 'utf8', mode: 0o644 });
            fs.writeFileSync(privateKeyPath, JSON.stringify(this.keys.privateKey), { encoding: 'utf8', mode: 0o600 });
            chmodPrivateKeyOnly(privateKeyPath);
        } catch (err) {
            console.error('Fatal: could not initialize system RSA keys:', err.message);
            throw new Error(
                'System RSA keys are required. Options: (1) provide files system_rsa_public.json and ' +
                    'system_rsa_private.json under CIPHERCAMPUS_SYSTEM_KEYS_DIR or backend/config/, ' +
                    '(2) set CIPHERCAMPUS_SYSTEM_RSA_PUBLIC_JSON and CIPHERCAMPUS_SYSTEM_RSA_PRIVATE_JSON. ' +
                    'In-memory fallback is disabled so ciphertext and wrapped keys stay consistent across restarts.'
            );
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
