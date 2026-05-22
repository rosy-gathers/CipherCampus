/**
 * Normalize API errors: supports legacy `{ error }` and RFC 7807 `{ detail, title }`.
 * @param {unknown} error - axios error or other
 * @param {string} fallback
 * @returns {string}
 */
export function getApiErrorMessage(error, fallback = 'Something went wrong.') {
    const data = error?.response?.data;
    if (data == null) {
        return typeof error?.message === 'string' && error.message ? error.message : fallback;
    }
    if (typeof data === 'string') return data;
    if (typeof data.error === 'string') return data.error;
    if (typeof data.detail === 'string') return data.detail;
    if (typeof data.title === 'string') return data.title;
    return fallback;
}
