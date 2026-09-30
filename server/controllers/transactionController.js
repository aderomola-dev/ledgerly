const { query } = require('../config/db');

function normalizeTransactionRow(row) {
    return {
        id: String(row.id),
        account_id: row.account_id ? String(row.account_id) : null,
        category_id: row.category_id ? String(row.category_id) : null,
        amount: Number(row.amount),
        type: row.type,
        name: row.name || '',
        category: row.category || 'Other',
        date: row.date ? new Date(row.date).toISOString().split('T')[0] : '',
        notes: row.notes || ''
    };
}

const MAX_POSTGRES_BIGINT = 9223372036854775807n;
const MAX_TRANSACTION_AMOUNT = 999999999999.99;
const VALID_TRANSACTION_TYPES = new Set(['income', 'expense']);

function normalizePositiveId(value) {
    if (!(typeof value === 'string' || typeof value === 'number') || !/^\d{1,19}$/.test(String(value))) return null;
    try {
        const parsed = BigInt(value);
        return parsed > 0n && parsed <= MAX_POSTGRES_BIGINT ? parsed.toString() : null;
    } catch {
        return null;
    }
}

function isValidAmount(value) {
    if (!(typeof value === 'number' || typeof value === 'string')) return false;
    const text = String(value);
    if (!/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(text)) return false;
    const amount = Number(value);
    // The existing PostgreSQL CHECK constraint requires amount > 0; zero is not valid.
    return Number.isFinite(amount) && amount > 0 && amount <= MAX_TRANSACTION_AMOUNT;
}

function isValidTransactionDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const year = Number(value.slice(0, 4));
    if (year < 1900 || year > 2100) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isValidName(value) {
    return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 120;
}

function isValidNotes(value) {
    return value === undefined || (typeof value === 'string' && value.length <= 500);
}

function isObjectBody(body) {
    return body !== null && typeof body === 'object' && !Array.isArray(body);
}

async function assertUserOwnsTransaction(userId, transactionId) {
    const result = await query(
        `
        SELECT t.id, t.transaction_type, t.category_id
        FROM transactions t
        INNER JOIN accounts a ON a.id = t.account_id
        WHERE t.id = $1 AND a.user_id = $2
        `,
        [transactionId, userId]
    );

    return result.rows[0] || null;
}

/**
 * Get all transactions
 * GET /api/transactions
 */
async function getAllTransactions(req, res) {
    try {
        const { type, search, sort = 'newest' } = req.query;
        if (type && !['income', 'expense', 'transfer'].includes(type)) {
            return res.status(400).json({ success: false, error: 'type must be income, expense, or transfer.' });
        }
        if (search !== undefined && (typeof search !== 'string' || search.length > 120)) {
            return res.status(400).json({ success: false, error: 'search must be a string of at most 120 characters.' });
        }
        if (!['newest', 'oldest'].includes(sort)) {
            return res.status(400).json({ success: false, error: 'sort must be newest or oldest.' });
        }
        const userId = req.userId;
        const values = [userId];
        const conditions = ['a.user_id = $1'];

        if (type) {
            values.push(type);
            conditions.push(`t.transaction_type = $${values.length}`);
        }

        if (search) {
            values.push(`%${search}%`);
            conditions.push(`(
                t.description ILIKE $${values.length}
                OR c.name ILIKE $${values.length}
            )`);
        }

        const whereClause = `WHERE ${conditions.join(' AND ')}`;
        const orderBy = sort === 'oldest' ? 't.transaction_date ASC' : 't.transaction_date DESC';

        const result = await query(
            `
            SELECT
                t.id,
                t.account_id,
                t.category_id,
                t.amount,
                t.transaction_type AS type,
                t.description AS name,
                t.transaction_date AS date,
                c.name AS category,
                NULLIF(t.description, '') AS notes
            FROM transactions t
            INNER JOIN accounts a ON a.id = t.account_id
            LEFT JOIN categories c ON c.id = t.category_id
            ${whereClause}
            ORDER BY ${orderBy}
            `,
            values
        );

        res.status(200).json({
            success: true,
            count: result.rows.length,
            data: result.rows.map(normalizeTransactionRow)
        });
    } catch (error) {
        console.error('Get transactions error:', error);

        res.status(500).json({
            success: false,
            error: 'Server error fetching transactions'
        });
    }
}

