import React, { useState, useEffect, useMemo } from 'react';
import { postAPI } from '../services/api';
import { sameUserId, postAuthorDisplay } from '../utils/user';
import { getApiErrorMessage } from '../utils/apiError';
import UserAvatar from './UserAvatar';

const Feed = () => {
    const [posts, setPosts] = useState([]);
    const [newPost, setNewPost] = useState('');
    const [newPostTags, setNewPostTags] = useState('');
    const [editingPost, setEditingPost] = useState(null);
    const [editContent, setEditContent] = useState('');
    const [editTags, setEditTags] = useState('');
    const [tagFilter, setTagFilter] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const user = JSON.parse(localStorage.getItem('user') || '{}');

    useEffect(() => {
        loadPosts();
    }, []);

    const allTags = useMemo(() => {
        const s = new Set();
        posts.forEach((p) => (p.tags || []).forEach((t) => s.add(t)));
        return Array.from(s).sort();
    }, [posts]);

    const filteredPosts = useMemo(() => {
        if (!tagFilter) return posts;
        return posts.filter((p) => (p.tags || []).includes(tagFilter));
    }, [posts, tagFilter]);

    const loadPosts = async () => {
        try {
            setLoading(true);
            const response = await postAPI.getAll();
            setPosts(response.data);
            setError('');
        } catch (err) {
            setError(getApiErrorMessage(err, 'Failed to load posts'));
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreatePost = async (e) => {
        e.preventDefault();
        if (!newPost.trim()) return;

        try {
            await postAPI.create({ content: newPost, tags: newPostTags });
            setNewPost('');
            setNewPostTags('');
            await loadPosts();
        } catch (err) {
            setError(getApiErrorMessage(err, 'Failed to create post'));
        }
    };

    const handleUpdatePost = async (id) => {
        if (!editContent.trim()) return;

        try {
            await postAPI.update(id, { content: editContent, tags: editTags });
            setEditingPost(null);
            setEditContent('');
            setEditTags('');
            await loadPosts();
        } catch (err) {
            setError(getApiErrorMessage(err, 'Failed to update post'));
        }
    };

    const handleDeletePost = async (id) => {
        if (window.confirm('Are you sure you want to delete this post?')) {
            try {
                await postAPI.delete(id);
                await loadPosts();
            } catch (err) {
                setError(getApiErrorMessage(err, 'Failed to delete post'));
            }
        }
    };

    const startEdit = (post) => {
        setEditingPost(post.id);
        setEditContent(post.content);
        setEditTags((post.tags || []).join(', '));
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
                        placeholder="Write your academic post here… (encrypted for storage on the server)"
                        rows="4"
                    />
                    <input
                        type="text"
                        value={newPostTags}
                        onChange={(e) => setNewPostTags(e.target.value)}
                        placeholder="Tags (optional, comma-separated: research, cse447, …)"
                        style={{ marginTop: '8px' }}
                    />
                    <button type="submit" className="btn-primary">
                        Post (encrypted)
                    </button>
                </form>
            </div>

            <div className="feed-tag-filter card-surface">
                <span className="feed-tag-filter-label">Filter by tag</span>
                <div className="feed-tag-chips">
                    <button
                        type="button"
                        className={`feed-tag-chip ${!tagFilter ? 'is-active' : ''}`}
                        onClick={() => setTagFilter('')}
                    >
                        All
                    </button>
                    {allTags.map((t) => (
                        <button
                            key={t}
                            type="button"
                            className={`feed-tag-chip ${tagFilter === t ? 'is-active' : ''}`}
                            onClick={() => setTagFilter(tagFilter === t ? '' : t)}
                        >
                            #{t}
                        </button>
                    ))}
                </div>
            </div>

            <div className="posts-list">
                <h3 className="section-title">All posts</h3>
                {loading && <div className="loading">Loading posts...</div>}
                {error && (
                    <div className="error" role="alert">
                        {error}
                    </div>
                )}

                {filteredPosts.length === 0 && !loading && (
                    <div className="no-posts">
                        {posts.length === 0
                            ? 'No posts yet. Be the first to share!'
                            : 'No posts match this tag.'}
                    </div>
                )}

                {filteredPosts.map((post) => (
                    <article key={post.id} className="post-card card-surface">
                        <div className="post-header">
                            <span className="post-author">
                                <UserAvatar userId={post.user_id} label={post.username} size={36} />
                                <strong>{postAuthorDisplay(post, user)}</strong>
                                {sameUserId(post.user_id, user.id) && (
                                    <span className="you-badge">You</span>
                                )}
                            </span>
                            <span className="post-date">
                                {new Date(post.created_at).toLocaleString()}
                            </span>
                        </div>

                        {(post.tags || []).length > 0 && (
                            <div className="post-tags-row">
                                {(post.tags || []).map((t) => (
                                    <button
                                        key={t}
                                        type="button"
                                        className="post-tag-pill"
                                        onClick={() => setTagFilter(tagFilter === t ? '' : t)}
                                    >
                                        #{t}
                                    </button>
                                ))}
                            </div>
                        )}

                        {editingPost === post.id ? (
                            <div className="post-edit">
                                <textarea
                                    value={editContent}
                                    onChange={(e) => setEditContent(e.target.value)}
                                    rows="3"
                                />
                                <input
                                    type="text"
                                    value={editTags}
                                    onChange={(e) => setEditTags(e.target.value)}
                                    placeholder="Tags (comma-separated)"
                                    style={{ marginTop: '8px' }}
                                />
                                <div className="edit-actions">
                                    <button type="button" onClick={() => handleUpdatePost(post.id)}>
                                        Save
                                    </button>
                                    <button type="button" onClick={() => setEditingPost(null)}>
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="post-content">
                                <p>{post.content}</p>
                                {post.validIntegrity === false ? (
                                    <div className="post-badge error-badge">
                                        ⚠️ HMAC integrity failed
                                    </div>
                                ) : (
                                    <div className="post-badge">🔒 Decrypted · integrity verified</div>
                                )}
                            </div>
                        )}

                        {(sameUserId(post.user_id, user.id) || user.role === 'admin') && !editingPost && (
                            <div className="post-actions">
                                {sameUserId(post.user_id, user.id) && (
                                    <button type="button" onClick={() => startEdit(post)}>
                                        ✏️ Edit
                                    </button>
                                )}
                                <button type="button" onClick={() => handleDeletePost(post.id)}>
                                    🗑️ Delete
                                </button>
                            </div>
                        )}
                    </article>
                ))}
            </div>
        </div>
    );
};

export default Feed;
