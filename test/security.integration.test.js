const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= require('node:crypto').randomBytes(48).toString('base64url');

const app = require('../server');
const { pool } = require('../server/config/db');
const { JWT_ISSUER, JWT_AUDIENCE } = require('../server/config/tokens');

const server = app.listen(0);
const base = new Promise((resolve) => server.once('listening', () => resolve(`http://127.0.0.1:${server.address().port}`)));
const runId = require('node:crypto').randomUUID();
const testPassword = 'Test-only-Ledgerly-Passphrase-79!';
let firstUser;
let secondUser;
let firstCategoryId;
let secondCategoryId;
let transactionId;
let results = [];

async function request(path, { token, headers = {}, ...options } = {}) {
    const origin = await base;
    const response = await fetch(`${origin}${path}`, {
        ...options,
        headers: {
            ...(options.body && typeof options.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
            ...headers,
            ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
    });
    let body = {};
    try { body = await response.json(); } catch {}
    return { response, body };
}

async function register(email, fullName) {
    const result = await request('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, fullName, password: testPassword })
    });
    assert.equal(result.response.status, 201, result.body.error);
    assert.ok(result.body.data.token);
    return result.body.data;
}

async function assertGroup(name, fn) {
    await fn();
    results.push(name);
    console.log(`PASS ${name}`);
}

test('Ledgerly security integration', { concurrency: false }, async (t) => {
    try {
        firstUser = await register(`security-${runId}@example.test`, 'Security Test One');
        secondUser = await register(`security-other-${runId}@example.test`, 'Security Test Two');

        const userRows = await pool.query('SELECT id FROM users WHERE email = ANY($1::text[])', [[`security-${runId}@example.test`, `security-other-${runId}@example.test`]]);
        assert.equal(userRows.rows.length, 2);
        firstUser.id = String(userRows.rows.find((row) => String(row.id) === String(jwt.decode(firstUser.token).sub))?.id);
        secondUser.id = String(userRows.rows.find((row) => String(row.id) === String(jwt.decode(secondUser.token).sub))?.id);

        const categoryOne = await pool.query("INSERT INTO categories(user_id,name,category_type) VALUES($1,$2,'expense') RETURNING id", [firstUser.id, `Private one ${runId}`]);
        firstCategoryId = String(categoryOne.rows[0].id);
        const categoryTwo = await pool.query("INSERT INTO categories(user_id,name,category_type) VALUES($1,$2,'expense') RETURNING id", [secondUser.id, `Private two ${runId}`]);
        secondCategoryId = String(categoryTwo.rows[0].id);

        await assertGroup('Registration, password hashing, valid login, invalid login', async () => {
            const stored = await pool.query('SELECT password_hash FROM users WHERE id=$1', [firstUser.id]);
            assert.match(stored.rows[0].password_hash, /^\$2[aby]\$/);
            const valid = await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: `security-${runId}@example.test`, password: testPassword }) });
            assert.equal(valid.response.status, 200);
            assert.ok(jwt.decode(valid.body.data.token).exp > Math.floor(Date.now() / 1000));
            const invalid = await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: `security-${runId}@example.test`, password: 'incorrect-password-123' }) });
            assert.equal(invalid.response.status, 401);
            assert.equal('password_hash' in valid.body.data.user, false);
            assert.equal('password' in valid.body.data.user, false);
        });

        await assertGroup('Missing, expired, malformed, forged JWT and x-user-id are rejected', async () => {
            assert.equal((await request('/api/accounts')).response.status, 401);
            assert.equal((await request('/api/accounts', { headers: { 'x-user-id': firstUser.id } })).response.status, 401);
            const expired = jwt.sign({}, process.env.JWT_SECRET, { algorithm: 'HS256', subject: firstUser.id, issuer: JWT_ISSUER, audience: JWT_AUDIENCE, expiresIn: -1 });
            assert.equal((await request('/api/accounts', { token: expired })).response.status, 401);
            assert.equal((await request('/api/accounts', { token: 'not.a.jwt' })).response.status, 401);
            const parts = firstUser.token.split('.');
            parts[2] = `${parts[2].slice(0, -1)}${parts[2].endsWith('a') ? 'b' : 'a'}`;
            assert.equal((await request('/api/accounts', { token: parts.join('.') })).response.status, 401);
        });

        await assertGroup('Account, transaction and category isolation is user-scoped', async () => {
            const accountsOne = await request('/api/accounts', { token: firstUser.token });
            const accountsTwo = await request('/api/accounts', { token: secondUser.token });
            assert.equal(accountsOne.response.status, 200);
            assert.equal(accountsTwo.response.status, 200);
            assert.equal(accountsOne.body.data.length, 1);
            assert.equal(accountsTwo.body.data.length, 1);
            assert.notEqual(accountsOne.body.data[0].id, accountsTwo.body.data[0].id);

            const categoriesOne = await request('/api/categories', { token: firstUser.token });
            assert.ok(categoriesOne.body.data.some((category) => String(category.id) === firstCategoryId));
            assert.ok(!categoriesOne.body.data.some((category) => String(category.id) === secondCategoryId));

            const crossCategory = await request('/api/transactions', {
                token: firstUser.token, method: 'POST',
                body: JSON.stringify({ account_id: accountsOne.body.data[0].id, category_id: secondCategoryId, amount: 25, type: 'expense', name: 'category isolation', date: '2026-09-29' })
            });
            assert.equal(crossCategory.response.status, 403);

            const created = await request('/api/transactions', {
                token: firstUser.token, method: 'POST',
                body: JSON.stringify({ account_id: accountsOne.body.data[0].id, category_id: firstCategoryId, amount: 25.5, type: 'expense', name: 'owned transaction', notes: 'valid note', date: '2026-09-29' })
            });
            assert.equal(created.response.status, 201, created.body.error);
            transactionId = String(created.body.data.id);
            assert.equal(String(created.body.data.account_id), accountsOne.body.data[0].id);

            assert.equal((await request(`/api/transactions/${transactionId}`, { token: secondUser.token })).response.status, 404);
            assert.equal((await request(`/api/transactions/${transactionId}`, { token: secondUser.token, method: 'DELETE' })).response.status, 404);
            const deniedUpdate = await request(`/api/transactions/${transactionId}`, {
                token: secondUser.token, method: 'PUT', body: JSON.stringify({ amount: 50 })
            });
            assert.equal(deniedUpdate.response.status, 404);
        });

        await assertGroup('Invalid transaction input and malformed IDs return 400', async () => {
            const account = (await request('/api/accounts', { token: firstUser.token })).body.data[0];
            const cases = [
                { amount: 'NaN' }, { amount: 'Infinity' }, { amount: -1 }, { amount: 0 },
                { amount: '1.001' }, { amount: 1000000000000 }, { type: 'transfer' },
                { name: '   ' }, { name: 'n'.repeat(121) }, { date: '2026-02-30' },
                { date: '1899-12-31' }, { date: '2026/09/29' }, { notes: 12 },
                { notes: 'n'.repeat(501) }, { account_id: '1 OR 1=1' }, { category_id: '1;DROP TABLE users' }
            ];
            for (const invalid of cases) {
                const payload = { account_id: account.id, amount: 10, type: 'expense', name: 'input validation', date: '2026-09-29', ...invalid };
                const result = await request('/api/transactions', { token: firstUser.token, method: 'POST', body: JSON.stringify(payload) });
                assert.equal(result.response.status, 400, JSON.stringify(invalid));
            }
            assert.equal((await request('/api/transactions/not-an-id', { token: firstUser.token })).response.status, 400);
            assert.equal((await request('/api/transactions/0', { token: firstUser.token, method: 'DELETE' })).response.status, 400);

            const updated = await request(`/api/transactions/${transactionId}`, {
                token: firstUser.token, method: 'PUT', body: JSON.stringify({ category_id: null, amount: 26 })
            });
            assert.equal(updated.response.status, 200);
            assert.equal(updated.body.data.category_id, null);
            const invalidUpdate = await request(`/api/transactions/${transactionId}`, {
                token: firstUser.token, method: 'PUT', body: JSON.stringify({ amount: -3 })
            });
            assert.equal(invalidUpdate.response.status, 400);
        });

        await assertGroup('Settings require auth and only update the current user', async () => {
            assert.equal((await request('/api/settings')).response.status, 401);
            assert.equal((await request('/api/settings', { method: 'PUT', body: JSON.stringify({ userName: 'Unauthenticated' }) })).response.status, 401);
            const update = await request('/api/settings', { token: firstUser.token, method: 'PUT', body: JSON.stringify({ userName: 'Private Updated Name' }) });
            assert.equal(update.response.status, 200);
            const read = await request('/api/settings', { token: secondUser.token });
            assert.notEqual(read.body.data.userName, 'Private Updated Name');
        });

        await assertGroup('Backend sources and environment files are not publicly served', async () => {
            for (const path of ['/server/config/db.js', '/server/controllers/authController.js', '/server/middleware/auth.js', '/package.json', '/.env', '/.gitignore']) {
                const result = await request(path);
                assert.equal(result.response.status, 404, `${path} must not be served`);
            }
            assert.equal((await request('/')).response.status, 200);
            assert.equal((await request('/script.js')).response.status, 200);
        });

        await assertGroup('Malformed and oversized JSON bodies receive safe client errors', async () => {
            const malformed = await request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{not-json' });
            assert.equal(malformed.response.status, 400);
            assert.ok(!JSON.stringify(malformed.body).includes('SyntaxError'));
            const large = await request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filler: 'x'.repeat(20000) }) });
            assert.equal(large.response.status, 413);
            assert.ok(!JSON.stringify(large.body).includes('entity.too.large'));
        });

        console.log(`${results.length} security integration groups passed.`);
    } finally {
        if (transactionId) await pool.query('DELETE FROM transactions WHERE id=$1', [transactionId]).catch(() => {});
        if (firstCategoryId) await pool.query('DELETE FROM categories WHERE id=$1', [firstCategoryId]).catch(() => {});
        if (secondCategoryId) await pool.query('DELETE FROM categories WHERE id=$1', [secondCategoryId]).catch(() => {});
        const emails = [`security-${runId}@example.test`, `security-other-${runId}@example.test`];
        await pool.query('DELETE FROM transactions WHERE account_id IN (SELECT id FROM accounts WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1::text[])))', [emails]).catch(() => {});
        await pool.query('DELETE FROM accounts WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1::text[]))', [emails]).catch(() => {});
        await pool.query('DELETE FROM users WHERE email = ANY($1::text[])', [emails]).catch(() => {});
        await new Promise((resolve) => server.close(resolve));
        await pool.end();
    }
});