/**
 * Get single transaction
 * GET /api/transactions/:id
 */
async function getTransactionById(req, res) {
    try {
        const { id } = req.params;
        const transactionId = normalizePositiveId(id);
        if (!transactionId) {
            return res.status(400).json({ success: false, error: 'Transaction ID must be a valid positive integer.' });
        }
        const userId = req.userId;

        const result = await query(
            `
            SELECT
                t.id,
                t.account_id,
                t.category_id,
                t.amount,
                t.transaction_type AS type,
                t.description AS name,
                t.transaction_date AS date,
                c.name AS category,
                NULLIF(t.description, '') AS notes
            FROM transactions t
            INNER JOIN accounts a ON a.id = t.account_id
            LEFT JOIN categories c ON c.id = t.category_id
            WHERE t.id = $1 AND a.user_id = $2
            `,
            [transactionId, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Transaction not found'
            });
        }

        res.status(200).json({
            success: true,
            data: normalizeTransactionRow(result.rows[0])
        });
    } catch (error) {
        console.error('Get transaction error:', error);

        res.status(500).json({
            success: false,
            error: 'Server error retrieving transaction'
        });
    }
}

/**
 * Create transaction
 * POST /api/transactions
 */
async function createTransaction(req, res) {
    try {
        if (!isObjectBody(req.body)) {
            return res.status(400).json({ success: false, error: 'A JSON object request body is required.' });
        }

        const userId = req.userId;
        const {
            account_id,
            category_id,
            amount,
            type,
            name,
            date
        } = req.body;

        const validAccountId = normalizePositiveId(account_id);
        if (!validAccountId) {
            return res.status(400).json({
                success: false,
                error: 'A valid account_id is required.'
            });
        }

        if (!isValidAmount(amount) || !VALID_TRANSACTION_TYPES.has(type) || !isValidName(name) || !isValidTransactionDate(date) || !isValidNotes(req.body.notes)) {
            return res.status(400).json({
                success: false,
                error: 'Provide a positive amount (up to 2 decimals), income or expense type, name (1-120 characters), valid date (1900-2100), and optional notes (up to 500 characters).'
            });
        }

        const validCategoryId = category_id === undefined || category_id === null || category_id === ''
            ? null
            : normalizePositiveId(category_id);
        if (category_id !== undefined && category_id !== null && category_id !== '' && !validCategoryId) {
            return res.status(400).json({ success: false, error: 'category_id must be a valid positive integer or null.' });
        }

        const accountCheck = await query(
            `SELECT id FROM accounts WHERE id = $1 AND user_id = $2`,
            [validAccountId, userId]
        );

        if (accountCheck.rows.length === 0) {
            return res.status(403).json({
                success: false,
                error: 'You do not have access to that account.'
            });
        }

        if (validCategoryId) {
            const categoryCheck = await query(
                `SELECT id FROM categories WHERE id = $1 AND category_type = $2 AND (user_id = $3 OR user_id IS NULL)`,
                [validCategoryId, type, userId]
            );
            if (categoryCheck.rows.length === 0) {
                return res.status(403).json({ success: false, error: 'You do not have access to that category.' });
            }
        }

        const result = await query(
            `
            INSERT INTO transactions (
                account_id,
                category_id,
                amount,
                transaction_type,
                description,
                transaction_date
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING
                id,
                account_id,
                category_id,
                amount,
                transaction_type AS type,
                description AS name,
                transaction_date AS date,
                description AS notes
            `,
            [
                String(account_id),
                validCategoryId,
                Number(amount),
                type,
                name.trim(),
                date
            ]
        );

        const created = result.rows[0];
        const categoryResult = created.category_id
            ? await query(`SELECT name FROM categories WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)`, [created.category_id, userId])
            : { rows: [] };

        res.status(201).json({
            success: true,
            data: {
                ...normalizeTransactionRow({
                    ...created,
                    category: categoryResult.rows[0]?.name || 'Other'
                })
            },
            message: 'Transaction created successfully'
        });
    } catch (error) {
        console.error('Create transaction error:', error);

        res.status(500).json({
            success: false,
            error: 'Server error creating transaction'
        });
    }
}

