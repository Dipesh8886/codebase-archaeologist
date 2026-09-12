import rateLimit from 'express-rate-limit';
import { config } from '../config/env.js';

// 20 questions/minute per user, keyed on the authenticated user id
// (falls back to IP for unauthenticated routes).
export const questionRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: config.limits.questionsPerMinutePerUser,
  keyGenerator: (req) => req.user?._id?.toString() || req.ip,
  message: { error: 'Rate limit reached: 20 questions/minute. Please wait a moment.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Looser global limiter to blunt basic abuse on public endpoints (login, etc.)
export const globalRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
