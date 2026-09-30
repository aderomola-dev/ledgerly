const jwt = require('jsonwebtoken');

const JWT_ISSUER = 'ledgerly';
const JWT_AUDIENCE = 'ledgerly-web';
const JWT_ALGORITHM = 'HS256';
const JWT_TTL = '1h';

function signAccessToken(userId) {
    return jwt.sign({}, process.env.JWT_SECRET, {
        algorithm: JWT_ALGORITHM,
        subject: String(userId),
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        expiresIn: JWT_TTL
    });
}

function verifyAccessToken(token) {
    return jwt.verify(token, process.env.JWT_SECRET, {
        algorithms: [JWT_ALGORITHM],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE
    });
}

module.exports = { signAccessToken, verifyAccessToken, JWT_ISSUER, JWT_AUDIENCE };
