import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { postAPI } from '../services/api';
import { postAuthorDisplay } from '../utils/user';

const Dashboard = () => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const [recentPosts, setRecentPosts] = useState([]);
    const [loadingPosts, setLoadingPosts] = useState(true);

    useEffect(() => {
        const loadPosts = async () => {
            try {
                const response = await postAPI.getAll();
                setRecentPosts(response.data.slice(0, 5));
            } catch (err) {
                console.error('Failed to load recent posts', err);
            } finally {
                setLoadingPosts(false);
            }
        };

        loadPosts();
    }, []);

    if (!user.username) {
        return <div className="loading">Loading...</div>;
    }

    const isAdmin = user.role === 'admin';

    return (
        <>
            <header className="dashboard-page-header">
                <h1>Welcome, {user.username}</h1>
                <p className="dashboard-subtitle">
                    {isAdmin
                        ? 'You are signed in as an administrator. Use the navigation menu to access administrative functions, the academic feed, and other modules.'
                        : 'You are signed in as a student user. Use the navigation menu to access the academic feed, messaging, document vault, and anonymous reporting.'}
                </p>
                <p className="role-pill">Role: {isAdmin ? 'Administrator' : 'Student'}</p>
            </header>

            <div className="dashboard-content">
                <div className="dashboard-left">
                    <section className="dashboard-purpose card-like">
                        <h2>Dashboard overview</h2>
                        <p>
                            This dashboard provides a summary view after authentication. The{' '}
                            <Link to="/feed">Academic Feed</Link> lists posts contributed by all users.
                            {isAdmin ? (
                                <> Additional tools—including secure messaging and document storage—are available through the navigation menu. Anonymous reports are reviewed under Admin.</>
                            ) : (
                                <> Additional tools—including secure messaging, document storage, and anonymous reporting—are available through the navigation menu.</>
                            )}
                        </p>
                    </section>

                    <div className="hero-section">
                        <img src="/campus_illustration.png" alt="" className="campus-img" />
                        <div className="hero-text">
                            <h2>CipherCampus</h2>
                            <p>
                                Course materials and discussions employ cryptographic protections where implemented,
                                including encrypted posts and message integrity verification.
                            </p>
                        </div>
                    </div>

                    <div className="stats-grid">
                        <div className="stat-card">
                            <h3>Encryption</h3>
                            <p>RSA-protected feed content and ECC-based messaging; session keys established after successful authentication.</p>
                        </div>
                        <div className="stat-card">
                            <h3>Integrity</h3>
                            <p>HMAC verification on posts, messages, and reports where applicable.</p>
                        </div>
                    </div>
                </div>

                <div className="dashboard-right">
                    <div className="recent-posts-widget">
                        <div className="widget-header">
                            <h3>Recent feed posts</h3>
                            <Link to="/feed" className="view-all-link">View full feed</Link>
                        </div>

                        {loadingPosts ? (
                            <p className="loading-text">Loading posts…</p>
                        ) : recentPosts.length === 0 ? (
                            <p className="empty-text">No posts are available yet.</p>
                        ) : (
                            <div className="widget-posts-list">
                                {recentPosts.map((post) => (
                                    <div key={post.id} className="widget-post-card">
                                        <div className="post-header">
                                            <strong className="post-author-line">
                                                {postAuthorDisplay(post, user)}
                                            </strong>
                                            <span className="post-date">
                                                {new Date(post.created_at).toLocaleDateString()}
                                            </span>
                                        </div>
                                        <div className="post-content">
                                            <p>
                                                {post.content.length > 100
                                                    ? `${post.content.substring(0, 100)}…`
                                                    : post.content}
                                            </p>
                                            {post.validIntegrity === false && (
                                                <div className="integrity-warning">Integrity verification failed</div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
};

export default Dashboard;
