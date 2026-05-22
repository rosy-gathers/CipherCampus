const request = require('supertest');
const app = require('../server');

jest.mock('../config/database', () => ({
    query: jest.fn(),
}));

const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

describe('authMiddleware', () => {
    beforeEach(() => {
        db.query.mockReset();
    });

    it('returns 401 problem+json when no token', async () => {
        const req = { headers: {}, cookies: {} };
        const res = {
            statusCode: 200,
            status(n) {
                this.statusCode = n;
                return this;
            },
            type() {
                return this;
            },
            json(body) {
                this.body = body;
                return this;
            },
        };
        const next = jest.fn();
        await authMiddleware(req, res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(401);
        expect(res.body.type).toMatch(/problems\/unauthorized/);
        expect(res.body.error).toBe('Access denied. No token provided.');
    });

    it('GET /api/posts without token returns 401 with error field', async () => {
        const res = await request(app).get('/api/posts');
        expect(res.status).toBe(401);
        expect(res.body.error).toBeDefined();
        expect(res.body.detail).toBe(res.body.error);
    });
});
