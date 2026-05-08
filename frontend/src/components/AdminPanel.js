import React, { useState, useEffect } from 'react';
import { adminAPI, reportAPI } from '../services/api';

/** DB/API times are UTC; show a readable local date/time for the admin's browser. */
function formatLastRotation(value) {
    if (value == null || value === '') return 'N/A';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'medium',
    });
}

const AdminPanel = () => {
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    const [users, setUsers] = useState([]);
    const [reports, setReports] = useState([]);
    const [stats, setStats] = useState(null);
    const [keyOverview, setKeyOverview] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('users');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            const [usersRes, reportsRes, statsRes] = await Promise.all([
                adminAPI.getAllUsers(),
                reportAPI.getAll(),
                adminAPI.getSystemStats(),
            ]);
            setUsers(usersRes.data);
            setReports(reportsRes.data);
            setStats(statsRes.data);
            try {
                const keyRes = await adminAPI.getKeyOverview();
                setKeyOverview(keyRes.data || []);
            } catch (keyErr) {
                console.error('Failed to load key overview', keyErr);
                setKeyOverview([]);
            }
        } catch (err) {
            console.error('Failed to load admin data', err);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteUser = async (userId) => {
        if (window.confirm('Are you sure you want to delete this user? All their data will be deleted.')) {
            try {
                await adminAPI.deleteUser(userId);
                await loadData();
            } catch (err) {
                console.error('Failed to delete user', err);
            }
        }
    };

    const handleRotateKeys = async (userId) => {
        if (Number(currentUser.id) !== Number(userId)) {
            alert('For security, each user must rotate their own keys with their own password.');
            return;
        }

        if (window.confirm('Rotate encryption keys for this user?')) {
            try {
                const currentPassword = window.prompt('Enter your CURRENT password to rotate your keys safely:');
                if (!currentPassword) {
                    return;
                }
                await adminAPI.rotateKeys(userId, { currentPassword });
                alert('Keys rotated and data re-encrypted successfully.');
                await loadData();
            } catch (err) {
                console.error('Failed to rotate keys', err);
                alert(err?.response?.data?.error || 'Failed to rotate keys safely.');
            }
        }
    };

    const updateReportStatus = async (id, status) => {
        try {
            await reportAPI.updateStatus(id, status);
            await loadData();
        } catch (err) {
            console.error('Failed to update status', err);
        }
    };

    if (loading) return <div className="loading">Loading admin panel...</div>;

    const shortFp = (value) => {
        if (!value) return 'n/a';
        const v = String(value);
        return v.length > 12 ? `${v.slice(0, 6)}...${v.slice(-6)}` : v;
    };

    return (
        <div className="admin-panel">
            <div className="admin-header">
                <h1>Admin Dashboard</h1>
                <p>Manage users, view reports, and monitor system security</p>
            </div>

            {stats && (
                <div className="stats-grid">
                    <div className="stat-card">
                        <h3>Total Users</h3>
                        <p className="stat-number">{stats.totalUsers}</p>
                    </div>
                    <div className="stat-card">
                        <h3>Total Posts</h3>
                        <p className="stat-number">{stats.totalPosts}</p>
                    </div>
                    <div className="stat-card">
                        <h3>Total Reports</h3>
                        <p className="stat-number">{stats.totalReports}</p>
                    </div>
                    <div className="stat-card">
                        <h3>Pending Reports</h3>
                        <p className="stat-number">{stats.pendingReports}</p>
                    </div>
                </div>
            )}

            <div className="admin-tabs">
                <button className={activeTab === 'users' ? 'active' : ''} onClick={() => setActiveTab('users')}>
                    👥 Manage Users
                </button>
                <button className={activeTab === 'reports' ? 'active' : ''} onClick={() => setActiveTab('reports')}>
                    📋 View Reports
                </button>
                <button className={activeTab === 'security' ? 'active' : ''} onClick={() => setActiveTab('security')}>
                    🔒 Security Settings
                </button>
            </div>

            {activeTab === 'users' && (
                <div className="users-section">
                    <h2>Users List</h2>
                    <table className="users-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Username</th>
                                <th>Email</th>
                                <th>Role</th>
                                <th>Joined</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map((user) => (
                                <tr key={user.id}>
                                    <td>{user.id}</td>
                                    <td>{user.username}</td>
                                    <td>{user.email}</td>
                                    <td>{user.role}</td>
                                    <td>{new Date(user.created_at).toLocaleDateString()}</td>
                                    <td>
                                        {Number(currentUser.id) === Number(user.id) ? (
                                            <button onClick={() => handleRotateKeys(user.id)} className="rotate-btn">
                                                🔄 Rotate My Keys
                                            </button>
                                        ) : (
                                            <button
                                                className="rotate-btn"
                                                disabled
                                                title="This user must rotate their own keys."
                                            >
                                                🔒 Self-Rotate Only
                                            </button>
                                        )}
                                        <button onClick={() => handleDeleteUser(user.id)} className="delete-btn">
                                            🗑️ Delete
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {activeTab === 'reports' && (
                <div className="reports-section">
                    <h2>Anonymous Reports</h2>
                    {reports.length === 0 && <p>No reports submitted yet.</p>}
                    {reports.map((report) => (
                        <div key={report.id} className="admin-report-item">
                            <div className="report-header">
                                <span className={`status ${report.status}`}>{report.status}</span>
                                <span>{new Date(report.created_at).toLocaleString()}</span>
                            </div>
                            <div className="report-details">
                                <p><strong>ID:</strong> {report.id}</p>
                                <p><strong>From:</strong> {report.is_anonymous ? 'Anonymous (no stored user id)' : report.reporter_name}</p>
                                <p><strong>Content:</strong> {report.report_text}</p>
                                {report.validIntegrity ? (
                                    <p className="security-badge">🔒 Decrypted & Integrity Verified</p>
                                ) : (
                                    <p className="error-badge">⚠️ Integrity Check Failed</p>
                                )}
                            </div>
                            <div className="report-actions">
                                <select onChange={(e) => updateReportStatus(report.id, e.target.value)} value={report.status}>
                                    <option value="pending">Pending</option>
                                    <option value="reviewed">Reviewed</option>
                                    <option value="resolved">Resolved</option>
                                </select>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {activeTab === 'security' && (
                <div className="security-section">
                    <h2>Security Configuration</h2>
                    <div className="security-card">
                        <h3>Encryption Settings</h3>
                        <ul>
                            <li>✅ RSA Key Size: 2048-bit</li>
                            <li>✅ ECC Curve: y² = x³ - 2x + 2 (mod 23)</li>
                            <li>✅ HMAC: SHA-256 from scratch</li>
                            <li>✅ Password Hashing: SHA-256 + Salt</li>
                            <li>✅ Key Rotation: Every 30 days</li>
                            <li>✅ Session Timeout: 5 minutes</li>
                        </ul>
                    </div>
                    <div className="security-card">
                        <h3>Key rotation</h3>
                        <p>Last key rotation: {formatLastRotation(stats?.lastRotation)}</p>
                        <p className="muted-text">Rotate keys per user from the Users tab — bulk rotation is not configured.</p>
                    </div>
                    <div className="security-card">
                        <h3>Key Management Overview</h3>
                        {keyOverview.length === 0 ? (
                            <p className="muted-text">No key lifecycle data available.</p>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table className="users-table">
                                    <thead>
                                        <tr>
                                            <th>User ID</th>
                                            <th>Role</th>
                                            <th>RSA Fingerprint</th>
                                            <th>ECC Fingerprint</th>
                                            <th>Last Rotation</th>
                                            <th>Rotation Due</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {keyOverview.map((row) => (
                                            <tr key={row.userId}>
                                                <td>{row.userId}</td>
                                                <td>{row.role}</td>
                                                <td title={row.fingerprints?.rsa}>{shortFp(row.fingerprints?.rsa)}</td>
                                                <td title={row.fingerprints?.ecc}>{shortFp(row.fingerprints?.ecc)}</td>
                                                <td>{formatLastRotation(row.keyLifecycle?.lastRotationAt || row.keyLifecycle?.generatedAt)}</td>
                                                <td>
                                                    {row.keyLifecycle?.rotationDue ? (
                                                        <span className="error-badge">⚠️ Due</span>
                                                    ) : (
                                                        <span className="security-badge">✅ Up to date</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminPanel;