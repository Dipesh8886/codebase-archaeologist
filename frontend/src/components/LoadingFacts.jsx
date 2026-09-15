import { useState, useEffect } from 'react';

const FACTS = [
  "We're parsing your code with tree-sitter — the same parsing engine used inside GitHub and Neovim.",
  'Files are split by semantic boundaries (functions, classes) instead of arbitrary line counts, so answers cite complete logic, not fragments.',
  'Under the hood, we combine keyword search (BM25) with vector embeddings — a hybrid approach that catches both exact matches and conceptual similarity.',
  'Large repos are automatically scanned for bulky folders (like node_modules or build/) so we can suggest excluding them before indexing.',
  'Every answer you get back is grounded in exact file paths and line numbers — no made-up code, just citations from what is actually in your repo.',
  'This entire pipeline — parsing, chunking, embedding, and storage — runs end to end on free-tier infrastructure.',
];

export default function LoadingFacts({ startedAt }) {
  const [factIndex, setFactIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const factTimer = setInterval(() => {
      setFactIndex((i) => (i + 1) % FACTS.length);
    }, 4500);
    return () => clearInterval(factTimer);
  }, []);

  useEffect(() => {
    const start = startedAt || Date.now();
    const tick = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(tick);
  }, [startedAt]);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;

  return (
    <div className="max-w-sm text-center space-y-4">
      <p className="text-gray-500 text-xs font-mono">
        {mins > 0 ? `${mins}m ` : ''}{secs}s elapsed
      </p>
      <p key={factIndex} className="fact-fade text-gray-300 text-sm leading-relaxed">
        {FACTS[factIndex]}
      </p>
    </div>
  );
}