import axios from 'axios';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Embeddings run via Hugging Face's hosted Inference API rather than
 * locally in-process. Loading a transformer model directly inside this
 * server was pushing memory usage past Render's free-tier 512MB limit,
 * causing the whole process to be killed and restarted mid-index — which
 * looked like "indexing is stuck" but was actually a crash loop. Calling
 * the model over the network instead keeps this server's memory footprint
 * small and constant regardless of repo size.
 */

const HF_URL = (model) => `https://api-inference.huggingface.co/pipeline/feature-extraction/${model}`;

async function callHf(texts, attempt = 1) {
  try {
    const response = await axios.post(
      HF_URL(config.hf.embeddingModel),
      { inputs: texts, options: { wait_for_model: true } },
      {
        headers: { Authorization: `Bearer ${config.hf.apiKey}` },
        timeout: 30000,
      }
    );
    return response.data;
  } catch (err) {
    // HF cold-starts a model on first use in a while (503 while it loads).
    // Retry a couple of times with a short delay rather than failing the
    // whole indexing job over a transient cold start.
    const isModelLoading = err.response?.status === 503;
    if (isModelLoading && attempt < 3) {
      logger.warn(`HF embedding model still loading, retrying (attempt ${attempt})...`);
      await new Promise((r) => setTimeout(r, 3000));
      return callHf(texts, attempt + 1);
    }
    throw err;
  }
}

const BATCH_SIZE = 32;

async function embedBatch(texts) {
  const vectors = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const result = await callHf(batch);
    vectors.push(...result);
  }
  return vectors;
}

export async function embedChunks(chunkTexts) {
  return embedBatch(chunkTexts);
}

export async function embedQuery(text) {
  const [vector] = await embedBatch([text]);
  return vector;
}