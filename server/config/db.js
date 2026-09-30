/**
 * Database Configuration & Connection Pool Foundation
 * Prepares the connection structure for PostgreSQL integration (using package: pg)
 */

const { Pool } = require('pg');
require('dotenv').config();
const { validateEnvironment } = require('./env');

validateEnvironment();

// Initialize the connection pool configuration
const poolConfig = process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false
    }
    : {
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: Number(process.env.DB_PORT),
    };

const pool = new Pool(poolConfig);

// Helper function to test DB connection when database is configured
async function testConnection() {
    try {
        const client = await pool.connect();
        console.log('✅ PostgreSQL Database connected successfully.');
        client.release();
        return true;
    } catch (err) {
        if (process.env.NODE_ENV === 'development') {
            console.warn('⚠️  PostgreSQL connection failed:', err.message);
        } else {
            console.warn('⚠️  PostgreSQL connection failed.');
        }
        return false;
    }
}

module.exports = {
    pool,
    query: (text, params) => pool.query(text, params),
    testConnection
};
