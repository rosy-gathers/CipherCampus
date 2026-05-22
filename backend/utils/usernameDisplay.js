const RSA = require('../crypto/rsa');
const systemKeys = require('../crypto/systemKeys');

const rsa = new RSA();

/** Usernames in DB are encrypted with the system RSA public key (feed/chat display). */
function usernameFromRow(encryptedUsername, userId) {
    if (!encryptedUsername) return `User ${userId}`;
    try {
        return rsa.decrypt(encryptedUsername, systemKeys.getPrivateKey());
    } catch (e) {
        return `User ${userId}`;
    }
}

module.exports = { usernameFromRow };
