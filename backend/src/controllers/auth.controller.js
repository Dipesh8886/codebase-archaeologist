import { signAccessToken, signRefreshToken, verifyToken } from '../services/jwt.service.js';
import { config } from '../config/env.js';
import { User } from '../models/User.js';

const REFRESH_COOKIE_NAME = 'refresh_token';

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/api/auth',
  };
}

export async function githubCallback(req, res) {
  const user = req.user; // set by passport strategy
  const accessToken = signAccessToken(user);
  const { token: refreshToken, family } = signRefreshToken(user);

  user.refreshTokenFamily = family;
  await user.save();

  res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());

  // Redirect back to frontend with the short-lived access token in the URL
  // fragment (not query string, so it never lands in server logs); the
  // frontend picks it up once and stores it in memory only.
  res.redirect(`${config.frontendUrl}/auth/callback#token=${accessToken}`);
}

export async function refresh(req, res) {
  const token = req.cookies[REFRESH_COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'No refresh token' });

  try {
    const payload = verifyToken(token);
    const user = await User.findById(payload.sub);

    // Rotation check: if the token's family no longer matches the user's
    // current family, it means this token was already rotated once before
    // (i.e. it's a replayed/stolen token) — invalidate everything.
    if (!user || user.refreshTokenFamily !== payload.family) {
      if (user) user.refreshTokenFamily = null; // burn the whole family
      await user?.save();
      res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/auth' });
      return res.status(401).json({ error: 'Refresh token invalid — please log in again' });
    }

    const newAccessToken = signAccessToken(user);
    const { token: newRefreshToken, family: newFamily } = signRefreshToken(user);
    user.refreshTokenFamily = newFamily;
    await user.save();

    res.cookie(REFRESH_COOKIE_NAME, newRefreshToken, refreshCookieOptions());
    res.json({ accessToken: newAccessToken });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
}

export async function logout(req, res) {
  if (req.user) {
    req.user.refreshTokenFamily = null;
    await req.user.save();
  }
  res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/auth' });
  res.json({ success: true });
}

export function me(req, res) {
  res.json({
    id: req.user._id,
    githubUsername: req.user.githubUsername,
    avatarUrl: req.user.avatarUrl,
  });
}
