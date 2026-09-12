import mongoose from 'mongoose';

/**
 * Deliberately minimal: we store the GitHub numeric ID and username
 * (needed for API calls + display) but no email, real name, or other PII.
 * The GitHub access token is encrypted at rest by MongoDB Atlas
 * (encryption-at-rest is on by default) and is only ever used server-side.
 */
const userSchema = new mongoose.Schema(
  {
    githubId: { type: String, required: true, unique: true, index: true },
    githubUsername: { type: String, required: true },
    avatarUrl: { type: String },
    // Encrypted GitHub OAuth access token (read-only 'repo' scope).
    // Never sent to the client.
    githubAccessToken: { type: String, required: true, select: false },
    refreshTokenFamily: { type: String, default: null, select: false }, // for rotation/invalidation
    createdAt: { type: Date, default: Date.now },
    lastLoginAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

export const User = mongoose.model('User', userSchema);
