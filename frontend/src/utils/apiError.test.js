import { getApiErrorMessage } from './apiError';

describe('getApiErrorMessage', () => {
    it('reads legacy error field', () => {
        const err = { response: { data: { error: 'Bad credentials' } } };
        expect(getApiErrorMessage(err, 'fallback')).toBe('Bad credentials');
    });

    it('reads RFC 7807 detail', () => {
        const err = { response: { data: { detail: 'Session expired', title: 'Unauthorized' } } };
        expect(getApiErrorMessage(err, 'fallback')).toBe('Session expired');
    });

    it('prefers error over title when both set', () => {
        const err = { response: { data: { error: 'X', detail: 'Y' } } };
        expect(getApiErrorMessage(err)).toBe('X');
    });

    it('uses fallback when empty body', () => {
        expect(getApiErrorMessage({ response: {} }, 'nope')).toBe('nope');
    });
});
