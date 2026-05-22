import React, { useState, useEffect, useCallback } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import api, { notificationAPI } from '../services/api';
import { decodeJwtPayload } from '../utils/jwt';
import UserAvatar from './UserAvatar';

/**
 * Shared shell: sidebar nav + main area. Used after login.
 * On narrow screens the sidebar becomes a slide-out drawer (no more squished labels).
 */
const AppLayout = ({ children }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const [navOpen, setNavOpen] = useState(false);
    const [profileMenuOpen, setProfileMenuOpen] = useState(false);
    const [notifOpen, setNotifOpen] = useState(false);
    const [notifItems, setNotifItems] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [avatarRev, setAvatarRev] = useState(0);
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
            const payload = decodeJwtPayload(token);
            if (!payload) return 0;
            const exp = Number(payload.exp || 0);
            const now = Math.floor(Date.now() / 1000);
            return Math.max(0, exp - now);
        } catch (e) {
            return 0;
        }
    };

    const fetchNotifications = useCallback(async () => {
        try {
            const res = await notificationAPI.list();
            setNotifItems(res.data.items || []);
            setUnreadCount(Number(res.data.unreadCount) || 0);
        } catch {
            /* ignore when offline or session edge cases */
        }
    }, []);

    useEffect(() => {
        setNavOpen(false);
        setProfileMenuOpen(false);
        setNotifOpen(false);
    }, [location.pathname]);

    useEffect(() => {
        fetchNotifications();
    }, [location.pathname, fetchNotifications]);

    useEffect(() => {
        fetchNotifications();
        const t = setInterval(fetchNotifications, 30000);
        return () => clearInterval(t);
    }, [fetchNotifications]);

    useEffect(() => {
        const onAvatar = () => setAvatarRev((b) => b + 1);
        window.addEventListener('ciphercampus-avatar-updated', onAvatar);
        return () => window.removeEventListener('ciphercampus-avatar-updated', onAvatar);
    }, []);

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
                await api.post('/auth/logout');
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

    const handleNotifNavigate = async (n) => {
        try {
            if (!n.read) {
                await notificationAPI.markRead(n.id);
            }
            setNotifOpen(false);
            await fetchNotifications();
            if (n.type === 'message') {
                navigate('/messages');
            } else if (n.type === 'document_share') {
                navigate('/documents');
            }
        } catch {
            /* ignore */
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
                <div className="topbar-actions">
                    <div className="notif-menu-anchor">
                        <button
                            type="button"
                            className="notif-bell"
                            aria-label="Notifications"
                            aria-expanded={notifOpen}
                            aria-haspopup="true"
                            onClick={() => {
                                setNotifOpen((v) => !v);
                                setProfileMenuOpen(false);
                                fetchNotifications();
                            }}
                        >
                            <span aria-hidden>🔔</span>
                            {unreadCount > 0 && (
                                <span className="notif-badge">
                                    {unreadCount > 9 ? '9+' : unreadCount}
                                </span>
                            )}
                        </button>
                        {notifOpen && (
                            <div className="notif-panel" role="menu">
                                <div className="notif-panel-head">
                                    <span>Notifications</span>
                                    <button
                                        type="button"
                                        className="notif-mark-all"
                                        onClick={async () => {
                                            try {
                                                await notificationAPI.markAllRead();
                                                await fetchNotifications();
                                            } catch {
                                                /* ignore */
                                            }
                                        }}
                                    >
                                        Mark all read
                                    </button>
                                </div>
                                <div className="notif-list">
                                    {notifItems.length === 0 && (
                                        <div className="notif-empty">No notifications yet.</div>
                                    )}
                                    {notifItems.map((n) => (
                                        <button
                                            key={n.id}
                                            type="button"
                                            role="menuitem"
                                            className={`notif-row ${n.read ? 'is-read' : ''}`}
                                            onClick={() => handleNotifNavigate(n)}
                                        >
                                            <strong>{n.title}</strong>
                                            {n.body && (
                                                <span className="notif-body">{n.body}</span>
                                            )}
                                            <span className="notif-time">
                                                {new Date(n.created_at).toLocaleString()}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="profile-menu-anchor">
                    <button
                        type="button"
                        className="mobile-user-chip"
                        title={user.username}
                        aria-haspopup="true"
                        aria-expanded={profileMenuOpen}
                        aria-label="Account menu"
                        onClick={() => {
                            setProfileMenuOpen((v) => !v);
                            setNotifOpen(false);
                        }}
                    >
                        <UserAvatar userId={user.id} label={user.username} size={28} rev={avatarRev} />
                    </button>
                    {profileMenuOpen && (
                        <div className="profile-menu-panel" role="menu">
                            <button
                                type="button"
                                className="profile-menu-item"
                                role="menuitem"
                                onClick={() => {
                                    setProfileMenuOpen(false);
                                    navigate('/profile');
                                }}
                            >
                                View profile
                            </button>
                        </div>
                    )}
                    </div>
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
