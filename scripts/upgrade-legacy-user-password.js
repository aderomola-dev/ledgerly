require('dotenv').config();
const readline = require('readline');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { query } = require('../server/config/db');
const { validateEnvironment } = require('../server/config/env');

const LEGACY_PASSWORD_MARKER = 'DEV_ONLY_NOT_FOR_AUTH';
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ask(prompt) {
    return new Promise((resolve) => {
        const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
        terminal.question(prompt, (answer) => {
            terminal.close();
            resolve(answer.trim());
        });
    });
}

function askPasswordHidden() {
    if (!process.stdin.isTTY || !process.stdin.setRawMode) {
        throw new Error('Run this one-time password setup from an interactive terminal.');
    }

    return new Promise((resolve, reject) => {
        const input = process.stdin;
        let password = '';
        process.stdout.write('New password (hidden, 12-72 UTF-8 bytes): ');
        input.setRawMode(true);
        input.resume();
        input.setEncoding('utf8');

        const onData = (character) => {
            if (character === '\u0003') {
                cleanup();
                reject(new Error('Cancelled.'));
            } else if (character === '\r' || character === '\n') {
                cleanup();
                process.stdout.write('\n');
                resolve(password);
            } else if (character === '\u007f' || character === '\b') {
                password = password.slice(0, -1);
            } else if (character >= ' ' && character !== '\u001b') {
                password += character;
            }
        };

        function cleanup() {
            input.removeListener('data', onData);
            input.setRawMode(false);
            input.pause();
        }

        input.on('data', onData);
    });
}

async function main() {
    validateEnvironment();
    const email = (await ask('Legacy account email: ')).toLowerCase();
    if (!emailPattern.test(email) || email.length > 254) throw new Error('Invalid email address.');

    const password = await askPasswordHidden();
    if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
        throw new Error('Password must be 12-72 UTF-8 bytes. No database changes were made.');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await query(
        'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE email = $2 AND password_hash = $3 RETURNING id',
        [passwordHash, email, LEGACY_PASSWORD_MARKER]
    );
    if (result.rowCount !== 1) {
        throw new Error('No eligible legacy account was updated. Only accounts with the old development-only marker can be upgraded by this script.');
    }

    const baseUrl = `http://127.0.0.1:${process.env.PORT || 5000}/api/auth/login`;
    const validLogin = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });
    const invalidLogin = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: crypto.randomBytes(32).toString('base64url') })
    });
    if (!validLogin.ok || invalidLogin.status !== 401) {
        throw new Error(`Password was updated, but login verification failed (valid=${validLogin.status}, invalid=${invalidLogin.status}).`);
    }

    console.log('Legacy password upgraded; valid login=PASS; incorrect password=401; credential and hash were not printed.');
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
}).finally(async () => {
    const { pool } = require('../server/config/db');
    await pool.end();
});
