import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

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
            const response = await axios.post('http://localhost:5000/api/auth/login', {
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
            setError(err.response?.data?.error || 'Login failed');
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
            const response = await axios.post('http://localhost:5000/api/auth/verify-2fa', {
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
            setError(err.response?.data?.error || 'Verification failed');
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
                response = await axios.post('http://localhost:5000/api/auth/resend-otp', {
                    userId
                });
            } catch (endpointError) {
                // Backward-compat fallback for older backend process without /resend-otp route.
                if (endpointError.response?.status === 404 || endpointError.response?.status === 405) {
                    response = await axios.post('http://localhost:5000/api/auth/login', {
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
            setError(err.response?.data?.error || 'Failed to resend OTP');
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
                    <form onSubmit={handleLogin}>
                        <input
                            type="text"
                            placeholder="Username or Email"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                            autoComplete="username"
                        />
                        <input
                            type="password"
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            autoComplete="current-password"
                        />
                        <button type="submit" disabled={loading}>
                            {loading ? 'Logging in...' : 'Login'}
                        </button>
                        <p>
                            <a href="/register">Don't have an account? Register</a>
                        </p>
                    </form>
                ) : (
                    <form onSubmit={handleVerifyOTP}>
                        <h3>Two-Factor Authentication</h3>
                        <p className="otp-instruction">
                            Enter the 6-digit code sent to your email
                        </p>
                        <input
                            type="text"
                            placeholder="Enter 6-digit OTP"
                            value={otp}
                            onChange={(e) => {
                                // Only allow numbers and limit to 6 digits
                                const value = e.target.value.replace(/[^0-9]/g, '').slice(0, 6);
                                setOtp(value);
                            }}
                            required
                            maxLength="6"
                            pattern="[0-9]{6}"
                            autoComplete="off"
                        />
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
                
                {error && <div className="error">{error}</div>}
                {info && <div className="success">{info}</div>}
            </div>
        </div>
    );
};

export default Login;