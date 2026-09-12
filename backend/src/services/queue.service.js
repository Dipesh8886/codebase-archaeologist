import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '../config/env.js';

// Indexing a repo (fetch files -> chunk -> embed -> upsert) can take a
// while for larger repos and involves several rate-limited external APIs
// (HF embeddings, GitHub). Running it as a background job means the HTTP
// request that kicks off indexing returns immediately, and the frontend
// polls repo.status instead of holding a connection open — much friendlier
// to Render's free tier request timeouts.
export const redisConnection = config.redisUrl
  ? new IORedis(config.redisUrl, { maxRetriesPerRequest: null })
  : null;

export const indexingQueue = redisConnection
  ? new Queue('repo-indexing', { connection: redisConnection })
  : null;

export async function enqueueIndexingJob(repoId, userId) {
  if (!indexingQueue) {
    throw new Error('Indexing queue unavailable — REDIS_URL not configured');
  }
  await indexingQueue.add(
    'index-repo',
    { repoId, userId },
    {
      attempts: 2,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 50,
      removeOnFail: 50,
    }
  );
}
