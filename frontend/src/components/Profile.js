import React, { useEffect, useState } from 'react';
import { authAPI } from '../services/api';
import { useNavigate } from 'react-router-dom';

const Profile = () => {
    const navigate = useNavigate();
    const [profile, setProfile] = useState(null);
    const [form, setForm] = useState({
        username: '',
        fullName: '',
        email: '',
        phone: '',
        department: '',
        bio: ''
    });
    const [passwordForm, setPasswordForm] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });
    const [deletePassword, setDeletePassword] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [savingPassword, setSavingPassword] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const loadProfile = async () => {
        try {
            setLoading(true);
            const res = await authAPI.getProfile();
            setProfile(res.data);
            setForm({
                username: res.data.username || '',
                fullName: res.data.fullName || '',
                email: res.data.email || '',
                phone: res.data.phone || '',
                department: res.data.department || '',
                bio: res.data.bio || ''
            });
            setError('');
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to load profile.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadProfile();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError('');
        setSuccess('');
        try {
            await authAPI.updateProfile({
                username: form.username.trim(),
                fullName: form.fullName.trim(),
                email: form.email.trim(),
                phone: form.phone.trim(),
                department: form.department.trim(),
                bio: form.bio.trim()
            });
            setSuccess('Profile updated successfully. Encrypted values were stored in the database.');
            const current = JSON.parse(localStorage.getItem('user') || '{}');
            localStorage.setItem('user', JSON.stringify({
                ...current,
                username: form.username.trim(),
                email: form.email.trim()
            }));
            await loadProfile();
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to update profile.');
        } finally {
            setSaving(false);
        }
    };

    const handleResetPassword = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        if (passwordForm.newPassword !== passwordForm.confirmPassword) {
            setError('New password and confirm password do not match.');
            return;
        }
        setSavingPassword(true);
        try {
            await authAPI.resetPassword({
                currentPassword: passwordForm.currentPassword,
                newPassword: passwordForm.newPassword
            });
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            alert('Password reset successful. Please login again.');
            navigate('/login');
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to reset password.');
        } finally {
            setSavingPassword(false);
        }
    };

    const handleDeleteAccount = async () => {
        setError('');
        setSuccess('');
        if (!deletePassword) {
            setError('Please enter your password to delete account.');
            return;
        }
        if (!window.confirm('This will permanently delete your account and data. Are you sure?')) {
            return;
        }
        setDeleting(true);
        try {
            await authAPI.deleteAccount({ password: deletePassword });
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            navigate('/login');
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to delete account.');
        } finally {
            setDeleting(false);
        }
    };

    if (loading) {
        return <div className="loading">Loading profile...</div>;
    }

    return (
        <div className="feed-container">
            <div className="feed-header page-intro">
                <h1>Profile</h1>
                <p className="feed-lede">
                    View and update your profile. Data is encrypted before storage and decrypted on retrieval.
                </p>
            </div>

            <div className="create-post card-surface">
                <h3>Profile information</h3>
                <form onSubmit={handleSubmit}>
                    <input
                        type="text"
                        placeholder="Username / Display Name"
                        value={form.username}
                        onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
                        required
                    />
                    <input
                        type="text"
                        placeholder="Full Name"
                        value={form.fullName}
                        onChange={(e) => setForm((prev) => ({ ...prev, fullName: e.target.value }))}
                    />
                    <input
                        type="email"
                        placeholder="Email"
                        value={form.email}
                        onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                        required
                    />
                    <input
                        type="text"
                        placeholder="Phone Number"
                        value={form.phone}
                        onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                    />
                    <input
                        type="text"
                        placeholder="Department"
                        value={form.department}
                        onChange={(e) => setForm((prev) => ({ ...prev, department: e.target.value }))}
                    />
                    <textarea
                        placeholder="Bio"
                        value={form.bio}
                        onChange={(e) => setForm((prev) => ({ ...prev, bio: e.target.value }))}
                        rows={4}
                    />
                    <button type="submit" className="btn-primary" disabled={saving}>
                        {saving ? 'Saving...' : 'Update Profile'}
                    </button>
                </form>

                {profile && (
                    <div style={{ marginTop: '12px' }}>
                        <p><strong>Role:</strong> {profile.role}</p>
                        <p><strong>Joined:</strong> {new Date(profile.created_at).toLocaleString()}</p>
                    </div>
                )}

                {error && <div className="error">{error}</div>}
                {success && <div className="success">{success}</div>}
            </div>

            <div className="create-post card-surface" style={{ marginTop: '16px' }}>
                <h3>Reset password</h3>
                <form onSubmit={handleResetPassword}>
                    <input
                        type="password"
                        placeholder="Current Password"
                        value={passwordForm.currentPassword}
                        onChange={(e) => setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
                        required
                    />
                    <input
                        type="password"
                        placeholder="New Password"
                        value={passwordForm.newPassword}
                        onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))}
                        required
                    />
                    <input
                        type="password"
                        placeholder="Confirm New Password"
                        value={passwordForm.confirmPassword}
                        onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                        required
                    />
                    <button type="submit" className="btn-primary" disabled={savingPassword}>
                        {savingPassword ? 'Updating Password...' : 'Reset Password'}
                    </button>
                </form>
            </div>

            <div className="create-post card-surface" style={{ marginTop: '16px' }}>
                <h3>Delete account</h3>
                <p>This permanently removes your account and related records from the database.</p>
                <input
                    type="password"
                    placeholder="Enter password to confirm"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                />
                <button type="button" onClick={handleDeleteAccount} disabled={deleting}>
                    {deleting ? 'Deleting...' : 'Delete Account Permanently'}
                </button>
            </div>
        </div>
    );
};

export default Profile;
