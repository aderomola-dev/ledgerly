# Ledgerly

Ledgerly is a browser-based personal-finance dashboard backed by an Express API and PostgreSQL. Transaction, account and analytics data is read from PostgreSQL. The browser stores a short-lived signed access token and non-sensitive interface preferences only.

## Architecture

- `index.html`, `style.css`, `script.js`: vanilla JavaScript dashboard and authenticated sign-in/registration screen.
- `server.js`: Express application, API routing, static frontend allowlist and HTTP security middleware.
- `server/config`: PostgreSQL pool, runtime environment validation and JWT signing/verification.
- `server/controllers` and `server/routes`: authentication, account, transaction, category, analytics and profile endpoints.
- `database/schema.sql`: baseline schema for a new/empty PostgreSQL database. It does not migrate or alter an existing database.
- `scripts/upgrade-legacy-user-password.js`: one-time interactive conversion of a legacy development-only password marker to a bcrypt hash. Password entry is hidden; the password/hash is never printed.
- `test/security.integration.test.js`: live PostgreSQL-backed security and API integration tests.

## Requirements

- Node.js 20 or later
- PostgreSQL 14 or later
- A PostgreSQL role allowed to connect to and create/use the Ledgerly database

## Database setup

For a new database, create it using your local PostgreSQL administration tooling, then apply the baseline schema:

```sh
createdb ledgerly
psql -d ledgerly -f database/schema.sql
```

If your PostgreSQL role or local setup differs, use its normal secure provisioning process. Do not apply the baseline file over an existing production database; use reviewed migrations for future schema changes. This repository does not include seeded user credentials.

The schema models `users → accounts → transactions`, with optional categories. Registration creates a user and an initial bank account. Category rows may be user-owned or shared system categories (`user_id IS NULL`).

## Environment configuration

1. Copy `.env.example` to `.env`.
2. Replace all `<...>` placeholders with local values; keep `.env` private and untracked.
3. Set `NODE_ENV` explicitly to `development`, `test`, or `production`.
4. Set `JWT_SECRET` to a fresh random value of at least 32 bytes. For example, generate one locally with Node's `crypto.randomBytes(48).toString('base64url')`. Never commit or share the generated value.
5. Configure either `DATABASE_URL` **or** all of `DB_USER`, `DB_HOST`, `DB_NAME`, `DB_PASSWORD`, and `DB_PORT`.
6. `CORS_ORIGINS` is optional and accepts a comma-separated allowlist of exact browser origins. Leave it empty for the normal same-origin application. Do not use `*` in production.

The server fails at startup if required settings are missing or still contain template placeholders. Production PostgreSQL connections using `DATABASE_URL` require TLS certificate verification.

## Start Ledgerly

```sh
npm install
npm start
```

For development with automatic restarts:

```sh
npm run dev
```

Open `http://localhost:5000` (or the configured `PORT`). The frontend and API should be served by this same origin; opening `index.html` directly as a `file:` URL is not supported.

New users can register through the sign-in screen. Passwords are stored as bcrypt hashes (minimum 12 characters, maximum 72 UTF-8 bytes); access tokens are HS256 JWTs with issuer/audience validation and a one-hour expiration. Existing legacy accounts containing the old development-only marker must be upgraded once by an operator: run `node scripts/upgrade-legacy-user-password.js` from an interactive terminal and set a new private password for the selected legacy email. This command can update only legacy-marker accounts and prints no password or hash.

## API endpoints

### Authentication

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Create a user and initial account; returns a signed access token. |
| `POST` | `/api/auth/login` | Verify email/password hash; returns a signed access token. |
| `GET` | `/api/health` | Public service health check. |

### Authenticated endpoints

Send `Authorization: Bearer <access-token>` for all endpoints below. The server derives the user identity only from the verified JWT.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/accounts` | List the authenticated user's accounts. |
| `GET` | `/api/categories` | List that user's categories and shared system categories. |
| `GET`, `POST` | `/api/transactions` | List or create transactions. Creation requires an owned `account_id`. |
| `GET`, `PUT`, `DELETE` | `/api/transactions/:id` | Read, update or delete an owned transaction. |
| `GET` | `/api/analytics/summary` | Balance, income, expenses and savings; optional `from` and `to` filters. |
| `GET` | `/api/analytics/categories` | Expense totals by category; optional date filters. |
| `GET` | `/api/analytics/monthly` | Calendar-month totals; optional date filters. |
| `GET`, `PUT` | `/api/settings` | Read/update the authenticated user's profile name. Currency display remains a browser preference. |

Create/update transaction fields are validated server-side. `amount` must be positive with at most two decimal places; `type` is `income` or `expense`; dates are `YYYY-MM-DD` between 1900 and 2100; names are limited to 120 characters and notes to 500 characters. A category can be omitted or explicitly cleared with `null`.

## Security and release notes

- `.env`, `.env.*`, `node_modules`, logs, coverage and editor files are ignored by Git; `.env.example` is intentionally allowed.
- Helmet sets security headers and a restrictive Content Security Policy; CORS is same-origin by default and uses exact configured origins when enabled.
- JSON and URL-encoded bodies are limited to 16 KiB; authentication endpoints are rate limited.
- Only the frontend entry point, CSS and JavaScript are served as static files. Backend source and environment files are not exposed.
- Database access uses parameterized SQL and account ownership checks. Production errors do not include stack traces or database details.

## Tests

Run the integration suite against a dedicated test database with valid environment settings and a fresh `JWT_SECRET`:

```sh
npm test
```

The tests register temporary users and create temporary accounts, categories and transactions. They remove those records in cleanup. Never point destructive tests at production data.
