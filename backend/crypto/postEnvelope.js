const crypto = require('crypto');
const RSA = require('./rsa');

const rsa = new RSA();

const ENVELOPE_VERSION = 3;
const ALG = 'aes-256-gcm';

/**
 * Hybrid envelope: AES-256-GCM for bulk data, RSA (project implementation) wraps the AES key.
 */
function encryptPostEnvelope(plaintext, wrappingPublicKey) {
    const aesKey = crypto.randomBytes(32);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
    const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    const keyB64 = aesKey.toString('base64');
    const wrappedKey = rsa.encrypt(keyB64, wrappingPublicKey);
    return JSON.stringify({
        v: ENVELOPE_VERSION,
        alg: ALG,
        iv: iv.toString('base64'),
        tag: tag.toString('base64'),
        ciphertext: enc.toString('base64'),
        wrappedKey,
    });
}

function decryptPostEnvelope(obj, wrappingPrivateKey) {
    if (!obj || obj.v !== ENVELOPE_VERSION || obj.alg !== ALG) {
        throw new Error('Unsupported content envelope');
    }
    const keyStr = rsa.decrypt(obj.wrappedKey, wrappingPrivateKey);
    const aesKey = Buffer.from(keyStr, 'base64');
    const iv = Buffer.from(obj.iv, 'base64');
    const tag = Buffer.from(obj.tag, 'base64');
    const ciphertext = Buffer.from(obj.ciphertext, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

function decryptStoredContent(storedCiphertext, wrappingPrivateKey) {
    const s = String(storedCiphertext || '').trim();
    if (s.startsWith('{')) {
        try {
            const o = JSON.parse(s);
            if (o.v === ENVELOPE_VERSION && o.alg === ALG) {
                return decryptPostEnvelope(o, wrappingPrivateKey);
            }
        } catch (_) {
            /* fall through to legacy */
        }
    }
    return rsa.decrypt(storedCiphertext, wrappingPrivateKey);
}

module.exports = {
    encryptPostEnvelope,
    decryptPostEnvelope,
    decryptStoredContent,
    ENVELOPE_VERSION,
};
