const { query } = require('../config/db');

async function getUserAccounts(req, res) {
    try {
        const result = await query(
            `
            SELECT id, account_name, account_type, currency, balance
            FROM accounts
            WHERE user_id = $1
            ORDER BY id ASC
            `,
            [String(req.userId)]
        );

        res.status(200).json({
            success: true,
            count: result.rows.length,
            data: result.rows.map((account) => ({
                id: String(account.id),
                name: account.account_name,
                type: account.account_type,
                currency: account.currency.trim(),
                balance: Number(account.balance) || 0
            }))
        });
    } catch (error) {
        console.error('Get user accounts error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error fetching accounts.'
        });
    }
}

module.exports = { getUserAccounts };
