import mongoose from 'mongoose';
import { config } from './env.js';
import { logger } from '../utils/logger.js';

export async function connectDatabase() {
  if (!config.mongoUri) {
    logger.warn('MONGODB_URI not set — skipping DB connection (dev mode without DB)');
    return;
  }

  mongoose.set('strictQuery', true);

  await mongoose.connect(config.mongoUri, {
    maxPoolSize: 10, // keep small — Atlas free tier (M0) has limited concurrent connections
  });

  logger.info('MongoDB connected');

  mongoose.connection.on('error', (err) => {
    logger.error('MongoDB connection error', { error: err.message });
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
  });
}
