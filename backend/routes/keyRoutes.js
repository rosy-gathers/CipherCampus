const express = require('express');
const router = express.Router();
const { getMyKeyInfo, getUserPublicKeys, getKeyOverviewForAdmin } = require('../controllers/keyController');

// Key management API: distribution + lifecycle visibility
router.get('/me', getMyKeyInfo);
router.get('/public/:userId', getUserPublicKeys);
router.get('/overview', getKeyOverviewForAdmin);

module.exports = router;
