const db = require('../config/database');
const RSA = require('../crypto/rsa');
const HMAC = require('../crypto/hmac');
const systemKeys = require('../crypto/systemKeys');

const rsa = new RSA();
const hmac = new HMAC('ciphercampus_report_secret');

/** Wrap ciphertext so commas/long digits are never corrupted in MySQL TEXT. */
function encodeReportForDb(cipherCommaSeparated) {
    return `b64:${Buffer.from(cipherCommaSeparated, 'utf8').toString('base64')}`;
}

function decodeReportFromDb(stored) {
    if (!stored) return '';
    if (typeof stored === 'string' && stored.startsWith('b64:')) {
        return Buffer.from(stored.slice(4), 'base64').toString('utf8');
    }
    return stored;
}

const submitReport = async (req, res) => {
    try {
        const { reportText, anonymous } = req.body;
        const isAnonymous = anonymous !== false;

        // Anonymous: no reporter_id in DB — only admin sees decrypted text; identity is not stored.
        const reporterId = isAnonymous ? null : req.user.id;

        // Use the same system RSA keypair as the feed so decryption always matches server-side keys.
        // Admin-only access is enforced by the API (not by which RSA key is used).
        const encryptedReport = rsa.encrypt(reportText, systemKeys.getPublicKey());
        const storedCipher = encodeReportForDb(encryptedReport);

        // Generate HMAC for integrity
        const reportHMAC = hmac.generateHMAC(reportText);

        // Store report
        const [result] = await db.query(
            `INSERT INTO reports 
             (reporter_id, encrypted_report, report_hmac, status) 
             VALUES (?, ?, ?, 'pending')`,
            [reporterId, storedCipher, reportHMAC]
        );
        
        res.status(201).json({
            message: isAnonymous ? 'Report submitted anonymously.' : 'Report submitted successfully.',
            reportId: result.insertId
        });
    } catch (error) {
        console.error('Submit report error:', error);
        res.status(500).json({ error: 'Failed to submit report: ' + error.message });
    }
};

const sessionVault = require('../crypto/sessionVault');

const getReports = async (req, res) => {
    try {
        // Only admin can view reports
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied. Admin only.' });
        }
        
        const [reports] = await db.query(
            `SELECT r.*, u.encrypted_username AS reporter_encrypted_username
             FROM reports r
             LEFT JOIN users u ON r.reporter_id = u.id
             ORDER BY r.created_at DESC`
        );
        
        const keys = sessionVault.getKeys(req.user.id);
        if (!keys) {
            return res.status(401).json({ error: 'Session keys not found, please login again.' });
        }

        const processedReports = reports.map(report => {
            let actualContent = 'Error decrypting report';
            let validIntegrity = false;

            const cipherRaw = decodeReportFromDb(report.encrypted_report);

            try {
                // Primary: system key (current submit path)
                actualContent = rsa.decrypt(cipherRaw, systemKeys.getPrivateKey());
                validIntegrity = hmac.verifyHMAC(actualContent, report.report_hmac);
            } catch (e) {
                console.error('Decrypt report (system key)', report.id, e.message);
            }

            // Legacy: encrypted with admin’s DB public key — decrypt with this admin’s session private key
            if (!validIntegrity && keys && keys.rsaPrivateKey) {
                try {
                    const legacyPlain = rsa.decrypt(cipherRaw, keys.rsaPrivateKey);
                    if (hmac.verifyHMAC(legacyPlain, report.report_hmac)) {
                        actualContent = legacyPlain;
                        validIntegrity = true;
                    }
                } catch (e) {
                    console.error('Decrypt report (legacy admin key)', report.id, e.message);
                }
            }

            let reporterName = 'Anonymous';
            if (report.reporter_id) {
                try {
                    if (report.reporter_encrypted_username) {
                        reporterName = rsa.decrypt(
                            report.reporter_encrypted_username,
                            systemKeys.getPrivateKey()
                        );
                    } else {
                        reporterName = `User ${report.reporter_id}`;
                    }
                } catch (e) {
                    reporterName = `User ${report.reporter_id}`;
                }
            }

            return {
                id: report.id,
                reporter_id: report.reporter_id,
                reporter_name: reporterName,
                is_anonymous: !report.reporter_id,
                report_text: actualContent,
                status: report.status,
                validIntegrity: validIntegrity,
                created_at: report.created_at
            };
        });
        
        res.json(processedReports);
    } catch (error) {
        console.error('Get reports error:', error);
        res.status(500).json({ error: 'Failed to get reports.' });
    }
};

const updateReportStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied. Admin only.' });
        }
        
        await db.query(
            'UPDATE reports SET status = ? WHERE id = ?',
            [status, id]
        );
        
        res.json({ message: 'Report status updated successfully.' });
    } catch (error) {
        console.error('Update report status error:', error);
        res.status(500).json({ error: 'Failed to update report status.' });
    }
};

module.exports = { submitReport, getReports, updateReportStatus };