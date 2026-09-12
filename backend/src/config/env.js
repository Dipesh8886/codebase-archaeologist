import 'dotenv/config';

/**
 * Central config object. Reading env vars in one place makes it obvious
 * what the app depends on, and lets us fail fast on startup instead of
 * halfway through a request.
 */
export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',

  github: {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackUrl: process.env.GITHUB_CALLBACK_URL,
  },

  jwt: {
    privateKey: process.env.JWT_PRIVATE_KEY_BASE64
      ? Buffer.from(process.env.JWT_PRIVATE_KEY_BASE64, 'base64').toString('utf-8')
      : null,
    publicKey: process.env.JWT_PUBLIC_KEY_BASE64
      ? Buffer.from(process.env.JWT_PUBLIC_KEY_BASE64, 'base64').toString('utf-8')
      : null,
    accessExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
  },

  mongoUri: process.env.MONGODB_URI,

  qdrant: {
    url: process.env.QDRANT_URL,
    apiKey: process.env.QDRANT_API_KEY,
    collection: process.env.QDRANT_COLLECTION || 'code_chunks',
  },

  redisUrl: process.env.REDIS_URL,

  groq: {
    apiKey: process.env.GROQ_API_KEY,
    model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
    rpmLimit: parseInt(process.env.GROQ_RPM_LIMIT || '30', 10),
  },

  fallbackLlm: {
    provider: process.env.FALLBACK_LLM_PROVIDER || 'gemini',
    gemini: {
      apiKey: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
    },
    openrouter: {
      apiKey: process.env.OPENROUTER_API_KEY,
      model: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.1-8b-instruct:free',
    },
  },

  hf: {
    apiKey: process.env.HF_API_KEY,
    embeddingModel: process.env.HF_EMBEDDING_MODEL || 'sentence-transformers/all-MiniLM-L6-v2',
  },

  limits: {
    maxReposPerUser: parseInt(process.env.MAX_REPOS_PER_USER || '5', 10),
    maxQdrantStorageMb: parseInt(process.env.MAX_QDRANT_STORAGE_MB || '900', 10),
    questionsPerMinutePerUser: parseInt(process.env.QUESTIONS_PER_MINUTE_PER_USER || '20', 10),
  },

  sentryDsn: process.env.SENTRY_DSN || null,
};

/**
 * Fail fast on boot if required secrets are missing, rather than
 * discovering it when a user hits a broken endpoint.
 */
export function validateConfig() {
  const required = [
    ['GITHUB_CLIENT_ID', config.github.clientId],
    ['GITHUB_CLIENT_SECRET', config.github.clientSecret],
    ['MONGODB_URI', config.mongoUri],
    ['QDRANT_URL', config.qdrant.url],
    ['GROQ_API_KEY', config.groq.apiKey],
    ['HF_API_KEY', config.hf.apiKey],
  ];

  const missing = required.filter(([, value]) => !value).map(([name]) => name);

  if (missing.length > 0) {
    console.warn(
      `[config] Missing env vars: ${missing.join(', ')}. ` +
      `The app will start but related features will fail until these are set in .env`
    );
  }

  if (!config.jwt.privateKey || !config.jwt.publicKey) {
    console.warn(
      '[config] JWT_PRIVATE_KEY_BASE64 / JWT_PUBLIC_KEY_BASE64 not set. ' +
      'Run scripts/generate-jwt-keys.sh to create a keypair for local dev.'
    );
  }
}
