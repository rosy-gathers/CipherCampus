const db = require('../config/database');
const HMAC = require('../crypto/hmac');
const { encryptPostEnvelope, decryptStoredContent } = require('../crypto/postEnvelope');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const sessionVault = require('../crypto/sessionVault');
const { usernameFromRow } = require('../utils/usernameDisplay');
const { notify } = require('../services/notificationService');

const hmac = new HMAC(process.env.HMAC_SECRET || 'ciphercampus_document_secret');

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

function parseFolderQuery(raw) {
    if (raw == null || raw === '' || raw === 'all') {
        return { mode: 'all' };
    }
    if (raw === 'unfiled') {
        return { mode: 'unfiled' };
    }
    if (raw === 'shared') {
        return { mode: 'shared' };
    }
    const n = parseInt(raw, 10);
    if (!Number.isNaN(n)) {
        return { mode: 'folder', id: n };
    }
    return { mode: 'all' };
}

async function resolveUploadFolderId(req) {
    const raw = req.body.folderId;
    if (raw === undefined || raw === null || raw === '' || raw === 'null') {
        return null;
    }
    const parsed = parseInt(raw, 10);
    if (Number.isNaN(parsed)) {
        return null;
    }
    const [f] = await db.query('SELECT id FROM document_folders WHERE id = ? AND user_id = ?', [
        parsed,
        req.user.id,
    ]);
    if (f.length === 0) {
        return { error: 'Folder not found.' };
    }
    return parsed;
}

