import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../services/api';
import { getApiErrorMessage } from '../utils/apiError';

const Login = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [otp, setOtp] = useState('');
    const [step, setStep] = useState('credentials');
    const [userId, setUserId] = useState(null);
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');
    const [resendCountdown, setResendCountdown] = useState(0);
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        if (step !== 'otp' || resendCountdown <= 0) return;
        const timer = setInterval(() => {
            setResendCountdown((prev) => (prev > 0 ? prev - 1 : 0));
        }, 1000);
        return () => clearInterval(timer);
    }, [step, resendCountdown]);

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        setInfo('');
        setLoading(true);

        try {
            const response = await api.post('/auth/login', {
                username,
                password
            });

            if (response.data.requires2FA) {
                setUserId(response.data.userId);
                setStep('otp');
                setOtp('');
                setResendCountdown(response.data.resendInSeconds || 30);
            }
        } catch (err) {
            setError(getApiErrorMessage(err, 'Login failed'));
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyOTP = async (e) => {
        e.preventDefault();
        setError('');
        setInfo('');
        setLoading(true);

        try {
            const response = await api.post('/auth/verify-2fa', {
                userId,
                otp
            });

            localStorage.setItem('token', response.data.token);
            localStorage.setItem('user', JSON.stringify(response.data.user));
            if (response.data.sessionExpiresAt) {
                localStorage.setItem('sessionExpiresAt', response.data.sessionExpiresAt);
            } else {
                localStorage.removeItem('sessionExpiresAt');
            }
            navigate('/dashboard');
        } catch (err) {
            setError(getApiErrorMessage(err, 'Verification failed'));
        } finally {
            setLoading(false);
        }
    };

    const handleResendOTP = async () => {
        setError('');
        setInfo('');
        setLoading(true);

        try {
            let response;
            try {
                // Preferred path: dedicated resend endpoint with server-side cooldown.
                response = await api.post('/auth/resend-otp', {
                    userId
                });
            } catch (endpointError) {
                // Backward-compat fallback for older backend process without /resend-otp route.
                if (endpointError.response?.status === 404 || endpointError.response?.status === 405) {
                    response = await api.post('/auth/login', {
                        username,
                        password
                    });
                } else {
                    throw endpointError;
                }
            }

            setInfo(response.data?.message || 'A new OTP has been sent.');
            if (response.data?.userId) {
                setUserId(response.data.userId);
            }
            setResendCountdown(response.data?.resendInSeconds || 30);
        } catch (err) {
            const waitSeconds = err.response?.data?.resendInSeconds;
            if (waitSeconds) {
                setResendCountdown(waitSeconds);
            }
            setError(getApiErrorMessage(err, 'Failed to resend OTP'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-card">
                <h1>CipherCampus</h1>
                <h2>Secure Academic Platform</h2>
                
                {step === 'credentials' ? (
                    <form onSubmit={handleLogin} className="auth-form">
                        <div className="field-group">
                            <label htmlFor="login-username" className="form-label">Username or email</label>
                            <input
                                id="login-username"
                                type="text"
                                placeholder="e.g. student01"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                required
                                autoComplete="username"
                            />
                        </div>
                        <div className="field-group">
                            <label htmlFor="login-password" className="form-label">Password</label>
                            <input
                                id="login-password"
                                type="password"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                autoComplete="current-password"
                            />
                        </div>
                        <button type="submit" disabled={loading}>
                            {loading ? 'Logging in...' : 'Login'}
                        </button>
                        <p className="auth-footer-link">
                            <Link to="/register">Don&apos;t have an account? Register</Link>
                        </p>
                    </form>
                ) : (
                    <form onSubmit={handleVerifyOTP} className="auth-form">
                        <h3>Two-Factor Authentication</h3>
                        <p className="otp-instruction">
                            Enter the 6-digit code sent to your email
                        </p>
                        <div className="field-group">
                            <label htmlFor="login-otp" className="form-label">One-time code</label>
                            <input
                                id="login-otp"
                                type="text"
                                inputMode="numeric"
                                placeholder="000000"
                                value={otp}
                                onChange={(e) => {
                                    // Only allow numbers and limit to 6 digits
                                    const value = e.target.value.replace(/[^0-9]/g, '').slice(0, 6);
                                    setOtp(value);
                                }}
                                required
                                maxLength="6"
                                pattern="[0-9]{6}"
                                autoComplete="one-time-code"
                            />
                        </div>
                        <button type="submit" disabled={loading || otp.length !== 6}>
                            {loading ? 'Verifying...' : 'Verify OTP'}
                        </button>
                        <button
                            type="button"
                            onClick={handleResendOTP}
                            className="resend-btn"
                            disabled={loading || resendCountdown > 0}
                        >
                            {resendCountdown > 0
                                ? `Resend OTP in ${resendCountdown}s`
                                : 'Resend OTP'}
                        </button>
                        <button 
                            type="button" 
                            onClick={() => {
                                setStep('credentials');
                                setOtp('');
                                setUserId(null);
                                setResendCountdown(0);
                                setInfo('');
                            }}
                            className="back-btn"
                        >
                            Back to Login
                        </button>
                    </form>
                )}
                
                {error && (
                    <div className="error" role="alert">
                        {error}
                    </div>
                )}
                {info && (
                    <div className="success" role="status">
                        {info}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Login;