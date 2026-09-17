import 'dotenv/config';
import { Worker } from 'bullmq';
import { redisConnection } from './services/queue.service.js';
import { logger } from './utils/logger.js';
import { Repo } from './models/Repo.js';
import { User } from './models/User.js';
import { listRepoFiles, makeContentFetcher } from './services/github.service.js';
import { chunkFile } from './services/chunking.service.js';
import { embedChunks } from './services/embedding.service.js';
import { upsertChunks, getCollectionStorageEstimateMb } from './services/vectorStore.service.js';
import { config } from './config/env.js';

const BINARY_EXTENSIONS = ['.db', '.sqlite', '.sqlite3', '.exe', '.dll', '.so', '.class', '.jar', '.zip', '.pdf', '.woff', '.woff2', '.ttf', '.ico', '.bin', '.png', '.jpg', '.jpeg', '.gif'];

async function processIndexingJob(job) {
  const { repoId, userId } = job.data;
  const repo = await Repo.findById(repoId);
  const user = await User.findById(userId).select('+githubAccessToken');

  if (!repo || !user) throw new Error('Repo or user not found');

  repo.status = 'indexing';
  await repo.save();

  try {
    const [owner, repoName] = repo.fullName.split('/');

    let allFiles;
    try {
      allFiles = await listRepoFiles(user.githubAccessToken, owner, repoName, repo.defaultBranch);
    } catch (githubErr) {
      logger.error('GitHub file listing failed', {
        status: githubErr.status,
        message: githubErr.message,
        response: JSON.stringify(githubErr.response?.data),
      });
      throw githubErr;
    }

    let filesToIndex = allFiles;
    if (repo.scopedPath) {
      filesToIndex = allFiles.filter((f) => f.path.startsWith(repo.scopedPath));
    }
    filesToIndex = filesToIndex.filter(
      (f) => !repo.excludePatterns.some((p) => f.path.includes(p.replace('*', '')))
    );
    filesToIndex = filesToIndex.filter(
      (f) => !BINARY_EXTENSIONS.some((ext) => f.path.toLowerCase().endsWith(ext))
    );

    const usedMb = await getCollectionStorageEstimateMb();
    const remainingMb = config.limits.maxQdrantStorageMb - usedMb;

    let allChunks = [];
    const languagesSeen = new Set();

    for (const file of filesToIndex) {
      const fetchContent = makeContentFetcher(user.githubAccessToken, owner, repoName, file.sha);
      const content = await fetchContent();
      const chunks = await chunkFile(file.path, content);
      allChunks.push(...chunks);

      const projectedMb = (allChunks.length * 2.5) / 1024;
      if (projectedMb > remainingMb) {
        logger.warn(`Repo ${repo.fullName} indexing stopped early — quota reached`, {
          chunksIndexedSoFar: allChunks.length,
        });
        break;
      }
    }

    const EMBED_CHUNK_BATCH = 100;
    for (let i = 0; i < allChunks.length; i += EMBED_CHUNK_BATCH) {
      const batch = allChunks.slice(i, i + EMBED_CHUNK_BATCH);
      const vectors = await embedChunks(batch.map((c) => c.text));
      await upsertChunks(repo._id.toString(), batch, vectors);
    }

    repo.status = 'ready';
    repo.stats = {
      fileCount: filesToIndex.length,
      chunkCount: allChunks.length,
      estimatedStorageMb: Math.ceil((allChunks.length * 2.5) / 1024),
      languages: [...languagesSeen],
      indexedAt: new Date(),
    };
    await repo.save();

    logger.info(`Indexed ${repo.fullName}: ${allChunks.length} chunks from ${filesToIndex.length} files`);
  } catch (err) {
    repo.status = 'failed';
    repo.errorMessage = err.message;
    await repo.save();
    throw err;
  }
}

export function startIndexingWorker() {
  if (!redisConnection) {
    logger.warn('REDIS_URL not configured — indexing worker not started');
    return null;
  }

  const worker = new Worker('repo-indexing', processIndexingJob, {
    connection: redisConnection,
    concurrency: 2,
    lockDuration: 600000,
    stalledInterval: 30000,
    maxStalledCount: 1,
  });

  worker.on('completed', (job) => logger.info(`Indexing job ${job.id} completed`));

  worker.on('failed', async (job, err) => {
    logger.error(`Indexing job ${job?.id} failed`, { error: err?.message });
    if (job?.data?.repoId) {
      try {
        await Repo.findByIdAndUpdate(job.data.repoId, {
          status: 'failed',
          errorMessage: err?.message || 'Indexing failed unexpectedly',
        });
      } catch (updateErr) {
        logger.error('Failed to mark repo as failed after job failure', { error: updateErr.message });
      }
    }
  });

  logger.info('Indexing worker started');
  return worker;
}

// Lets `npm run worker` still start it standalone for local dev, without
// affecting anything when this file is just imported by server.js.
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('src/worker.js')) {
  const { connectDatabase } = await import('./config/database.js');
  const { ensureCollection } = await import('./services/vectorStore.service.js');
  await connectDatabase();
  await ensureCollection();
  startIndexingWorker();
}