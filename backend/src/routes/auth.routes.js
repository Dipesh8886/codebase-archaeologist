import { Router } from 'express';
import passport from '../config/passport.js';
import { githubCallback, refresh, logout, me } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { globalRateLimiter } from '../middleware/rateLimit.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.get('/github', globalRateLimiter, passport.authenticate('github', { session: false }));

router.get(
  '/github/callback',
  passport.authenticate('github', { session: false, failureRedirect: '/login-failed' }),
  asyncHandler(githubCallback)
);

router.post('/refresh', globalRateLimiter, asyncHandler(refresh));
router.post('/logout', requireAuth, asyncHandler(logout));
router.get('/me', requireAuth, me);

export default router;
