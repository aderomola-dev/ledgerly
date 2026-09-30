const { query } = require('../config/db');
const { verifyAccessToken } = require('../config/tokens');

function getBearerToken(req) {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader) {
        return null;
    }

    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
        return parts[1];
    }

    return null;
}

async function requireAuth(req, res, next) {
    try {
        const token = getBearerToken(req);

        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required.'
            });
        }

        let claims;
        try {
            claims = verifyAccessToken(token);
        } catch {
            return res.status(401).json({
                success: false,
                error: 'Invalid or expired authentication token.'
            });
        }

        const userId = claims.sub;
        if (typeof userId !== 'string' || !/^\d{1,19}$/.test(userId) || BigInt(userId) <= 0n) {
            return res.status(401).json({
                success: false,
                error: 'Invalid or expired authentication token.'
            });
        }

        const result = await query(
            `SELECT id, full_name, email, role FROM users WHERE id = $1`,
            [userId]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                error: 'Invalid or expired authentication token.'
            });
        }

        req.user = result.rows[0];
        req.userId = String(result.rows[0].id);
        return next();
    } catch (error) {
        if (process.env.NODE_ENV === 'development') console.error('Auth check failed:', error.stack || error.message);
        return res.status(500).json({
            success: false,
            error: 'Authentication service error.'
        });
    }
}

module.exports = {
    requireAuth,
    getBearerToken
};
