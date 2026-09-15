import { Repo } from '../models/Repo.js';
import { QAHistory } from '../models/QAHistory.js';
import { embedQuery } from '../services/embedding.service.js';
import { vectorSearch } from '../services/vectorStore.service.js';
import { bm25Search, hybridMerge } from '../services/bm25.service.js';
import { askQuestion } from '../services/llm.service.js';

export async function ask(req, res) {
  const { question } = req.body;
  const repo = await Repo.findOne({ _id: req.params.repoId, owner: req.user._id });
  if (!repo) return res.status(404).json({ error: 'Repo not found' });
  if (repo.status !== 'ready') {
    return res.status(400).json({ error: `Repo is not ready yet (status: ${repo.status})` });
  }

  const queryVector = await embedQuery(question);
  const vectorResults = await vectorSearch(repo._id.toString(), queryVector, 20);

  const bm25Results = bm25Search(question, vectorResults, 20);
  const topChunks = hybridMerge(vectorResults, bm25Results, 8);

  if (topChunks.length === 0) {
    return res.json({
      answer: "I couldn't find any relevant code for that question in this repo.",
      citations: [],
      provider: null,
      createdAt: new Date(),
    });
  }

  const { answer, provider } = await askQuestion(question, topChunks);

  const citations = topChunks.map((c) => ({
    filePath: c.filePath,
    startLine: c.startLine,
    endLine: c.endLine,
  }));

  const record = await QAHistory.create({
    owner: req.user._id,
    repo: repo._id,
    question,
    answer,
    citations,
    llmProvider: provider,
  });

  res.json({ answer, citations, provider, createdAt: record.createdAt });
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

  const { default: markdownpdf } = await import('markdown-pdf');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="qa-history.pdf"');
  markdownpdf().from.string(markdown).to.buffer((err, buffer) => {
    if (err) return res.status(500).json({ error: 'PDF export failed' });
    res.send(buffer);
  });
}