const uploadDocument = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded.' });
        }

        const folderResolve = await resolveUploadFolderId(req);
        if (folderResolve && typeof folderResolve === 'object' && folderResolve.error) {
            return res.status(400).json({ error: folderResolve.error });
        }
        const folderId = folderResolve;

        // Read file content
        const fileContent = fs.readFileSync(req.file.path);
        const contentString = fileContent.toString('base64');

        // Get user's RSA public key
        const [users] = await db.query('SELECT rsa_public_key FROM users WHERE id = ?', [
            req.user.id,
        ]);

        const publicKey = JSON.parse(users[0].rsa_public_key);

        const encryptedContent = encryptPostEnvelope(contentString, publicKey);

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
             (user_id, file_name, encrypted_file_path, file_hmac, folder_id)
             VALUES (?, ?, ?, ?, ?)`,
            [req.user.id, req.file.originalname, encryptedPath, fileHMAC, folderId]
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
        const uid = req.user.id;
        const q = (req.query.q || '').trim();
        const folderSpec = parseFolderQuery(req.query.folder);
        const like = q ? `%${q}%` : null;

        let ownedRows = [];

        if (folderSpec.mode !== 'shared') {
            let ownedSql = `SELECT d.id, d.file_name, d.uploaded_at, d.folder_id, f.name AS folder_name
                FROM documents d
                LEFT JOIN document_folders f ON f.id = d.folder_id
                WHERE d.user_id = ?`;
            const ownedParams = [uid];

            if (folderSpec.mode === 'unfiled') {
                ownedSql += ' AND d.folder_id IS NULL';
            } else if (folderSpec.mode === 'folder') {
                ownedSql += ' AND d.folder_id = ?';
                ownedParams.push(folderSpec.id);
            }

            if (like) {
                ownedSql += ' AND d.file_name LIKE ?';
                ownedParams.push(like);
            }

            ownedSql += ' ORDER BY d.uploaded_at DESC';

            const [owned] = await db.query(ownedSql, ownedParams);
            ownedRows = owned.map((d) => ({
                id: Number(d.id),
                file_name: d.file_name,
                uploaded_at: d.uploaded_at,
                access: 'owned',
                shareId: null,
                folderId: d.folder_id != null ? Number(d.folder_id) : null,
                folderName: d.folder_name || null,
            }));
        }

        let sharedMapped = [];
        if (folderSpec.mode === 'all' || folderSpec.mode === 'unfiled' || folderSpec.mode === 'shared') {
            let sharedSql = `SELECT ds.id AS share_id, d.id AS document_id, ds.original_file_name AS file_name, ds.created_at AS uploaded_at
             FROM document_shares ds
             INNER JOIN documents d ON d.id = ds.document_id
             WHERE ds.shared_with_user_id = ?`;
            const sharedParams = [uid];
            if (like) {
                sharedSql += ' AND ds.original_file_name LIKE ?';
                sharedParams.push(like);
            }
            sharedSql += ' ORDER BY ds.created_at DESC';
            const [sharedRows] = await db.query(sharedSql, sharedParams);
            sharedMapped = sharedRows.map((s) => ({
                id: Number(s.document_id),
                file_name: s.file_name,
                uploaded_at: s.uploaded_at,
                access: 'shared',
                shareId: Number(s.share_id),
                folderId: null,
                folderName: null,
            }));
        }

        res.json([...ownedRows, ...sharedMapped]);
    } catch (error) {
        console.error('Get documents error:', error);
        res.status(500).json({ error: 'Failed to get documents.' });
    }
};

const listFolders = async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT id, name, created_at FROM document_folders WHERE user_id = ? ORDER BY name ASC',
            [req.user.id]
        );
        res.json(
            rows.map((r) => ({
                id: Number(r.id),
                name: r.name,
                created_at: r.created_at,
            }))
        );
    } catch (error) {
        console.error('List folders error:', error);
        res.status(500).json({ error: 'Failed to list folders.' });
    }
};

const createFolder = async (req, res) => {
    try {
        const name = String(req.body.name || '')
            .trim()
            .slice(0, 255);
        if (!name) {
            return res.status(400).json({ error: 'Folder name is required.' });
        }
        try {
            const [result] = await db.query(
                'INSERT INTO document_folders (user_id, name) VALUES (?, ?)',
                [req.user.id, name]
            );
            res.status(201).json({
                id: Number(result.insertId),
                name,
            });
        } catch (e) {
            if (e.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({ error: 'You already have a folder with this name.' });
            }
            throw e;
        }
    } catch (error) {
        console.error('Create folder error:', error);
        res.status(500).json({ error: 'Failed to create folder.' });
    }
};

const deleteFolder = async (req, res) => {
    try {
        const folderId = parseInt(req.params.folderId, 10);
        const [rows] = await db.query(
            'SELECT id FROM document_folders WHERE id = ? AND user_id = ?',
            [folderId, req.user.id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Folder not found.' });
        }
        await db.query('UPDATE documents SET folder_id = NULL WHERE folder_id = ? AND user_id = ?', [
            folderId,
            req.user.id,
        ]);
        await db.query('DELETE FROM document_folders WHERE id = ?', [folderId]);
        res.json({ message: 'Folder deleted. Files are now in Unfiled.' });
    } catch (error) {
        console.error('Delete folder error:', error);
        res.status(500).json({ error: 'Failed to delete folder.' });
    }
};

const moveToFolder = async (req, res) => {
    try {
        const docId = parseInt(req.params.id, 10);
        let folderId = req.body.folderId;
        if (folderId === null || folderId === undefined || folderId === '' || folderId === 'null') {
            folderId = null;
        } else {
            folderId = parseInt(folderId, 10);
            if (Number.isNaN(folderId)) {
                return res.status(400).json({ error: 'Invalid folder.' });
            }
            const [f] = await db.query(
                'SELECT id FROM document_folders WHERE id = ? AND user_id = ?',
                [folderId, req.user.id]
            );
            if (f.length === 0) {
                return res.status(404).json({ error: 'Folder not found.' });
            }
        }

        const [docs] = await db.query('SELECT user_id FROM documents WHERE id = ?', [docId]);
        if (docs.length === 0) {
            return res.status(404).json({ error: 'Document not found.' });
        }
        if (Number(docs[0].user_id) !== Number(req.user.id)) {
            return res.status(403).json({ error: 'Only the owner can move this file.' });
        }

        await db.query('UPDATE documents SET folder_id = ? WHERE id = ?', [folderId, docId]);
        res.json({ message: 'File location updated.' });
    } catch (error) {
        console.error('Move to folder error:', error);
        res.status(500).json({ error: 'Failed to move file.' });
    }
};

const deleteDocument = async (req, res) => {
    try {
        const { id } = req.params;

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

        const [shareFiles] = await db.query(
            'SELECT encrypted_file_path FROM document_shares WHERE document_id = ?',
            [id]
        );
        for (const row of shareFiles) {
            if (row.encrypted_file_path && fs.existsSync(row.encrypted_file_path)) {
                try {
                    fs.unlinkSync(row.encrypted_file_path);
                } catch (_) {
                    /* ignore */
                }
            }
        }

        if (fs.existsSync(docs[0].encrypted_file_path)) {
            fs.unlinkSync(docs[0].encrypted_file_path);
        }

        await db.query('DELETE FROM documents WHERE id = ?', [id]);

        res.json({ message: 'Document deleted successfully.' });
    } catch (error) {
        console.error('Delete document error:', error);
        res.status(500).json({ error: 'Failed to delete document.' });
    }
};

const revokeShare = async (req, res) => {
    try {
        const shareId = parseInt(req.params.shareId, 10);
        const [rows] = await db.query(
            'SELECT encrypted_file_path FROM document_shares WHERE id = ? AND shared_with_user_id = ?',
            [shareId, req.user.id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Share not found.' });
        }
        if (rows[0].encrypted_file_path && fs.existsSync(rows[0].encrypted_file_path)) {
            try {
                fs.unlinkSync(rows[0].encrypted_file_path);
            } catch (_) {
                /* ignore */
            }
        }
        await db.query('DELETE FROM document_shares WHERE id = ? AND shared_with_user_id = ?', [
            shareId,
            req.user.id,
        ]);
        res.json({ message: 'Removed from your shared documents.' });
    } catch (error) {
        console.error('Revoke share error:', error);
        res.status(500).json({ error: 'Failed to remove share.' });
    }
};

const shareDocument = async (req, res) => {
    try {
        const docId = parseInt(req.params.id, 10);
        const targetUserId = parseInt(req.body.userId, 10);

        if (!targetUserId || targetUserId === req.user.id) {
            return res.status(400).json({ error: 'Invalid user to share with.' });
        }

        const [docs] = await db.query(
            'SELECT id, user_id, file_name, encrypted_file_path, file_hmac FROM documents WHERE id = ?',
            [docId]
        );
        if (docs.length === 0) {
            return res.status(404).json({ error: 'Document not found.' });
        }
        if (Number(docs[0].user_id) !== Number(req.user.id)) {
            return res.status(403).json({ error: 'Only the owner can share this document.' });
        }

        const [dup] = await db.query(
            'SELECT id FROM document_shares WHERE document_id = ? AND shared_with_user_id = ?',
            [docId, targetUserId]
        );
        if (dup.length > 0) {
            return res.status(400).json({ error: 'Already shared with this user.' });
        }

        const [recv] = await db.query('SELECT rsa_public_key FROM users WHERE id = ?', [targetUserId]);
        if (recv.length === 0) {
            return res.status(404).json({ error: 'User not found.' });
        }

        const keys = sessionVault.getKeys(req.user.id);
        if (!keys) {
            return res.status(401).json({ error: 'Session keys not found. Please login again to share files.' });
        }

        if (!fs.existsSync(docs[0].encrypted_file_path)) {
            return res.status(404).json({ error: 'Encrypted file missing.' });
        }

        const encryptedContent = fs.readFileSync(docs[0].encrypted_file_path, 'utf8');
        const decryptedBase64 = decryptStoredContent(encryptedContent, keys.rsaPrivateKey);
        if (!hmac.verifyHMAC(decryptedBase64, docs[0].file_hmac)) {
            return res.status(400).json({ error: 'Integrity check failed; cannot share.' });
        }

        const recipientPk = JSON.parse(recv[0].rsa_public_key);
        const reEncrypted = encryptPostEnvelope(decryptedBase64, recipientPk);
        const sharePath = path.join(
            './uploads',
            `enc_share_${docId}_${targetUserId}_${Date.now()}.enc`
        );
        fs.writeFileSync(sharePath, reEncrypted);

        await db.query(
            `INSERT INTO document_shares
             (document_id, owner_id, shared_with_user_id, encrypted_file_path, file_hmac, original_file_name)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [docId, req.user.id, targetUserId, sharePath, docs[0].file_hmac, docs[0].file_name]
        );

        try {
            const [own] = await db.query('SELECT encrypted_username FROM users WHERE id = ?', [req.user.id]);
            const ownerName = usernameFromRow(own[0]?.encrypted_username, req.user.id);
            await notify(
                targetUserId,
                'document_share',
                'Document shared with you',
                `${ownerName} shared "${docs[0].file_name}" with you.`,
                { documentId: docId, fromUserId: req.user.id }
            );
        } catch (e) {
            console.error('Notification (document share) failed:', e);
        }

        res.status(201).json({ message: 'Document shared successfully.' });
    } catch (error) {
        console.error('Share document error:', error);
        res.status(500).json({ error: 'Failed to share document.' });
    }
};

