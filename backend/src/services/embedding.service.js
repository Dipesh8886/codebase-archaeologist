import { pipeline } from '@xenova/transformers';
import { logger } from '../utils/logger.js';

/**
 * Embeddings run LOCALLY via transformers.js instead of calling Hugging
 * Face's hosted Inference API. This removes an entire class of failure
 * (HF changing/retiring API endpoints, rate limits, network flakiness for
 * this step) at zero cost — the model file (~90MB) downloads once on first
 * run and is cached on disk afterward, so every subsequent embedding call
 * is a local computation with no network dependency at all.
 *
 * Same model as before (all-MiniLM-L6-v2, 384-dim output) so nothing else
 * in the pipeline (Qdrant collection config, etc.) needs to change.
 */

let embedderPromise = null;

function getEmbedder() {
  if (!embedderPromise) {
    logger.info('Loading local embedding model (first run downloads ~90MB, then cached)...');
    embedderPromise = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return embedderPromise;
}

async function embedBatch(texts) {
  const embedder = await getEmbedder();
  const vectors = [];

  // transformers.js pipelines process one input at a time most reliably;
  // looping here is still fast since it's all local CPU inference with no
  // network round-trip per item.
  for (const text of texts) {
    const output = await embedder(text, { pooling: 'mean', normalize: true });
    vectors.push(Array.from(output.data));
  }

  return vectors;
}

/**
 * Embed an array of chunk texts. No batching/rate-limit handling needed
 * anymore since this never leaves the machine.
 */
export async function embedChunks(chunkTexts) {
  return embedBatch(chunkTexts);
}

export async function embedQuery(text) {
  const [vector] = await embedBatch([text]);
  return vector;
}
