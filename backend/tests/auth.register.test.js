/**
 * Integration tests: require MySQL with schema. Runs in CI (CI=true). Locally set CI=true or RUN_DB_INTEGRATION=1.
 */
const request = require('supertest');
const app = require('../server');

/** GitHub Actions sets GITHUB_ACTIONS=true. Locally set RUN_DB_INTEGRATION=1 with MySQL up. */
const runDbTests = process.env.GITHUB_ACTIONS === 'true' || process.env.RUN_DB_INTEGRATION === '1';
const describeDb = runDbTests ? describe : describe.skip;

const suffix = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

describeDb('POST /api/auth/register', () => {
    it('creates a new user', async () => {
        const u = suffix();
        const res = await request(app).post('/api/auth/register').send({
            username: `user_${u}`,
            email: `user_${u}@example.com`,
            password: 'secret12',
        });
        expect(res.status).toBe(201);
        expect(res.body.userId).toBeDefined();
    });

    it('rejects duplicate username', async () => {
        const u = suffix();
        const body = {
            username: `dup_${u}`,
            email: `a_${u}@example.com`,
            password: 'secret12',
        };
        const first = await request(app).post('/api/auth/register').send(body);
        expect(first.status).toBe(201);
        const second = await request(app)
            .post('/api/auth/register')
            .send({ ...body, email: `b_${u}@example.com` });
        expect(second.status).toBe(400);
    });
});

describe('GET /api/posts without token', () => {
    it('returns 401', async () => {
        const res = await request(app).get('/api/posts');
        expect(res.status).toBe(401);
    });
});
