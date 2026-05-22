import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../services/api';
import { getApiErrorMessage } from '../utils/apiError';

const Register = () => {
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleRegister = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        // Validation
        if (!username.trim()) {
            setError('Username is required');
            return;
        }
        
        if (!email.trim()) {
            setError('Email is required');
            return;
        }
        
        if (!email.includes('@')) {
            setError('Please enter a valid email address');
            return;
        }

        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        if (password.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }

        setLoading(true);

        try {
            await api.post('/auth/register', {
                username: username.trim(),
                email: email.trim(),
                password,
            });

            setSuccess('Registration successful! Redirecting to login...');
            setTimeout(() => {
                navigate('/login');
            }, 2000);
        } catch (err) {
            setError(getApiErrorMessage(err, 'Registration failed. Please try again.'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="register-container">
            <div className="register-card">
                <h1>CipherCampus</h1>
                <h2>Create Your Secure Account</h2>
                
                <form onSubmit={handleRegister} className="auth-form">
                    <div className="field-group">
                        <label htmlFor="reg-username" className="form-label">Username</label>
                        <input
                            id="reg-username"
                            type="text"
                            placeholder="Choose a username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                            autoComplete="username"
                        />
                    </div>
                    <div className="field-group">
                        <label htmlFor="reg-email" className="form-label">Email</label>
                        <input
                            id="reg-email"
                            type="email"
                            placeholder="you@university.edu"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            autoComplete="email"
                        />
                    </div>
                    <div className="field-group">
                        <label htmlFor="reg-password" className="form-label">Password</label>
                        <input
                            id="reg-password"
                            type="password"
                            placeholder="At least 6 characters"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            autoComplete="new-password"
                        />
                    </div>
                    <div className="field-group">
                        <label htmlFor="reg-password2" className="form-label">Confirm password</label>
                        <input
                            id="reg-password2"
                            type="password"
                            placeholder="Repeat password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                            autoComplete="new-password"
                        />
                    </div>
                    <button type="submit" disabled={loading}>
                        {loading ? 'Registering...' : 'Register'}
                    </button>
                    <p className="auth-footer-link">
                        Already have an account? <Link to="/login">Login here</Link>
                    </p>
                </form>
                
                {error && (
                    <div className="error" role="alert">
                        {error}
                    </div>
                )}
                {success && (
                    <div className="success" role="status">
                        {success}
                    </div>
                )}
                
                <div className="security-info">
                    <p>🔒 Profile and feed payloads are encrypted for storage (hybrid AES-GCM envelope)</p>
                    <p>✉️ Email OTP before each new session</p>
                    <p>🔑 Per-user keys wrapped at rest; see README / ARCHITECTURE</p>
                </div>
            </div>
        </div>
    );
};

export default Register;