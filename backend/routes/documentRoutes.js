const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/documentController');

router.post('/upload', upload.single('document'), uploadDocument);
router.get('/folders', listFolders);
router.post('/folders', createFolder);
router.delete('/folders/:folderId', deleteFolder);
router.patch('/:id/folder', moveToFolder);
router.get('/', getDocuments);
router.delete('/shares/:shareId', revokeShare);
router.post('/:id/share', shareDocument);
router.get('/:id/download', downloadDocument);
router.delete('/:id', deleteDocument);

module.exports = router;