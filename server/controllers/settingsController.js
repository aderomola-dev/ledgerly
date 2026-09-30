const { query } = require('../config/db');

const MAX_NAME_LENGTH = 120;

async function getSettings(req, res) {
    try {
        const result = await query('SELECT full_name FROM users WHERE id = $1', [String(req.userId)]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'User settings not found.' });
        }

        return res.status(200).json({
            success: true,
            data: { userName: result.rows[0].full_name, currency: '₦' }
        });
    } catch (error) {
        if (process.env.NODE_ENV === 'development') console.error('Get settings error:', error.stack || error.message);
        return res.status(500).json({ success: false, error: 'Server error fetching settings.' });
    }
}

async function updateSettings(req, res) {
    const { userName } = req.body || {};
    if (typeof userName !== 'string' || userName.trim().length < 1 || userName.trim().length > MAX_NAME_LENGTH) {
        return res.status(400).json({ success: false, error: `userName must contain 1 to ${MAX_NAME_LENGTH} characters.` });
    }

    try {
        const result = await query(
            'UPDATE users SET full_name = $1, updated_at = NOW() WHERE id = $2 RETURNING full_name',
            [userName.trim(), String(req.userId)]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'User settings not found.' });
        }

        return res.status(200).json({
            success: true,
            data: { userName: result.rows[0].full_name },
            message: 'Profile name updated. Currency remains a browser preference.'
        });
    } catch (error) {
        if (process.env.NODE_ENV === 'development') console.error('Update settings error:', error.stack || error.message);
        return res.status(500).json({ success: false, error: 'Server error updating settings.' });
    }
}

module.exports = {
    getSettings,
    updateSettings
};
