const request = require('supertest');
const app = require('../server');

const runDbTests = process.env.GITHUB_ACTIONS === 'true' || process.env.RUN_DB_INTEGRATION === '1';
const describeDb = runDbTests ? describe : describe.skip;

describeDb('GET /api/ready', () => {
    it('returns 200 when MySQL is reachable', async () => {
        const res = await request(app).get('/api/ready');
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.checks.mysql).toBe(true);
    });
});
