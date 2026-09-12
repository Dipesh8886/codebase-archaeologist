import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

const qdrant = axios.create({
  baseURL: config.qdrant.url,
  headers: { 'api-key': config.qdrant.apiKey, 'Content-Type': 'application/json' },
  timeout: 15000,
});

qdrant.interceptors.response.use(
  (response) => response,
  (error) => {
    const qdrantMessage = error.response?.data?.status?.error || error.response?.data?.message;
    if (qdrantMessage) {
      error.message = `Qdrant error: ${qdrantMessage}`;
    }
    return Promise.reject(error);
  }
);

export async function ensureCollection() {
  try {
    await qdrant.get(`/collections/${config.qdrant.collection}`);
  } catch (err) {
    if (err.response?.status === 404) {
      await qdrant.put(`/collections/${config.qdrant.collection}`, {
        vectors: { size: 384, distance: 'Cosine' },
      });
      logger.info(`Created Qdrant collection "${config.qdrant.collection}"`);
    } else {
      throw err;
    }
  }

  try {
    await qdrant.put(`/collections/${config.qdrant.collection}/index`, {
      field_name: 'repoId',
      field_schema: 'keyword',
    });
    logger.info('Ensured Qdrant payload index on "repoId"');
  } catch (err) {
    const alreadyExists = err.response?.status === 400 && /already exists/i.test(err.message || '');
    if (!alreadyExists) {
      logger.error('Failed to create Qdrant payload index on "repoId"', { error: err.message });
      throw err;
    }
  }
}

export async function upsertChunks(repoId, chunks, vectors) {
  const points = chunks.map((chunk, i) => ({
    id: uuidv4(),
    vector: vectors[i],
    payload: {
      repoId,
      filePath: chunk.filePath,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      text: chunk.text,
      kind: chunk.kind,
      symbolName: chunk.symbolName,
    },
  }));

  const BATCH = 100;
  for (let i = 0; i < points.length; i += BATCH) {
    await qdrant.put(`/collections/${config.qdrant.collection}/points`, {
      points: points.slice(i, i + BATCH),
    });
  }
}

export async function vectorSearch(repoId, queryVector, limit = 10) {
  const response = await qdrant.post(`/collections/${config.qdrant.collection}/points/search`, {
    vector: queryVector,
    filter: { must: [{ key: 'repoId', match: { value: repoId } }] },
    limit,
    with_payload: true,
  });
  return response.data.result.map((r) => ({ ...r.payload, score: r.score }));
}

export async function deleteRepoVectors(repoId) {
  await qdrant.post(`/collections/${config.qdrant.collection}/points/delete`, {
    filter: { must: [{ key: 'repoId', match: { value: repoId } }] },
  });
}

export async function getCollectionStorageEstimateMb() {
  const response = await qdrant.get(`/collections/${config.qdrant.collection}`);
  const pointsCount = response.data.result.points_count || 0;
  return Math.ceil((pointsCount * (384 * 4 + 1024)) / (1024 * 1024));
}