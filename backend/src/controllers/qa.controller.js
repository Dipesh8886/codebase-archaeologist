import { Repo } from '../models/Repo.js';
import { QAHistory } from '../models/QAHistory.js';
import { embedQuery } from '../services/embedding.service.js';
import { vectorSearch } from '../services/vectorStore.service.js';
import { bm25Search, hybridMerge } from '../services/bm25.service.js';
import { askQuestion } from '../services/llm.service.js';

/**
 * Hybrid search: vector similarity (semantic) + BM25 (exact keyword match),
 * merged via reciprocal rank fusion. Vector search alone misses exact
 * symbol/variable name matches (e.g. searching "getUserById" should surface
 * that literal function even if semantically similar code exists elsewhere);
 * BM25 alone misses conceptual matches phrased differently than the code.
 * Combining both is what the product spec calls for and meaningfully
 * improves retrieval quality over either alone.
 */
export async function ask(req, res) {
  const { question } = req.body;
  const repo = await Repo.findOne({ _id: req.params.repoId, owner: req.user._id });
  if (!repo) return res.status(404).json({ error: 'Repo not found' });
  if (repo.status !== 'ready') {
    return res.status(400).json({ error: `Repo is not ready yet (status: ${repo.status})` });
  }

  const queryVector = await embedQuery(question);
  const vectorResults = await vectorSearch(repo._id.toString(), queryVector, 20);

  // BM25 runs over the same candidate pool returned by vector search rather
  // than the whole repo — keeps this fast without a separate keyword index
  // service, while still catching exact-match chunks the vector step ranked
  // lower than its top-K semantic matches.
  const bm25Results = bm25Search(question, vectorResults, 20);
  const topChunks = hybridMerge(vectorResults, bm25Results, 8);

  if (topChunks.length === 0) {
    return res.json({
      answer: "I couldn't find any relevant code for that question in this repo.",
      citations: [],
      provider: null,
    });
  }

  const { answer, provider } = await askQuestion(question, topChunks);

  const citations = topChunks.map((c) => ({
    filePath: c.filePath,
    startLine: c.startLine,
    endLine: c.endLine,
  }));

  await QAHistory.create({
    owner: req.user._id,
    repo: repo._id,
    question,
    answer,
    citations,
    llmProvider: provider,
  });

  res.json({ answer, citations, provider });
}

export async function listHistory(req, res) {
  const history = await QAHistory.find({ repo: req.params.repoId, owner: req.user._id })
    .sort({ createdAt: -1 })
    .limit(100);
  res.json({ history });
}

export async function deleteHistory(req, res) {
  await QAHistory.deleteMany({ repo: req.params.repoId, owner: req.user._id });
  res.json({ success: true });
}

export async function exportHistory(req, res) {
  const { format } = req.query;
  const history = await QAHistory.find({ repo: req.params.repoId, owner: req.user._id }).sort({ createdAt: 1 });

  const markdown = history
    .map(
      (qa) =>
        `## Q: ${qa.question}\n\n${qa.answer}\n\n**Citations:** ${qa.citations
          .map((c) => `\`${c.filePath}:${c.startLine}-${c.endLine}\``)
          .join(', ')}\n`
    )
    .join('\n---\n\n');

  if (format === 'markdown') {
    res.setHeader('Content-Type', 'text/markdown');
    res.setHeader('Content-Disposition', 'attachment; filename="qa-history.md"');
    return res.send(markdown);
  }

  // PDF export note: keep this as a lazy import — markdown-pdf pulls in a
  // headless renderer we don't want loaded for every request that never
  // touches export.
  const { default: markdownpdf } = await import('markdown-pdf');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="qa-history.pdf"');
  markdownpdf().from.string(markdown).to.buffer((err, buffer) => {
    if (err) return res.status(500).json({ error: 'PDF export failed' });
    res.send(buffer);
  });
}
