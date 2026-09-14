import axios from 'axios';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * LLM routing with automatic fallback.
 *
 * Groq's free tier (30 RPM / 14,400 RPD on Llama 3.1 8B) is generous for
 * indexing-free Q&A traffic, but bursts of concurrent users can still hit
 * 429s. Rather than surfacing a hard "rate limit reached" wall, we
 * transparently fall back to a second free-tier provider (Gemini Flash by
 * default, or OpenRouter's free model pool) and tell the user which model
 * answered. This keeps the app usable at $0 even during traffic spikes.
 *
 * IMPORTANT: the indexing pipeline never calls this service. Only the
 * Q&A endpoint (Step 3) invokes an LLM — chunking and embedding are pure
 * parsing/vector operations. This is what keeps daily LLM call volume low
 * enough to stay inside free-tier request budgets even for large repos.
 */

const SYSTEM_PROMPT = `You are a senior engineer helping a developer understand an unfamiliar codebase.
You will be given a question and several relevant code chunks, each labeled with its file path and line range.
Answer using ONLY the provided code chunks — do not invent file paths or behavior not shown.
Always cite the specific file path and line numbers for every claim you make, in the format \`path/to/file.ext:startLine-endLine\`.
If the provided chunks don't fully answer the question, say so explicitly rather than guessing.
Keep answers concise and technical.`;

function buildUserPrompt(question, chunks) {
  const context = chunks
    .map((c, i) => `[Chunk ${i + 1}] ${c.filePath}:${c.startLine}-${c.endLine}\n${c.text}`)
    .join('\n\n---\n\n');

  return `Question: ${question}\n\nRelevant code chunks:\n\n${context}`;
}

async function callGroq(question, chunks) {
  const response = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model: config.groq.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(question, chunks) },
      ],
      temperature: 0.2,
      max_tokens: 800,
    },
    {
      headers: { Authorization: `Bearer ${config.groq.apiKey}` },
      timeout: 20000,
    }
  );

  return response.data.choices[0].message.content;
}

async function callGemini(question, chunks) {
  const { apiKey, model } = config.fallbackLlm.gemini;
  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      contents: [{ parts: [{ text: `${SYSTEM_PROMPT}\n\n${buildUserPrompt(question, chunks)}` }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 800 },
    },
    { timeout: 20000 }
  );

  return response.data.candidates[0].content.parts[0].text;
}

async function callOpenRouter(question, chunks) {
  const { apiKey, model } = config.fallbackLlm.openrouter;
  const response = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(question, chunks) },
      ],
      temperature: 0.2,
      max_tokens: 800,
    },
    {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 20000,
    }
  );

  return response.data.choices[0].message.content;
}

function isRateLimitError(err) {
  return err.response?.status === 429;
}

/**
 * Ask a question against a set of retrieved code chunks.
 * Tries Groq first; on 429 (rate limit) or any 5xx, falls back to the
 * configured free fallback provider. Returns which provider actually
 * answered so the UI can show a small "answered by Gemini (backup)" note.
 */
export async function askQuestion(question, chunks) {
  try {
    const answer = await callGroq(question, chunks);
    return { answer, provider: 'groq' };
  } catch (err) {
    const shouldFallback = isRateLimitError(err) || (err.response?.status >= 500);

    if (!shouldFallback) {
      logger.error('Groq call failed with a non-retryable error — not falling back', {
        status: err.response?.status,
        groqResponseData: JSON.stringify(err.response?.data),
        message: err.message,
      });
      throw err;
    }

    logger.warn('Groq unavailable, falling back to secondary LLM', {
      status: err.response?.status,
      groqResponseData: JSON.stringify(err.response?.data),
      provider: config.fallbackLlm.provider,
    });

    try {
      const answer = config.fallbackLlm.provider === 'openrouter'
        ? await callOpenRouter(question, chunks)
        : await callGemini(question, chunks);
      return { answer, provider: config.fallbackLlm.provider };
    } catch (fallbackErr) {
      logger.error('Both primary and fallback LLM failed', {
        groqError: err.message,
        groqResponseData: JSON.stringify(err.response?.data),
        fallbackError: fallbackErr.message,
        fallbackResponseData: JSON.stringify(fallbackErr.response?.data),
      });
      throw new Error('All LLM providers are currently unavailable. Please try again shortly.');
    }
  }
}