const express = require('express');
const router = express.Router();
const { adminOnly } = require('../middleware/rbac');
const {
    submitReport,
    getReports,
    updateReportStatus,
} = require('../controllers/reportController');

router.post('/', submitReport);
router.get('/', adminOnly, getReports);
router.put('/:id/status', adminOnly, updateReportStatus);

module.exports = router;