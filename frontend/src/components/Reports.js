import React, { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { reportAPI } from '../services/api';

const Reports = () => {
    const [reportText, setReportText] = useState('');
    const [anonymous, setAnonymous] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');
    const user = JSON.parse(localStorage.getItem('user') || '{}');

    if (user.role === 'admin') {
        return <Navigate to="/admin" replace />;
    }

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!reportText.trim()) {
            setError('Please enter report details');
            return;
        }

        try {
            setSubmitting(true);
            await reportAPI.submit({
                reportText: reportText,
                anonymous: anonymous,
            });
            setSuccess(anonymous ? 'Anonymous report submitted successfully.' : 'Report submitted successfully.');
            setReportText('');
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError('Failed to submit report');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="reports-container">
            <div className="reports-header">
                <h1>Anonymous Reporting</h1>
                <p>Report concerns securely — content is encrypted for administrators only.</p>
            </div>

            <div className="report-form-container">
                <form onSubmit={handleSubmit} className="report-form">
                    <div className="form-group">
                        <label htmlFor="report-details">Report details</label>
                        <textarea
                            id="report-details"
                            value={reportText}
                            onChange={(e) => setReportText(e.target.value)}
                            placeholder="Describe the issue… (encrypted with the admin RSA key)"
                            rows="8"
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label className="checkbox-label">
                            <input
                                type="checkbox"
                                checked={anonymous}
                                onChange={(e) => setAnonymous(e.target.checked)}
                            />
                            Submit anonymously (your account is not linked to this report)
                        </label>
                    </div>

                    {!anonymous && (
                        <div className="info-box">
                            <p>Your username is stored only for admins to see who filed the report. Other users never see reports.</p>
                        </div>
                    )}

                    <button type="submit" disabled={submitting}>
                        {submitting ? 'Submitting…' : '📢 Submit report'}
                    </button>
                </form>

                {success && <div className="success">{success}</div>}
                {error && <div className="error">{error}</div>}

                <div className="security-notice">
                    <h3>Privacy</h3>
                    <p>✅ Reports list and decryption are <strong>admin-only</strong>.</p>
                    <p>✅ Anonymous reports do not store your user id — admins see “Anonymous” only.</p>
                    <p>✅ HMAC verifies the report was not altered in storage.</p>
                    {user.role === 'admin' && (
                        <p>
                            <Link to="/admin">Open Admin Panel</Link> to review and update report status.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Reports;
