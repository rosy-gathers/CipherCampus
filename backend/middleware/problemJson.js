/**
 * RFC 7807 Problem Details for HTTP APIs (subset).
 * @see https://www.rfc-editor.org/rfc/rfc7807
 */
const PROBLEM_BASE = process.env.PROBLEM_TYPE_BASE || 'https://ciphercampus.dev/problems';

function problem(res, status, title, detail, typeSlug = 'error', extras) {
    const d = detail || title;
    const body = {
        type: `${PROBLEM_BASE}/${typeSlug}`,
        title,
        status,
        detail: d,
        error: d,
        ...(extras && typeof extras === 'object' ? extras : {}),
    };
    return res.status(status).type('application/problem+json').json(body);
}

function problemFromError(res, err, status = 500) {
    return problem(res, status, err.message || 'Server Error', err.message, 'internal-error');
}

module.exports = { problem, problemFromError, PROBLEM_BASE };
