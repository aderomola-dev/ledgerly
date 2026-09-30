-- Ledgerly PostgreSQL baseline schema.
-- Apply only to a new/empty database. Existing databases are not modified by this project.

CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    full_name VARCHAR NOT NULL,
    email VARCHAR NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    phone VARCHAR,
    role VARCHAR NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS accounts (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    account_name VARCHAR NOT NULL,
    account_type VARCHAR NOT NULL CHECK (account_type IN ('cash', 'bank', 'savings', 'wallet', 'other')),
    currency CHAR(3) NOT NULL DEFAULT 'NGN',
    balance NUMERIC NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categories (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id),
    name VARCHAR NOT NULL,
    category_type VARCHAR NOT NULL CHECK (category_type IN ('income', 'expense')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transactions (
    id BIGSERIAL PRIMARY KEY,
    account_id BIGINT NOT NULL REFERENCES accounts(id),
    category_id BIGINT REFERENCES categories(id),
    amount NUMERIC NOT NULL CHECK (amount > 0),
    transaction_type VARCHAR NOT NULL CHECK (transaction_type IN ('income', 'expense', 'transfer')),
    description TEXT,
    transaction_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS accounts_user_id_idx ON accounts(user_id);
CREATE INDEX IF NOT EXISTS categories_user_id_idx ON categories(user_id);
CREATE INDEX IF NOT EXISTS transactions_account_date_idx ON transactions(account_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS transactions_category_id_idx ON transactions(category_id);