const downloadDocument = async (req, res) => {
    try {
        const { id } = req.params;

        const [docs] = await db.query(
            'SELECT user_id, file_name, encrypted_file_path, file_hmac FROM documents WHERE id = ?',
            [id]
        );

        const keys = sessionVault.getKeys(req.user.id);
        if (!keys) {
            return res.status(401).json({ error: 'Session keys not found. Please login again to decrypt documents.' });
        }

        let fileName;
        let encryptedFilePath;
        let fileHmac;

        if (docs.length > 0 && Number(docs[0].user_id) === Number(req.user.id)) {
            const doc = docs[0];
            fileName = doc.file_name;
            encryptedFilePath = doc.encrypted_file_path;
            fileHmac = doc.file_hmac;
        } else if (req.user.role === 'admin' && docs.length > 0) {
            const doc = docs[0];
            fileName = doc.file_name;
            encryptedFilePath = doc.encrypted_file_path;
            fileHmac = doc.file_hmac;
        } else {
            const [shares] = await db.query(
                `SELECT ds.original_file_name, ds.encrypted_file_path, ds.file_hmac
                 FROM document_shares ds
                 WHERE ds.document_id = ? AND ds.shared_with_user_id = ?`,
                [id, req.user.id]
            );
            if (shares.length === 0) {
                return res.status(404).json({ error: 'Document not found.' });
            }
            fileName = shares[0].original_file_name;
            encryptedFilePath = shares[0].encrypted_file_path;
            fileHmac = shares[0].file_hmac;
        }

        if (!fs.existsSync(encryptedFilePath)) {
            return res.status(404).json({ error: 'Encrypted file missing.' });
        }

        const encryptedContent = fs.readFileSync(encryptedFilePath, 'utf8');
        const decryptedBase64 = decryptStoredContent(encryptedContent, keys.rsaPrivateKey);

        if (!hmac.verifyHMAC(decryptedBase64, fileHmac)) {
            return res.status(400).json({ error: 'Integrity check failed. File may have been tampered with.' });
        }

        const fileBuffer = Buffer.from(decryptedBase64, 'base64');

        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.send(fileBuffer);
    } catch (error) {
        console.error('Download document error:', error);
        res.status(500).json({ error: 'Failed to download document.' });
    }
};

module.exports = {
    uploadDocument,
    getDocuments,
    deleteDocument,
    downloadDocument,
    shareDocument,
    revokeShare,
    upload,
    listFolders,
    createFolder,
    deleteFolder,
    moveToFolder,
};