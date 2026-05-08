const db = require('../config/database');
const RSA = require('../crypto/rsa');
const HMAC = require('../crypto/hmac');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const sessionVault = require('../crypto/sessionVault');

const rsa = new RSA();
const hmac = new HMAC('ciphercampus_document_secret');

// Configure multer for file upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = './uploads';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });

const uploadDocument = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded.' });
        }
        
        // Read file content
        const fileContent = fs.readFileSync(req.file.path);
        const contentString = fileContent.toString('base64');
        
        // Get user's RSA public key
        const [users] = await db.query(
            'SELECT rsa_public_key FROM users WHERE id = ?',
            [req.user.id]
        );
        
        const publicKey = JSON.parse(users[0].rsa_public_key);
        
        // Encrypt file content with RSA
        const encryptedContent = rsa.encrypt(contentString, publicKey);
        
        // Generate HMAC for integrity
        const fileHMAC = hmac.generateHMAC(contentString);
        
        // Store encrypted content in a separate file
        const encryptedPath = path.join('./uploads', `enc_${req.file.filename}.enc`);
        fs.writeFileSync(encryptedPath, encryptedContent);
        
        // Cleanup unencrypted uploaded file
        fs.unlinkSync(req.file.path);

        // Update document record
        const [result] = await db.query(
            `INSERT INTO documents 
             (user_id, file_name, encrypted_file_path, file_hmac) 
             VALUES (?, ?, ?, ?)`,
            [req.user.id, req.file.originalname, encryptedPath, fileHMAC]
        );
        
        res.status(201).json({
            message: 'Document uploaded and encrypted successfully.',
            documentId: result.insertId
        });
    } catch (error) {
        console.error('Upload document error:', error);
        res.status(500).json({ error: 'Failed to upload document.' });
    }
};

const getDocuments = async (req, res) => {
    try {
        const [documents] = await db.query(
            'SELECT id, file_name, uploaded_at FROM documents WHERE user_id = ?',
            [req.user.id]
        );
        
        res.json(documents);
    } catch (error) {
        console.error('Get documents error:', error);
        res.status(500).json({ error: 'Failed to get documents.' });
    }
};

const deleteDocument = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Get document info
        const [docs] = await db.query(
            'SELECT user_id, encrypted_file_path FROM documents WHERE id = ?',
            [id]
        );
        
        if (docs.length === 0) {
            return res.status(404).json({ error: 'Document not found.' });
        }
        
        if (Number(docs[0].user_id) !== Number(req.user.id) && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied.' });
        }

        // Delete encrypted file
        if (fs.existsSync(docs[0].encrypted_file_path)) {
            fs.unlinkSync(docs[0].encrypted_file_path);
        }
        
        // Delete database record
        await db.query('DELETE FROM documents WHERE id = ?', [id]);
        
        res.json({ message: 'Document deleted successfully.' });
    } catch (error) {
        console.error('Delete document error:', error);
        res.status(500).json({ error: 'Failed to delete document.' });
    }
};

const downloadDocument = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Get document info
        const [docs] = await db.query(
            'SELECT user_id, file_name, encrypted_file_path, file_hmac FROM documents WHERE id = ?',
            [id]
        );
        
        if (docs.length === 0) {
            return res.status(404).json({ error: 'Document not found.' });
        }
        
        if (Number(docs[0].user_id) !== Number(req.user.id) && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied.' });
        }

        const doc = docs[0];
        
        if (!fs.existsSync(doc.encrypted_file_path)) {
            return res.status(404).json({ error: 'Encrypted file missing.' });
        }
        
        const encryptedContent = fs.readFileSync(doc.encrypted_file_path, 'utf8');
        
        const keys = sessionVault.getKeys(req.user.id);
        if (!keys) {
            return res.status(401).json({ error: 'Session keys not found. Please login again to decrypt documents.' });
        }

        const decryptedBase64 = rsa.decrypt(encryptedContent, keys.rsaPrivateKey);
        
        if (!hmac.verifyHMAC(decryptedBase64, doc.file_hmac)) {
            return res.status(400).json({ error: 'Integrity check failed. File may have been tampered with.' });
        }

        const fileBuffer = Buffer.from(decryptedBase64, 'base64');
        
        res.setHeader('Content-Disposition', `attachment; filename="${doc.file_name}"`);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.send(fileBuffer);

    } catch (error) {
        console.error('Download document error:', error);
        res.status(500).json({ error: 'Failed to download document.' });
    }
};

module.exports = { uploadDocument, getDocuments, deleteDocument, downloadDocument, upload };