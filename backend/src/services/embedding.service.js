import axios from 'axios';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Embeddings via Hugging Face's Inference API. Hugging Face retired the
 * old api-inference.huggingface.co domain entirely (it no longer even
 * resolves via DNS) in favor of a unified "router.huggingface.co" gateway
 * under their new Inference Providers system. Same model, same request
 * format — only the base URL changed.
 */

const HF_URL = (model) =>
  `https://router.huggingface.co/hf-inference/models/${model}/pipeline/feature-extraction`;

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