import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';

/**
 * Shared shell: sidebar nav + main area. Used after login.
 * On narrow screens the sidebar becomes a slide-out drawer (no more squished labels).
 */
const AppLayout = ({ children }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const [navOpen, setNavOpen] = useState(false);
    const [profileMenuOpen, setProfileMenuOpen] = useState(false);
    const [sessionRemaining, setSessionRemaining] = useState(0);
    const user = JSON.parse(localStorage.getItem('user') || '{}');

    const formatRemaining = (seconds) => {
        if (seconds <= 0) return 'Expired';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        const mm = String(m).padStart(2, '0');
        const ss = String(s).padStart(2, '0');
        return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
    };

    const getTokenExpirySeconds = () => {
        try {
            const storedExpiry = localStorage.getItem('sessionExpiresAt');
            if (storedExpiry) {
                const expMs = new Date(storedExpiry).getTime();
                if (!Number.isNaN(expMs)) {
                    const nowMs = Date.now();
                    return Math.max(0, Math.floor((expMs - nowMs) / 1000));
                }
            }
            const token = localStorage.getItem('token');
            if (!token) return 0;
            const parts = token.split('.');
            if (parts.length < 2) return 0;
            const payload = JSON.parse(atob(parts[1]));
            const exp = Number(payload?.exp || 0);
            const now = Math.floor(Date.now() / 1000);
            return Math.max(0, exp - now);
        } catch (e) {
            return 0;
        }
    };

    useEffect(() => {
        setNavOpen(false);
        setProfileMenuOpen(false);
    }, [location.pathname]);

    useEffect(() => {
        const mq = window.matchMedia('(min-width: 961px)');
        const closeIfWide = () => {
            if (mq.matches) setNavOpen(false);
        };
        mq.addEventListener('change', closeIfWide);
        return () => mq.removeEventListener('change', closeIfWide);
    }, []);

    useEffect(() => {
        document.body.classList.toggle('nav-drawer-open', navOpen);
        return () => document.body.classList.remove('nav-drawer-open');
    }, [navOpen]);

    useEffect(() => {
        const tick = () => setSessionRemaining(getTokenExpirySeconds());
        tick();
        const timer = setInterval(tick, 1000);
        return () => clearInterval(timer);
    }, []);

    const handleLogout = async () => {
        try {
            const token = localStorage.getItem('token');
            if (token) {
                await axios.post('http://localhost:5000/api/auth/logout', {}, {
                    headers: { Authorization: `Bearer ${token}` }
                });
            }
        } catch (err) {
            console.error('Logout error:', err);
        } finally {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            localStorage.removeItem('sessionExpiresAt');
            navigate('/login');
        }
    };

    if (!user.username) {
        return <div className="loading cute-loading">Loading…</div>;
    }

    const navClass = ({ isActive }) => `nav-link ${isActive ? 'active' : ''}`;
    const handleBack = () => {
        if (window.history.length > 1) {
            navigate(-1);
        } else {
            navigate('/dashboard');
        }
    };

    return (
        <div className={`dashboard ${navOpen ? 'sidebar-visible' : ''}`}>
            <header className="mobile-topbar">
                <button
                    type="button"
                    className="nav-toggle"
                    aria-expanded={navOpen}
                    aria-controls="main-sidebar"
                    onClick={() => setNavOpen((v) => !v)}
                >
                    <span className="nav-toggle-bar" />
                    <span className="nav-toggle-bar" />
                    <span className="nav-toggle-bar" />
                    <span className="sr-only">Menu</span>
                </button>
                <span className="mobile-brand">CipherCampus</span>
                <div style={{ position: 'relative' }}>
                    <button
                        type="button"
                        className="mobile-user-chip"
                        title={user.username}
                        onClick={() => setProfileMenuOpen((v) => !v)}
                    >
                        {user.username.slice(0, 1).toUpperCase()}
                    </button>
                    {profileMenuOpen && (
                        <div
                            style={{
                                position: 'absolute',
                                right: 0,
                                top: 'calc(100% + 8px)',
                                background: '#fff',
                                border: '1px solid #e9dff3',
                                borderRadius: '10px',
                                boxShadow: '0 10px 24px rgba(0,0,0,0.08)',
                                padding: '8px',
                                minWidth: '160px',
                                zIndex: 2000
                            }}
                        >
                            <button
                                type="button"
                                onClick={() => {
                                    setProfileMenuOpen(false);
                                    navigate('/profile');
                                }}
                                style={{
                                    width: '100%',
                                    textAlign: 'left',
                                    background: 'transparent',
                                    border: 'none',
                                    padding: '8px 10px',
                                    borderRadius: '8px',
                                    cursor: 'pointer'
                                }}
                            >
                                👤 View Profile
                            </button>
                        </div>
                    )}
                </div>
            </header>

            <div className="dashboard-body">
                {navOpen && (
                    <button
                        type="button"
                        className="sidebar-backdrop"
                        aria-label="Close menu"
                        onClick={() => setNavOpen(false)}
                    />
                )}

                <nav id="main-sidebar" className={`sidebar ${navOpen ? 'is-open' : ''}`} aria-label="Main navigation">
                    <div className="logo">
                        <h2>CipherCampus</h2>
                        <span className="logo-tag">Secure academic collaboration</span>
                        <div
                            className="logo-tag"
                            style={{
                                marginTop: '6px',
                                color: sessionRemaining > 0 && sessionRemaining <= 120 ? '#d14343' : undefined,
                                fontWeight: sessionRemaining > 0 && sessionRemaining <= 120 ? 700 : undefined
                            }}
                        >
                            Session left: {formatRemaining(sessionRemaining)}
                        </div>
                    </div>
                    <ul>
                        <li><NavLink to="/dashboard" end className={navClass}>🏠 Home</NavLink></li>
                        <li><NavLink to="/feed" className={navClass}>📝 Academic feed</NavLink></li>
                        <li><NavLink to="/messages" className={navClass}>💬 Messages</NavLink></li>
                        <li><NavLink to="/documents" className={navClass}>📁 Documents</NavLink></li>
                        <li><NavLink to="/profile" className={navClass}>👤 Profile</NavLink></li>
                        {user.role !== 'admin' && (
                            <li><NavLink to="/reports" className={navClass}>⚠️ Reports</NavLink></li>
                        )}
                        {user.role === 'admin' && (
                            <li><NavLink to="/admin" className={navClass}>👑 Admin</NavLink></li>
                        )}
                        <li><button type="button" onClick={handleLogout} className="logout-btn">🚪 Log out</button></li>
                    </ul>
                </nav>

                <div className="main-shell">
                    <div className="floating-deco" aria-hidden>
                        <span className="float-star float-a">✦</span>
                        <span className="float-cloud float-b">☁</span>
                        <span className="float-heart float-c">♡</span>
                        <span className="float-spark float-d">✧</span>
                    </div>
                    <div className="main-content dashboard-layout">
                        {location.pathname !== '/dashboard' && (
                            <div style={{ marginBottom: '12px' }}>
                                <button type="button" className="layout-back-btn" onClick={handleBack}>
                                    ⬅ Back
                                </button>
                            </div>
                        )}
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AppLayout;
