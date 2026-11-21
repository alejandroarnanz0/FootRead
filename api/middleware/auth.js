// JWT helpers: sign tokens and protect routes.
const jwt = require('jsonwebtoken');
const httpError = require('../utils/httpError');

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) throw new Error('JWT_SECRET must be set (at least 32 characters)');
  return s;
}

function signToken(user) {
  return jwt.sign({ sub: String(user._id), email: user.email }, secret(), {
    algorithm: 'HS256',
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
  });
}

// Reads "Authorization: Bearer <token>", verifies signature and expiry, and
// leaves the user in req.user. 401 when missing, invalid or expired.
function requireAuth(req, res, next) {
  const [scheme, token] = (req.get('authorization') || '').split(' ');
  if (scheme !== 'Bearer' || !token) return next(httpError(401, 'Missing token'));
  try {
    const payload = jwt.verify(token, secret(), { algorithms: ['HS256'] });
    req.user = { id: payload.sub, email: payload.email };
    return next();
  } catch (err) {
    return next(httpError(401, err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token'));
  }
}

module.exports = { signToken, requireAuth };
