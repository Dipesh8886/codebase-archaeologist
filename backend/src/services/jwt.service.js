import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/env.js';

/**
 * RS256 (asymmetric) rather than HS256: the private key only ever lives on
 * the backend and signs tokens; a public key could be distributed to other
 * services to verify tokens without ever being able to forge one. Overkill
 * for a single-service MVP, but it's the correct pattern to demonstrate and
 * costs nothing extra.
 */

export function signAccessToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), githubUsername: user.githubUsername },
    config.jwt.privateKey,
    { algorithm: 'RS256', expiresIn: config.jwt.accessExpiry }
  );
}

/**
 * Refresh tokens carry a "family" id. On each use we rotate: issue a new
 * token, and if an already-used (revoked) token in the same family is
 * replayed, we invalidate the whole family — a standard defense against
 * stolen refresh token reuse.
 */
export function signRefreshToken(user, family = uuidv4()) {
  const token = jwt.sign(
    { sub: user._id.toString(), family },
    config.jwt.privateKey,
    { algorithm: 'RS256', expiresIn: config.jwt.refreshExpiry }
  );
  return { token, family };
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwt.publicKey, { algorithms: ['RS256'] });
}
