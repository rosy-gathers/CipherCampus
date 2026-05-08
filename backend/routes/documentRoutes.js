const express = require('express');
const router = express.Router();
const {
    uploadDocument,
    getDocuments,
    deleteDocument,
    downloadDocument,
    upload,
} = require('../controllers/documentController');

router.post('/upload', upload.single('document'), uploadDocument);
router.get('/', getDocuments);
router.get('/:id/download', downloadDocument);
router.delete('/:id', deleteDocument);

module.exports = router;