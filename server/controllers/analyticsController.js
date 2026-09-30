const { query } = require('../config/db');

const MONTH_RANGE_LIMIT = 1200;

function parseDateRange(req) {
    const from = req.query.from || null;
    const to = req.query.to || null;

    for (const [field, value] of [['from', from], ['to', to]]) {
        if (value === null) continue;

        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
        if (!match) {
            return { error: `Invalid ${field} date. Use YYYY-MM-DD.` };
        }

        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);
        const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
        const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];

        if (year === 0 || !daysInMonth || day < 1 || day > daysInMonth) {
            return { error: `Invalid ${field} date. Use a real calendar date.` };
        }
    }

    if (from && to && from > to) {
        return { error: '`from` date must be on or before `to` date.' };
    }

    return { from, to };
}

function getDateFilterParams(req, res) {
    const dateRange = parseDateRange(req);
    if (dateRange.error) {
        res.status(400).json({ success: false, error: dateRange.error });
        return null;
    }

    return [String(req.userId), dateRange.from, dateRange.to];
}

function toAmount(value) {
    return Number(value) || 0;
}

/**
 * GET /api/analytics/summary
 * Balance and savings are defined as income minus expense. Transfers are
 * internal account movements and are not counted as income or expense.
 */
async function getSummary(req, res) {
    const values = getDateFilterParams(req, res);
    if (!values) return;

    try {
        const result = await query(
            `
            SELECT
                COALESCE(SUM(CASE WHEN t.transaction_type = 'income' THEN t.amount ELSE 0 END), 0) AS total_income,
                COALESCE(SUM(CASE WHEN t.transaction_type = 'expense' THEN t.amount ELSE 0 END), 0) AS total_expenses
            FROM transactions t
            INNER JOIN accounts a ON a.id = t.account_id
            WHERE a.user_id = $1
              AND ($2::date IS NULL OR t.transaction_date >= $2::date)
              AND ($3::date IS NULL OR t.transaction_date < ($3::date + INTERVAL '1 day'))
            `,
            values
        );

        const totalIncome = toAmount(result.rows[0].total_income);
        const totalExpenses = toAmount(result.rows[0].total_expenses);
        const totalBalance = totalIncome - totalExpenses;

        res.status(200).json({
            success: true,
            data: {
                totalBalance,
                totalIncome,
                totalExpenses,
                totalSavings: totalBalance
            }
        });
    } catch (error) {
        console.error('Get analytics summary error:', error);
        res.status(500).json({ success: false, error: 'Server error fetching analytics summary.' });
    }
}

/**
 * GET /api/analytics/categories
 * Only expense transactions contribute to category spending percentages.
 */
async function getCategorySpending(req, res) {
    const values = getDateFilterParams(req, res);
    if (!values) return;

    try {
        const result = await query(
            `
            SELECT
                COALESCE(c.name, 'Other') AS category,
                SUM(t.amount) AS amount,
                ROUND(
                    SUM(t.amount) * 100 / NULLIF(SUM(SUM(t.amount)) OVER (), 0),
                    2
                ) AS percentage
            FROM transactions t
            INNER JOIN accounts a ON a.id = t.account_id
            LEFT JOIN categories c
                ON c.id = t.category_id
               AND (c.user_id = a.user_id OR c.user_id IS NULL)
            WHERE a.user_id = $1
              AND t.transaction_type = 'expense'
              AND ($2::date IS NULL OR t.transaction_date >= $2::date)
              AND ($3::date IS NULL OR t.transaction_date < ($3::date + INTERVAL '1 day'))
            GROUP BY COALESCE(c.name, 'Other')
            ORDER BY SUM(t.amount) DESC, category ASC
            `,
            values
        );

        res.status(200).json({
            success: true,
            data: {
                categories: result.rows.map((row) => ({
                    category: row.category,
                    amount: toAmount(row.amount),
                    percentage: toAmount(row.percentage)
                }))
            }
        });
    } catch (error) {
        console.error('Get analytics categories error:', error);
        res.status(500).json({ success: false, error: 'Server error fetching category analytics.' });
    }
}

function monthIndex(month) {
    const [year, monthNumber] = month.split('-').map(Number);
    return year * 12 + monthNumber - 1;
}

function monthKey(index) {
    const year = Math.floor(index / 12);
    const month = (index % 12) + 1;
    return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * GET /api/analytics/monthly
 * Calendar months use PostgreSQL's session timezone for transaction_date.
 * Missing months between the effective range endpoints are returned as zero.
 */
async function getMonthlyAnalytics(req, res) {
    const values = getDateFilterParams(req, res);
    if (!values) return;

    const [, from, to] = values;
    if (from && to && monthIndex(to.slice(0, 7)) - monthIndex(from.slice(0, 7)) + 1 > MONTH_RANGE_LIMIT) {
        return res.status(400).json({
            success: false,
            error: `Monthly date ranges cannot exceed ${MONTH_RANGE_LIMIT} months.`
        });
    }

    try {
        const result = await query(
            `
            SELECT
                TO_CHAR(DATE_TRUNC('month', t.transaction_date), 'YYYY-MM') AS month,
                COALESCE(SUM(CASE WHEN t.transaction_type = 'income' THEN t.amount ELSE 0 END), 0) AS income,
                COALESCE(SUM(CASE WHEN t.transaction_type = 'expense' THEN t.amount ELSE 0 END), 0) AS expenses
            FROM transactions t
            INNER JOIN accounts a ON a.id = t.account_id
            WHERE a.user_id = $1
              AND ($2::date IS NULL OR t.transaction_date >= $2::date)
              AND ($3::date IS NULL OR t.transaction_date < ($3::date + INTERVAL '1 day'))
            GROUP BY DATE_TRUNC('month', t.transaction_date)
            ORDER BY DATE_TRUNC('month', t.transaction_date) ASC
            `,
            values
        );

        const monthlyTotals = new Map(result.rows.map((row) => [row.month, {
            income: toAmount(row.income),
            expenses: toAmount(row.expenses)
        }]));

        let startMonth;
        let endMonth;
        if (from) startMonth = from.slice(0, 7);
        else if (result.rows.length > 0) startMonth = result.rows[0].month;

        if (to) endMonth = to.slice(0, 7);
        else if (result.rows.length > 0) endMonth = result.rows[result.rows.length - 1].month;

        if (startMonth && endMonth && monthIndex(endMonth) - monthIndex(startMonth) + 1 > MONTH_RANGE_LIMIT) {
            return res.status(400).json({
                success: false,
                error: `Monthly date ranges cannot exceed ${MONTH_RANGE_LIMIT} months.`
            });
        }

        const months = [];
        if (startMonth && endMonth) {
            for (let index = monthIndex(startMonth); index <= monthIndex(endMonth); index++) {
                const month = monthKey(index);
                const totals = monthlyTotals.get(month) || { income: 0, expenses: 0 };
                months.push({
                    month,
                    income: totals.income,
                    expenses: totals.expenses,
                    net: totals.income - totals.expenses
                });
            }
        }

        res.status(200).json({ success: true, data: { months } });
    } catch (error) {
        console.error('Get analytics monthly error:', error);
        res.status(500).json({ success: false, error: 'Server error fetching monthly analytics.' });
    }
}

module.exports = {
    getSummary,
    getCategorySpending,
    getMonthlyAnalytics
};
