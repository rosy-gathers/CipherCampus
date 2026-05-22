import { decodeJwtPayload } from './jwt';

describe('decodeJwtPayload', () => {
    it('returns null for invalid input', () => {
        expect(decodeJwtPayload('')).toBeNull();
        expect(decodeJwtPayload('not-a-jwt')).toBeNull();
    });

    it('decodes a standard JWT payload segment', () => {
        const payload = { exp: 2000000000, userId: 1 };
        const b64url = btoa(JSON.stringify(payload))
            .replace(/=+$/g, '')
            .replace(/\+/g, '-')
            .replace(/\//g, '_');
        const token = `x.${b64url}.sig`;
        const out = decodeJwtPayload(token);
        expect(out.exp).toBe(2000000000);
        expect(out.userId).toBe(1);
    });
});
