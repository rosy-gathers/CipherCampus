const request = require('supertest');
const app = require('../server');

describe('GET /api/health', () => {
    it('returns ok', async () => {
        const res = await request(app).get('/api/health');
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.service).toBe('ciphercampus-backend');
    });
});
