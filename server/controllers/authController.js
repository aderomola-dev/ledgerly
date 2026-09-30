const { query } = require('../config/db');
const { pool } = require('../config/db');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { signAccessToken } = require('../config/tokens');

const DUMMY_PASSWORD_HASH = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 12);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN_LENGTH = 12;

function isValidPassword(password) {
    return typeof password === 'string'
        && password.length >= PASSWORD_MIN_LENGTH
        && Buffer.byteLength(password, 'utf8') <= 72;
}

async function register(req, res) {
    const body = req.body;
    const fullName = typeof body?.fullName === 'string' ? body.fullName.trim() : '';
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = body?.password;

    if (fullName.length < 1 || fullName.length > 120 || !EMAIL_PATTERN.test(email) || email.length > 254 || !isValidPassword(password)) {
        return res.status(400).json({
            success: false,
            error: `Provide a name (1-120 characters), valid email, and password (${PASSWORD_MIN_LENGTH}-72 UTF-8 bytes).`
        });
    }

    let client;
    try {
        client = await pool.connect();
        const passwordHash = await bcrypt.hash(password, 12);
        await client.query('BEGIN');
        const userResult = await client.query(
            'INSERT INTO users (full_name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, full_name, email, role',
            [fullName, email, passwordHash, 'user']
        );
        const user = userResult.rows[0];
        await client.query(
            'INSERT INTO accounts (user_id, account_name, account_type, currency, balance) VALUES ($1, $2, $3, $4, $5)',
            [String(user.id), 'Main Account', 'bank', 'NGN', 0]
        );
        await client.query('COMMIT');

        return res.status(201).json({
            success: true,
            data: {
                user: { id: String(user.id), fullName: user.full_name, email: user.email, role: user.role },
                token: signAccessToken(user.id)
            },
            message: 'Account created successfully.'
        });
    } catch (error) {
        await client?.query('ROLLBACK').catch(() => {});
        if (error.code === '23505') {
            return res.status(409).json({ success: false, error: 'An account with this email already exists.' });
        }
        if (process.env.NODE_ENV === 'development') console.error('Registration error:', error.stack || error.message);
        return res.status(500).json({ success: false, error: 'Registration service error.' });
    } finally {
        client?.release();
    }
}

async function login(req, res) {
    try {
        const body = req.body;
        const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
        const password = typeof body?.password === 'string' ? body.password : '';

        if (!EMAIL_PATTERN.test(email) || email.length > 254 || !isValidPassword(password)) {
            return res.status(400).json({
                success: false,
                error: 'A valid email and password are required.'
            });
        }

        const result = await query(
            `SELECT id, full_name, email, password_hash, role FROM users WHERE email = $1 LIMIT 1`,
            [email]
        );

        const user = result.rows[0];
        const storedHash = typeof user?.password_hash === 'string' && /^\$2[aby]\$/.test(user.password_hash)
            ? user.password_hash
            : DUMMY_PASSWORD_HASH;
        const passwordMatches = await bcrypt.compare(password, storedHash);

        if (!user || storedHash === DUMMY_PASSWORD_HASH || !passwordMatches) {
            return res.status(401).json({ success: false, error: 'Invalid email or password.' });
        }

        const token = signAccessToken(user.id);
        return res.status(200).json({
            success: true,
            data: {
                user: {
                    id: String(user.id),
                    fullName: user.full_name,
                    email: user.email,
                    role: user.role
                },
                token
            },
            message: 'Login successful.'
        });
    } catch (error) {
        if (process.env.NODE_ENV === 'development') console.error('Login error:', error.stack || error.message);
        return res.status(500).json({
            success: false,
            error: 'Authentication service error.'
        });
    }
}

module.exports = {
    login,
    register
};
