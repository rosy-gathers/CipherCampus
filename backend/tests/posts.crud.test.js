/**
 * Post CRUD integration tests (MySQL). Same gate as auth.register.test.js.
 */
const crypto = require('crypto');
const request = require('supertest');
const app = require('../server');
const db = require('../config/database');
const { generateToken, hashToken } = require('../middleware/auth');

const runDbTests = process.env.GITHUB_ACTIONS === 'true' || process.env.RUN_DB_INTEGRATION === '1';
const describeDb = runDbTests ? describe : describe.skip;

const suffix = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

async function registerUser() {
    const u = suffix();
    const res = await request(app).post('/api/auth/register').send({
        username: `post_${u}`,
        email: `post_${u}@example.com`,
        password: 'secret12',
    });
    expect(res.status).toBe(201);
    return res.body.userId;
}

async function createSessionToken(userId) {
    const token = generateToken(userId, { jti: crypto.randomBytes(16).toString('hex') });
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await db.query(
        'INSERT INTO sessions (user_id, session_token, expires_at) VALUES (?, ?, ?)',
        [userId, tokenHash, expiresAt]
    );
    return token;
}

describeDb('Post CRUD', () => {
    it('creates, lists, updates, and deletes a post', async () => {
        const userId = await registerUser();
        const token = await createSessionToken(userId);

        const create = await request(app)
            .post('/api/posts')
            .set('Authorization', `Bearer ${token}`)
            .send({ content: 'Hello integrity' });
        expect(create.status).toBe(201);
        const postId = create.body.postId;
        expect(postId).toBeDefined();

        const list = await request(app).get('/api/posts').set('Authorization', `Bearer ${token}`);
        expect(list.status).toBe(200);
        const mine = list.body.find((p) => Number(p.id) === Number(postId));
        expect(mine).toBeDefined();
        expect(mine.content).toBe('Hello integrity');
        expect(mine.validIntegrity).toBe(true);

        const update = await request(app)
            .put(`/api/posts/${postId}`)
            .set('Authorization', `Bearer ${token}`)
            .send({ content: 'Updated' });
        expect(update.status).toBe(200);

        const del = await request(app)
            .delete(`/api/posts/${postId}`)
            .set('Authorization', `Bearer ${token}`);
        expect(del.status).toBe(200);
    });
});
