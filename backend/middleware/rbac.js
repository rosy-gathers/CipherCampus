const adminOnly = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied. Admin only.' });
    }
    next();
};

const userOnly = (req, res, next) => {
    if (req.user.role !== 'user' && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied.' });
    }
    next();
};

const checkOwnership = (req, resourceOwnerId) => {
    if (req.user.role === 'admin') return true;
    return Number(req.user.id) === Number(resourceOwnerId);
};

module.exports = { adminOnly, userOnly, checkOwnership };