import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';

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
            const response = await axios.post('http://localhost:5000/api/auth/register', {
                username: username.trim(),
                email: email.trim(),
                password,
            });

            setSuccess('Registration successful! Redirecting to login...');
            setTimeout(() => {
                navigate('/login');
            }, 2000);
        } catch (err) {
            const errorMsg = err.response?.data?.error || 'Registration failed. Please try again.';
            setError(errorMsg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="register-container">
            <div className="register-card">
                <h1>CipherCampus</h1>
                <h2>Create Your Secure Account</h2>
                
                <form onSubmit={handleRegister}>
                    <input
                        type="text"
                        placeholder="Username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        required
                        autoComplete="username"
                    />
                    <input
                        type="email"
                        placeholder="Email Address"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoComplete="email"
                    />
                    <input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoComplete="new-password"
                    />
                    <input
                        type="password"
                        placeholder="Confirm Password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        autoComplete="new-password"
                    />
                    <button type="submit" disabled={loading}>
                        {loading ? 'Registering...' : 'Register'}
                    </button>
                    <p>
                        Already have an account? <Link to="/login">Login here</Link>
                    </p>
                </form>
                
                {error && <div className="error">{error}</div>}
                {success && <div className="success">{success}</div>}
                
                <div className="security-info">
                    <p>🔒 Your data will be encrypted using RSA-2048</p>
                    <p>✉️ 2FA via email will be enabled</p>
                    <p>🔑 Keys generated and stored encrypted</p>
                </div>
            </div>
        </div>
    );
};

export default Register;