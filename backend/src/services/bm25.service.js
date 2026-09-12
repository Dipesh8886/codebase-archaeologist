/**
 * Lightweight BM25 keyword search, computed on-demand over a repo's chunks.
 *
 * We don't run a separate keyword-search infra (e.g. Elasticsearch) — that
 * would blow the $0 budget. Instead, since a single repo's chunk set is
 * small enough to hold in memory (a few thousand chunks at most given our
 * storage caps), we compute BM25 scores in-process against chunks pulled
 * from Qdrant's payload (which stores the full chunk text alongside the
 * vector). This gives real hybrid search — semantic + exact keyword match —
 * without adding infrastructure.
 */

const K1 = 1.5;
const B = 0.75;

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, ' ')
    .split(' ')
    .filter((t) => t.length > 1);
}

export function bm25Search(query, chunks, limit = 10) {
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0 || chunks.length === 0) return [];

  const docs = chunks.map((c) => ({ chunk: c, terms: tokenize(c.text) }));
  const avgDocLen = docs.reduce((sum, d) => sum + d.terms.length, 0) / docs.length;
  const N = docs.length;

  // document frequency per query term
  const df = {};
  for (const term of queryTerms) {
    df[term] = docs.filter((d) => d.terms.includes(term)).length;
  }

  const scored = docs.map((doc) => {
    let score = 0;
    const termFreq = {};
    for (const t of doc.terms) termFreq[t] = (termFreq[t] || 0) + 1;

    for (const term of queryTerms) {
      const tf = termFreq[term] || 0;
      if (tf === 0) continue;
      const idf = Math.log(1 + (N - df[term] + 0.5) / (df[term] + 0.5));
      const denom = tf + K1 * (1 - B + (B * doc.terms.length) / avgDocLen);
      score += idf * ((tf * (K1 + 1)) / denom);
    }

    return { ...doc.chunk, bm25Score: score };
  });

  return scored
    .filter((d) => d.bm25Score > 0)
    .sort((a, b) => b.bm25Score - a.bm25Score)
    .slice(0, limit);
}

/**
 * Merge vector search and BM25 results using reciprocal rank fusion (RRF),
 * a simple, well-established way to combine two differently-scaled ranking
 * signals without needing to normalize scores against each other.
 */
export function hybridMerge(vectorResults, bm25Results, limit = 10) {
  const RRF_K = 60;
  const scores = new Map(); // key: filePath:startLine -> combined score
  const chunkByKey = new Map();

  function keyOf(c) {
    return `${c.filePath}:${c.startLine}`;
  }

  vectorResults.forEach((chunk, rank) => {
    const key = keyOf(chunk);
    scores.set(key, (scores.get(key) || 0) + 1 / (RRF_K + rank + 1));
    chunkByKey.set(key, chunk);
  });

  bm25Results.forEach((chunk, rank) => {
    const key = keyOf(chunk);
    scores.set(key, (scores.get(key) || 0) + 1 / (RRF_K + rank + 1));
    chunkByKey.set(key, chunk);
  });

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => chunkByKey.get(key));
}
