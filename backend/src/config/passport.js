import passport from 'passport';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { config } from './env.js';
import { User } from '../models/User.js';

passport.use(
  new GitHubStrategy(
    {
      clientID: config.github.clientId,
      clientSecret: config.github.clientSecret,
      callbackURL: config.github.callbackUrl,
      scope: ['repo'], // read access to public + private repos, no other permissions
    },
    async (accessToken, _refreshToken, profile, done) => {
      try {
        // Upsert: no separate "signup" flow needed — first login creates the account.
        const user = await User.findOneAndUpdate(
          { githubId: profile.id },
          {
            githubId: profile.id,
            githubUsername: profile.username,
            avatarUrl: profile.photos?.[0]?.value,
            githubAccessToken: accessToken, // encrypted at rest via Atlas
            lastLoginAt: new Date(),
          },
          { upsert: true, new: true }
        );
        return done(null, user);
      } catch (err) {
        return done(err, null);
      }
    }
  )
);

export default passport;
