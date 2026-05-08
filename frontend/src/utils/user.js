/**
 * API / DB often return ids as strings; JWT/localStorage may use numbers.
 * Strict === breaks author display and edit/delete visibility.
 */
export function sameUserId(a, b) {
    if (a === undefined || a === null || b === undefined || b === null) return false;
    const na = Number(a);
    const nb = Number(b);
    if (Number.isNaN(na) || Number.isNaN(nb)) return String(a) === String(b);
    return na === nb;
}

/** Prefer session username for “you”; otherwise server-provided display name. */
export function postAuthorDisplay(post, viewer) {
    if (!post) return 'Unknown';
    if (viewer && sameUserId(post.user_id, viewer.id)) {
        return viewer.username || post.username || `User ${post.user_id}`;
    }
    return post.username || `User ${post.user_id}`;
}
