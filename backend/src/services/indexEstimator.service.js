import { chunkFile } from './chunking.service.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/env.js';

// Approximate bytes-per-vector in Qdrant for a 384-dim MiniLM embedding:
// 384 floats * 4 bytes + payload (file path, text snippet, metadata) overhead.
const BYTES_PER_VECTOR_ESTIMATE = 384 * 4 + 1024; // ~2.5KB per chunk incl. payload

const DEFAULT_EXCLUDE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '__pycache__', 'vendor',
  '.next', '.cache', 'coverage', 'target', 'bin', 'obj',
]);
const DEFAULT_EXCLUDE_EXT = new Set([
  '.lock', '.min.js', '.map', '.png', '.jpg', '.jpeg', '.gif', '.svg',
  '.ico', '.woff', '.woff2', '.ttf', '.eot', '.pdf', '.zip', '.tar', '.gz',
]);

function shouldExclude(filePath, extraPatterns = []) {
  const parts = filePath.split('/');
  if (parts.some((p) => DEFAULT_EXCLUDE_DIRS.has(p))) return true;
  if ([...DEFAULT_EXCLUDE_EXT].some((ext) => filePath.endsWith(ext))) return true;
  if (extraPatterns.some((pattern) => filePath.includes(pattern.replace('*', '')))) return true;
  return false;
}

/**
 * Estimate storage/chunk cost for a repo BEFORE indexing.
 *
 * This replaces the old flat "500 files, 5 repos" rule. Instead we compute
 * the actual thing that matters — how much of the user's Qdrant quota this
 * repo will consume — and let the user decide whether to proceed, scope to
 * a subfolder, or exclude more paths. Much fairer than an arbitrary file
 * count that rejects large-but-important repos and accepts small-but-bloated
 * ones (e.g. 500 files of generated JSON fixtures).
 *
 * @param {Array<{path: string, size: number, contentFetcher: () => Promise<string>}>} fileList
 * @param {{scopedPath?: string, excludePatterns?: string[], currentUsedMb?: number}} opts
 */
export async function estimateIndexCost(fileList, opts = {}) {
  const { scopedPath = null, excludePatterns = [], currentUsedMb = 0, sampleSize = 40 } = opts;

  let candidates = fileList.filter((f) => !shouldExclude(f.path, excludePatterns));
  if (scopedPath) {
    candidates = candidates.filter((f) => f.path.startsWith(scopedPath));
  }

  if (candidates.length === 0) {
    return {
      fileCount: 0,
      estimatedChunkCount: 0,
      estimatedStorageMb: 0,
      willExceedQuota: false,
      remainingQuotaMb: config.limits.maxQdrantStorageMb - currentUsedMb,
      warning: 'No files match after exclusions — check scoped path or exclude patterns.',
    };
  }

  // Sample a subset of files to estimate avg chunks-per-file rather than
  // fully parsing every file twice (once here, once during real indexing).
  // This keeps the estimate itself fast and cheap even for huge repos.
  const sample = candidates
    .slice()
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.min(sampleSize, candidates.length));

  let sampledChunks = 0;
  let sampledFilesParsed = 0;

  for (const file of sample) {
    try {
      const content = await file.contentFetcher();
      const chunks = await chunkFile(file.path, content);
      sampledChunks += chunks.length;
      sampledFilesParsed += 1;
    } catch (err) {
      logger.warn(`Estimator: failed to sample ${file.path}`, { error: err.message });
    }
  }

  const avgChunksPerFile = sampledFilesParsed > 0 ? sampledChunks / sampledFilesParsed : 3;
  const estimatedChunkCount = Math.ceil(avgChunksPerFile * candidates.length);
  const estimatedStorageMb = Math.ceil((estimatedChunkCount * BYTES_PER_VECTOR_ESTIMATE) / (1024 * 1024));

  const remainingQuotaMb = config.limits.maxQdrantStorageMb - currentUsedMb;
  const willExceedQuota = estimatedStorageMb > remainingQuotaMb;

  return {
    fileCount: candidates.length,
    estimatedChunkCount,
    estimatedStorageMb,
    remainingQuotaMb,
    willExceedQuota,
    suggestion: willExceedQuota
      ? 'This repo will exceed your remaining storage quota. Try scoping to a subfolder (e.g. "src/") or adding more exclude patterns.'
      : null,
  };
}

/**
 * Detect and rank the folders most likely worth excluding, to help the
 * frontend suggest smart defaults (e.g. "tests/" is 40% of this repo's
 * files — exclude it?").
 */
export function suggestExclusions(fileList) {
  const dirCounts = {};
  for (const f of fileList) {
    const topDir = f.path.split('/')[0];
    dirCounts[topDir] = (dirCounts[topDir] || 0) + 1;
  }
  const total = fileList.length;
  return Object.entries(dirCounts)
    .map(([dir, count]) => ({ dir, count, percentage: Math.round((count / total) * 100) }))
    .filter((d) => d.percentage >= 15) // only surface dirs that are a meaningful chunk of the repo
    .sort((a, b) => b.count - a.count);
}
