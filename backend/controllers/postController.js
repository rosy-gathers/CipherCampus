const db = require('../config/database');
const RSA = require('../crypto/rsa');
const HMAC = require('../crypto/hmac');
const { checkOwnership } = require('../middleware/rbac');
const systemKeys = require('../crypto/systemKeys');

const rsa = new RSA();
const hmac = new HMAC('ciphercampus_secret_key_for_hmac');

const createPost = async (req, res) => {
    try {
        const { content } = req.body;
        
        // Encrypt content with System Feed RSA Public Key
        const encryptedContent = rsa.encrypt(content, systemKeys.getPublicKey());
        
        // Generate HMAC for integrity
        const postHMAC = hmac.generateHMAC(content);
        
        // Store in database
        const [result] = await db.query(
            'INSERT INTO posts (user_id, encrypted_content, content_hmac) VALUES (?, ?, ?)',
            [req.user.id, encryptedContent, postHMAC]
        );
        
        res.status(201).json({
            message: 'Post created successfully.',
            postId: result.insertId
        });
    } catch (error) {
        console.error('Create post error:', error);
        res.status(500).json({ error: 'Failed to create post.' });
    }
};

const getAllPosts = async (req, res) => {
    try {
        // Get all posts with user info
        const [posts] = await db.query(
            `SELECT p.id, p.user_id, p.encrypted_content, p.content_hmac, p.created_at, 
                    u.encrypted_username
             FROM posts p
             JOIN users u ON p.user_id = u.id
             ORDER BY p.created_at DESC`
        );
        
        // Note: we decrypt using System Feed RSA Private Key
        const decryptedPosts = posts.map(post => {
            let actualContent = "Error decrypting post";
            let validIntegrity = false;
            try {
                actualContent = rsa.decrypt(post.encrypted_content, systemKeys.getPrivateKey());
                validIntegrity = hmac.verifyHMAC(actualContent, post.content_hmac);
            } catch(e) {
                console.error("Failed to decrypt post", post.id);
            }

            // Decrypt the author's username using System RSA Key
            let authorUsername = `User ${post.user_id}`;
            try {
                if (post.encrypted_username) {
                    authorUsername = rsa.decrypt(post.encrypted_username, systemKeys.getPrivateKey());
                }
            } catch(e) {
                // Fallback for older users whose usernames were encrypted with their personal keys
                console.error("Failed to decrypt username for user", post.user_id);
            }
            
            return {
                id: Number(post.id),
                user_id: Number(post.user_id),
                username: authorUsername,
                content: actualContent,
                validIntegrity: validIntegrity,
                created_at: post.created_at
            };
        });
        
        res.json(decryptedPosts);
    } catch (error) {
        console.error('Get posts error:', error);
        res.status(500).json({ error: 'Failed to get posts.' });
    }
};

const updatePost = async (req, res) => {
    try {
        const { id } = req.params;
        const { content } = req.body;
        
        // Check ownership
        const [posts] = await db.query('SELECT user_id FROM posts WHERE id = ?', [id]);
        
        if (posts.length === 0) {
            return res.status(404).json({ error: 'Post not found.' });
        }
        
        // Admin can edit only their own posts; they cannot edit other users' posts.
        if (Number(req.user.id) !== Number(posts[0].user_id)) {
            return res.status(403).json({ error: 'Access denied. You can edit only your own posts.' });
        }
        
        // Re-encrypt with System RSA Key
        const encryptedContent = rsa.encrypt(content, systemKeys.getPublicKey());
        const postHMAC = hmac.generateHMAC(content);
        
        await db.query(
            'UPDATE posts SET encrypted_content = ?, content_hmac = ? WHERE id = ?',
            [encryptedContent, postHMAC, id]
        );
        
        res.json({ message: 'Post updated successfully.' });
    } catch (error) {
        console.error('Update post error:', error);
        res.status(500).json({ error: 'Failed to update post.' });
    }
};

const deletePost = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Check ownership
        const [posts] = await db.query('SELECT user_id FROM posts WHERE id = ?', [id]);
        
        if (posts.length === 0) {
            return res.status(404).json({ error: 'Post not found.' });
        }
        
        if (!checkOwnership(req, posts[0].user_id)) {
            return res.status(403).json({ error: 'Access denied.' });
        }
        
        await db.query('DELETE FROM posts WHERE id = ?', [id]);
        
        res.json({ message: 'Post deleted successfully.' });
    } catch (error) {
        console.error('Delete post error:', error);
        res.status(500).json({ error: 'Failed to delete post.' });
    }
};

module.exports = { createPost, getAllPosts, updatePost, deletePost };