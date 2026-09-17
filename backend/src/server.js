import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import passport from './config/passport.js';
import { config, validateConfig } from './config/env.js';
import { connectDatabase } from './config/database.js';
import { ensureCollection } from './services/vectorStore.service.js';
import { logger } from './utils/logger.js';
import routes from './routes/index.js';
import { startIndexingWorker } from './worker.js';
import axios from 'axios';

validateConfig();

const app = express();
app.set('trust proxy', 1);

app.use(helmet());
app.use(
  cors({
    origin: config.frontendUrl,
    credentials: true, // needed for the httpOnly refresh-token cookie
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(passport.initialize());
app.use((req, res, next) => {
  console.log(req.method, req.originalUrl);
  next();
});
app.use('/api', routes);

// Centralized error handler — keeps stack traces out of responses in prod
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack, path: req.path });
  res.status(err.status || 500).json({
    error: config.nodeEnv === 'production' ? 'Internal server error' : err.message,
  });
});

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

async function start() {
  try {
    await connectDatabase();
    await ensureCollection();

    startIndexingWorker();

    app.listen(config.port, () => {
      logger.info(`Server listening on port ${config.port} (${config.nodeEnv})`);
    });
        if (config.nodeEnv === 'production') {
      const selfUrl = 'https://codebase-archaeologist-api.onrender.com/api/health';
      setInterval(() => {
        axios.get(selfUrl).catch(() => {
          // Ignore errors — if this fails, the server will just cold-boot
          // on the next real user request, same as before this existed.
        });
      }, 10 * 60 * 1000); // every 10 minutes
    }
  } catch (err) {
    logger.error('Failed to start server', { error: err.message });
    process.exit(1);
  }
}

start();