/**
 * Update transaction
 * PUT /api/transactions/:id
 */
async function updateTransaction(req, res) {
    try {
        if (!isObjectBody(req.body)) {
            return res.status(400).json({ success: false, error: 'A JSON object request body is required.' });
        }

        const { id } = req.params;
        if (!normalizePositiveId(id)) {
            return res.status(400).json({ success: false, error: 'Transaction ID must be a valid positive integer.' });
        }
        const userId = req.userId;
        const {
            account_id,
            category_id,
            amount,
            type,
            name,
            date
        } = req.body;

        const ownedTransaction = await assertUserOwnsTransaction(userId, id);
        if (!ownedTransaction) {
            return res.status(404).json({
                success: false,
                error: 'Transaction not found'
            });
        }

        const hasAmount = Object.prototype.hasOwnProperty.call(req.body, 'amount');
        const hasType = Object.prototype.hasOwnProperty.call(req.body, 'type');
        const hasName = Object.prototype.hasOwnProperty.call(req.body, 'name');
        const hasDate = Object.prototype.hasOwnProperty.call(req.body, 'date');
        const hasNotes = Object.prototype.hasOwnProperty.call(req.body, 'notes');
        const hasDescription = hasName || hasNotes;
        const hasCategory = Object.prototype.hasOwnProperty.call(req.body, 'category_id');

        if (hasAmount && !isValidAmount(amount)) {
            return res.status(400).json({ success: false, error: 'amount must be a positive finite number with at most two decimal places.' });
        }
        if (hasType && !VALID_TRANSACTION_TYPES.has(type)) {
            return res.status(400).json({ success: false, error: 'type must be income or expense.' });
        }
        if (hasName && !isValidName(name)) {
            return res.status(400).json({ success: false, error: 'name must contain 1 to 120 characters.' });
        }
        if (hasDate && !isValidTransactionDate(date)) {
            return res.status(400).json({ success: false, error: 'date must be a valid YYYY-MM-DD date between 1900 and 2100.' });
        }
        if (hasNotes && !isValidNotes(req.body.notes)) {
            return res.status(400).json({ success: false, error: 'notes must be a string of at most 500 characters.' });
        }
        if (![hasAmount, hasType, hasName, hasDate, hasNotes, hasCategory, Object.prototype.hasOwnProperty.call(req.body, 'account_id')].some(Boolean)) {
            return res.status(400).json({ success: false, error: 'Provide at least one transaction field to update.' });
        }

        let targetAccountId = null;
        const hasAccount = Object.prototype.hasOwnProperty.call(req.body, 'account_id');
        if (hasAccount) {
            targetAccountId = normalizePositiveId(account_id);
            if (!targetAccountId) {
                return res.status(400).json({
                    success: false,
                    error: 'A valid account_id is required when changing the transaction account.'
                });
            }

            const accountCheck = await query(
                `SELECT id FROM accounts WHERE id = $1 AND user_id = $2`,
                [targetAccountId, userId]
            );
            if (accountCheck.rows.length === 0) {
                return res.status(403).json({
                    success: false,
                    error: 'You do not have access to that account.'
                });
            }

        }

        let targetCategoryId = undefined;
        if (hasCategory) {
            if (category_id === null || category_id === '') {
                targetCategoryId = null;
            } else {
                targetCategoryId = normalizePositiveId(category_id);
                if (!targetCategoryId) {
                    return res.status(400).json({ success: false, error: 'category_id must be a valid positive integer or null.' });
                }
                const resultingType = hasType ? type : ownedTransaction.transaction_type;
                const categoryCheck = await query(
                    `SELECT id FROM categories WHERE id = $1 AND category_type = $2 AND (user_id = $3 OR user_id IS NULL)`,
                    [targetCategoryId, resultingType, userId]
                );
                if (categoryCheck.rows.length === 0) {
                    return res.status(403).json({ success: false, error: 'You do not have access to that category.' });
                }
            }
        }

        if (hasType && !hasCategory && ownedTransaction.category_id) {
            const existingCategoryCheck = await query(
                `SELECT id FROM categories WHERE id = $1 AND category_type = $2 AND (user_id = $3 OR user_id IS NULL)`,
                [ownedTransaction.category_id, type, userId]
            );
            if (existingCategoryCheck.rows.length === 0) {
                return res.status(400).json({ success: false, error: 'Clear or replace the category when changing the transaction type.' });
            }
        }

        const result = await query(
            `
            UPDATE transactions
            SET
                                account_id = CASE WHEN $1::boolean THEN $2::bigint ELSE account_id END,
                                category_id = CASE WHEN $3::boolean THEN $4::bigint ELSE category_id END,
                                amount = CASE WHEN $5::boolean THEN $6::numeric ELSE amount END,
                                transaction_type = CASE WHEN $7::boolean THEN $8::text ELSE transaction_type END,
                                description = CASE WHEN $9::boolean THEN $10::text ELSE description END,
                                transaction_date = CASE WHEN $11::boolean THEN $12::date ELSE transaction_date END
                        WHERE id = $13
                            AND EXISTS (
                                    SELECT 1
                                    FROM accounts owned_account
                                    WHERE owned_account.id = transactions.account_id
                                        AND owned_account.user_id = $14
                            )
            RETURNING
                id,
                account_id,
                category_id,
                amount,
                transaction_type AS type,
                description AS name,
                transaction_date AS date,
                description AS notes
            `,
            [
                hasAccount,
                targetAccountId,
                hasCategory,
                targetCategoryId,
                hasAmount,
                hasAmount ? Number(amount) : null,
                hasType,
                hasType ? type : null,
                hasDescription,
                hasName ? name.trim() : hasNotes ? req.body.notes.trim() : null,
                hasDate,
                hasDate ? date : null,
                id,
                userId
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Transaction not found'
            });
        }

        const updated = result.rows[0];
        const categoryResult = updated.category_id
            ? await query(`SELECT name FROM categories WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)`, [updated.category_id, userId])
            : { rows: [] };

        res.status(200).json({
            success: true,
            data: {
                ...normalizeTransactionRow({
                    ...updated,
                    category: categoryResult.rows[0]?.name || 'Other'
                })
            },
            message: 'Transaction updated successfully'
        });
    } catch (error) {
        console.error('Update transaction error:', error);

        res.status(500).json({
            success: false,
            error: 'Server error updating transaction'
        });
    }
}

/**
 * Delete transaction
 * DELETE /api/transactions/:id
 */
async function deleteTransaction(req, res) {
    try {
        const { id } = req.params;
        const transactionId = normalizePositiveId(id);
        if (!transactionId) {
            return res.status(400).json({ success: false, error: 'Transaction ID must be a valid positive integer.' });
        }
        const userId = req.userId;

        const result = await query(
            `
            DELETE FROM transactions t
            USING accounts a
            WHERE t.id = $1
              AND a.id = t.account_id
              AND a.user_id = $2
            RETURNING t.id
            `,
            [transactionId, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Transaction not found'
            });
        }

        res.status(200).json({
            success: true,
            data: {
                id: result.rows[0].id
            },
            message: 'Transaction deleted successfully'
        });
    } catch (error) {
        console.error('Delete transaction error:', error);

        res.status(500).json({
            success: false,
            error: 'Server error deleting transaction'
        });
    }
}

module.exports = {
    getAllTransactions,
    getTransactionById,
    createTransaction,
    updateTransaction,
    deleteTransaction
};