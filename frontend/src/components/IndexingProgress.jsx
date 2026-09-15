import { useState, useEffect } from 'react';

const STAGES = [
  { label: 'Fetching files from GitHub', after: 0 },
  { label: 'Parsing & chunking code', after: 8 },
  { label: 'Generating embeddings', after: 20 },
  { label: 'Finalizing index', after: 45 },
];

export default function IndexingProgress({ startedAt }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = startedAt || Date.now();
    const tick = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(tick);
  }, [startedAt]);

  const activeIndex = STAGES.reduce(
    (acc, stage, i) => (elapsed >= stage.after ? i : acc),
    0
  );

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;

  return (
    <div className="w-full max-w-xs mx-auto rounded-2xl border border-gray-800 bg-gray-900/40 px-6 py-6">
      <div className="space-y-4">
        {STAGES.map((stage, i) => {
          const done = i < activeIndex;
          const active = i === activeIndex;
          return (
            <div key={stage.label} className="flex items-center gap-3">
              <div
                className={`h-5 w-5 rounded-full flex items-center justify-center shrink-0 border transition-colors duration-500 ${
                  done
                    ? 'bg-emerald-500 border-emerald-500'
                    : active
                    ? 'border-emerald-400'
                    : 'border-gray-700'
                }`}
              >
                {done ? (
                  <svg viewBox="0 0 12 12" className="h-3 w-3 fill-gray-950">
                    <path d="M4.5 8.5 2 6l-.9.9L4.5 10.3 11 3.8 10.1 3z" />
                  </svg>
                ) : active ? (
                  <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                ) : null}
              </div>
              <span
                className={`text-sm transition-colors duration-500 ${
                  done ? 'text-gray-500' : active ? 'text-gray-100' : 'text-gray-600'
                }`}
              >
                {stage.label}
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-gray-600 text-xs font-mono mt-5 text-center border-t border-gray-800 pt-4">
        {mins > 0 ? `${mins}m ` : ''}{secs}s elapsed
      </p>
    </div>
  );
}