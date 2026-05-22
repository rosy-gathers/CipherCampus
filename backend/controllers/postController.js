const db = require('../config/database');
const RSA = require('../crypto/rsa');
const HMAC = require('../crypto/hmac');
const { encryptPostEnvelope, decryptStoredContent } = require('../crypto/postEnvelope');
const { checkOwnership } = require('../middleware/rbac');
const systemKeys = require('../crypto/systemKeys');

const rsa = new RSA();
const hmac = new HMAC(process.env.HMAC_SECRET || 'ciphercampus_secret_key_for_hmac');

function normalizeTags(raw) {
    if (raw == null || raw === '') return [];
    const arr = Array.isArray(raw) ? raw : String(raw).split(/[,\n]+/);
    const out = [];
    const seen = new Set();
    for (let s of arr) {
        s = String(s)
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9_-]/g, '');
        if (!s || s.length > 24) continue;
        if (seen.has(s)) continue;
        seen.add(s);
        out.push(s);
        if (out.length >= 8) break;
    }
    return out;
}

function tagsJsonFromRow(val) {
    if (val == null || val === '') return [];
    try {
        const parsed = typeof val === 'string' ? JSON.parse(val) : val;
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

const createPost = async (req, res) => {
    try {
        const { content } = req.body;
        const tags = normalizeTags(req.body.tags);

        // AES-256-GCM envelope; AES key wrapped with system RSA public key
        const encryptedContent = encryptPostEnvelope(content, systemKeys.getPublicKey());

        // Generate HMAC for integrity
        const postHMAC = hmac.generateHMAC(content);

        // Store in database
        const [result] = await db.query(
            'INSERT INTO posts (user_id, encrypted_content, content_hmac, tags_json) VALUES (?, ?, ?, ?)',
            [req.user.id, encryptedContent, postHMAC, JSON.stringify(tags)]
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
            `SELECT p.id, p.user_id, p.encrypted_content, p.content_hmac, p.tags_json, p.created_at,
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
                actualContent = decryptStoredContent(post.encrypted_content, systemKeys.getPrivateKey());
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
                tags: tagsJsonFromRow(post.tags_json),
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
        
        const encryptedContent = encryptPostEnvelope(content, systemKeys.getPublicKey());
        const postHMAC = hmac.generateHMAC(content);
        const tags =
            req.body.tags !== undefined ? normalizeTags(req.body.tags) : null;

        if (tags !== null) {
            await db.query(
                'UPDATE posts SET encrypted_content = ?, content_hmac = ?, tags_json = ? WHERE id = ?',
                [encryptedContent, postHMAC, JSON.stringify(tags), id]
            );
        } else {
            await db.query('UPDATE posts SET encrypted_content = ?, content_hmac = ? WHERE id = ?', [
                encryptedContent,
                postHMAC,
                id,
            ]);
        }

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