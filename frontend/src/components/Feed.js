import React, { useState, useEffect } from 'react';
import { postAPI } from '../services/api';
import { sameUserId, postAuthorDisplay } from '../utils/user';

const Feed = () => {
    const [posts, setPosts] = useState([]);
    const [newPost, setNewPost] = useState('');
    const [editingPost, setEditingPost] = useState(null);
    const [editContent, setEditContent] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const user = JSON.parse(localStorage.getItem('user') || '{}');

    useEffect(() => {
        loadPosts();
    }, []);

    const loadPosts = async () => {
        try {
            setLoading(true);
            const response = await postAPI.getAll();
            setPosts(response.data);
            setError('');
        } catch (err) {
            setError('Failed to load posts');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreatePost = async (e) => {
        e.preventDefault();
        if (!newPost.trim()) return;

        try {
            await postAPI.create({ content: newPost });
            setNewPost('');
            await loadPosts();
        } catch (err) {
            setError('Failed to create post');
        }
    };

    const handleUpdatePost = async (id) => {
        if (!editContent.trim()) return;

        try {
            await postAPI.update(id, { content: editContent });
            setEditingPost(null);
            setEditContent('');
            await loadPosts();
        } catch (err) {
            setError('Failed to update post');
        }
    };

    const handleDeletePost = async (id) => {
        if (window.confirm('Are you sure you want to delete this post?')) {
            try {
                await postAPI.delete(id);
                await loadPosts();
            } catch (err) {
                setError('Failed to delete post');
            }
        }
    };

    const startEdit = (post) => {
        setEditingPost(post.id);
        setEditContent(post.content); 
    };

    return (
        <div className="feed-container">
            <div className="feed-header page-intro">
                <h1>Academic feed</h1>
            </div>

            <div className="create-post card-surface">
                <h3>New post</h3>
                <form onSubmit={handleCreatePost}>
                    <textarea
                        value={newPost}
                        onChange={(e) => setNewPost(e.target.value)}
                        placeholder="Write your academic post here... (Will be encrypted with RSA)"
                        rows="4"
                    />
                    <button type="submit" className="btn-primary">Post (encrypted)</button>
                </form>
            </div>

            <div className="posts-list">
                <h3 className="section-title">All posts</h3>
                {loading && <div className="loading">Loading posts...</div>}
                {error && <div className="error">{error}</div>}
                
                {posts.length === 0 && !loading && (
                    <div className="no-posts">No posts yet. Be the first to share!</div>
                )}
                
                {posts.map((post) => (
                    <article key={post.id} className="post-card card-surface">
                        <div className="post-header">
                            <span className="post-author">
                                <span className="avatar-chip" aria-hidden>👤</span>
                                <strong>{postAuthorDisplay(post, user)}</strong>
                                {sameUserId(post.user_id, user.id) && (
                                    <span className="you-badge">You</span>
                                )}
                            </span>
                            <span className="post-date">
                                {new Date(post.created_at).toLocaleString()}
                            </span>
                        </div>
                        
                        {editingPost === post.id ? (
                            <div className="post-edit">
                                <textarea
                                    value={editContent}
                                    onChange={(e) => setEditContent(e.target.value)}
                                    rows="3"
                                />
                                <div className="edit-actions">
                                    <button onClick={() => handleUpdatePost(post.id)}>Save</button>
                                    <button onClick={() => setEditingPost(null)}>Cancel</button>
                                </div>
                            </div>
                        ) : (
                            <div className="post-content">
                                <p>{post.content}</p>
                                {post.validIntegrity === false ? (
                                    <div className="post-badge error-badge">⚠️ HMAC integrity failed</div>
                                ) : (
                                    <div className="post-badge">🔒 Decrypted · integrity verified</div>
                                )}
                            </div>
                        )}
                        
                        {(sameUserId(post.user_id, user.id) || user.role === 'admin') && !editingPost && (
                            <div className="post-actions">
                                {sameUserId(post.user_id, user.id) && (
                                    <button onClick={() => startEdit(post)}>✏️ Edit</button>
                                )}
                                <button onClick={() => handleDeletePost(post.id)}>🗑️ Delete</button>
                            </div>
                        )}
                    </article>
                ))}
            </div>
        </div>
    );
};

export default Feed;