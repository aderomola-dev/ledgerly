function validateEnvironment(env = process.env) {
    const nodeEnv = env.NODE_ENV;
    if (!nodeEnv) {
        throw new Error('NODE_ENV must be explicitly set to development, test, or production.');
    }
    if (!['development', 'test', 'production'].includes(nodeEnv)) {
        throw new Error('NODE_ENV must be development, test, or production.');
    }

    const missing = [];
    const isPlaceholder = (value) => typeof value === 'string' && /[<>]/.test(value);
    const hasDatabaseUrl = Boolean(env.DATABASE_URL && env.DATABASE_URL.trim());
    if (env.JWT_SECRET && isPlaceholder(env.JWT_SECRET)) missing.push('JWT_SECRET (replace the example placeholder)');
    if (hasDatabaseUrl && isPlaceholder(env.DATABASE_URL)) missing.push('DATABASE_URL (replace the example placeholder)');
    if (!hasDatabaseUrl) {
        for (const key of ['DB_USER', 'DB_HOST', 'DB_NAME', 'DB_PASSWORD', 'DB_PORT']) {
            if (!env[key] || !String(env[key]).trim() || isPlaceholder(String(env[key]))) missing.push(key);
        }
    }

    const jwtSecret = env.JWT_SECRET || '';
    if (Buffer.byteLength(jwtSecret, 'utf8') < 32) {
        missing.push('JWT_SECRET (at least 32 bytes)');
    }

    if (env.PORT && (!/^\d+$/.test(env.PORT) || Number(env.PORT) < 1 || Number(env.PORT) > 65535)) {
        throw new Error('PORT must be an integer between 1 and 65535.');
    }

    if (hasDatabaseUrl) {
        let databaseUrl;
        try {
            databaseUrl = new URL(env.DATABASE_URL);
        } catch {
            throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.');
        }
        if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)) {
            throw new Error('DATABASE_URL must use the PostgreSQL protocol.');
        }
    } else if (!/^\d+$/.test(String(env.DB_PORT)) || Number(env.DB_PORT) < 1 || Number(env.DB_PORT) > 65535) {
        missing.push('DB_PORT (integer from 1 to 65535)');
    }

    if (missing.length > 0) {
        throw new Error(`Missing or invalid required environment settings: ${missing.join(', ')}.`);
    }

    return { nodeEnv, port: Number(env.PORT || 5000) };
}

module.exports = { validateEnvironment };
