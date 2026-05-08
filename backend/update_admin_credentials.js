const db = require('./config/database');
const SecureHash = require('./crypto/hash');
const KeyManager = require('./crypto/keyManager');
const RSA = require('./crypto/rsa');

async function updateAdminCredentials() {
    const targetEmail = 'your mail';
    const targetPassword = 'your password';

    const hash = new SecureHash();
    const keyManager = new KeyManager();
    const rsa = new RSA();

    try {
        const [admins] = await db.query(
            'SELECT id FROM users WHERE role = ? ORDER BY id ASC LIMIT 1',
            ['admin']
        );

        let adminId;
        if (admins.length === 0) {
            const [users] = await db.query('SELECT id FROM users ORDER BY id ASC LIMIT 1');
            if (users.length === 0) {
                console.error('No users found. Register one account first, then run this script again.');
                process.exit(1);
            }
            adminId = Number(users[0].id);
            await db.query('UPDATE users SET role = ? WHERE id = ?', ['admin', adminId]);
            console.log(`No admin existed; promoted user id=${adminId} to admin.`);
        } else {
            adminId = Number(admins[0].id);
        }
        const keys = keyManager.generateUserKeys();
        const encryptedEmail = rsa.encrypt(targetEmail, keys.rsa.publicKey);
        const emailHash = hash.simpleHash(targetEmail.toLowerCase());
        const { hash: passwordHash, salt: passwordSalt } = hash.hashPassword(targetPassword);
        const encryptedRSAPrivateKey = keyManager.encryptPrivateKey(keys.rsa.privateKey, targetPassword);
        const encryptedECCPrivateKey = keyManager.encryptPrivateKey(keys.ecc.privateKey, targetPassword);

        await db.query(
            `UPDATE users
             SET email = ?,
                 encrypted_email = ?,
                 password_hash = ?,
                 password_salt = ?,
                 rsa_public_key = ?,
                 rsa_private_key_encrypted = ?,
                 ecc_public_key = ?,
                 ecc_private_key_encrypted = ?
             WHERE id = ?`,
            [
                emailHash,
                encryptedEmail,
                passwordHash,
                passwordSalt,
                JSON.stringify(keys.rsa.publicKey),
                encryptedRSAPrivateKey,
                JSON.stringify(keys.ecc.publicKey),
                encryptedECCPrivateKey,
                adminId
            ]
        );

        console.log(`Admin user updated (id=${adminId}).`);
        console.log(`Email: ${targetEmail}`);
        console.log('Password: your password');
    } catch (error) {
        console.error('Failed to update admin credentials:', error.message);
        process.exit(1);
    } finally {
        process.exit(0);
    }
}

updateAdminCredentials();
