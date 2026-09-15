import { useState, useRef, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.js';
import ChatMessage from '../components/ChatMessage.jsx';
import DependencyGraph from '../components/DependencyGraph.jsx';
import RepoStatusBadge from '../components/RepoStatusBadge.jsx';
import LoadingFacts from '../components/LoadingFacts.jsx';

export default function RepoWorkspacePage() {
  const { repoId } = useParams();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('chat');
  const [question, setQuestion] = useState('');
  const scrollRef = useRef(null);

  const { data: repo } = useQuery({
    queryKey: ['repo', repoId],
    queryFn: () => api.get(`/repos/${repoId}`).then((r) => r.data.repo),
    refetchInterval: (query) => (['pending', 'indexing'].includes(query.state.data?.status) ? 3000 : false),
  });

  const { data: history } = useQuery({
    queryKey: ['history', repoId],
    queryFn: () => api.get(`/repos/${repoId}/questions`).then((r) => r.data.history.reverse()),
    enabled: !!repo && repo.status === 'ready',
  });

  const askMutation = useMutation({
    mutationFn: (q) => api.post(`/repos/${repoId}/questions`, { question: q }).then((r) => r.data),
    onSuccess: (data, q) => {
      queryClient.setQueryData(['history', repoId], (old = []) => [...old, { question: q, ...data }]);
      setQuestion('');
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [history, askMutation.isPending]);

  function submitQuestion(e) {
    e.preventDefault();
    if (!question.trim() || askMutation.isPending) return;
    askMutation.mutate(question.trim());
  }

    async function exportHistory(format) {
    const response = await api.get(`/repos/${repoId}/questions/export`, {
      params: { format },
      responseType: 'blob',
    });
    const blob = new Blob([response.data]);
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = format === 'markdown' ? 'qa-history.md' : 'qa-history.pdf';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }

  if (!repo) return null;

  return (
    <div className="h-screen flex flex-col">
      <header className="flex items-center justify-between px-6 py-3 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-gray-500 hover:text-white text-sm">
            ← Back
          </Link>
          <h1 className="font-medium">{repo.fullName}</h1>
          <RepoStatusBadge status={repo.status} />
        </div>

        <div className="flex items-center gap-4">
          <div className="flex rounded-lg bg-gray-900 border border-gray-800 p-0.5 text-sm">
            <TabButton active={tab === 'chat'} onClick={() => setTab('chat')} label="Chat" />
            <TabButton active={tab === 'graph'} onClick={() => setTab('graph')} label="Graph" />
          </div>
          {tab === 'chat' && (
            <div className="flex gap-2">
              <button onClick={() => exportHistory('markdown')} className="text-xs text-gray-400 hover:text-white">
                Export .md
              </button>
              <button onClick={() => exportHistory('pdf')} className="text-xs text-gray-400 hover:text-white">
                Export .pdf
              </button>
            </div>
          )}
        </div>
      </header>

      {repo.status !== 'ready' ? (
        <IndexingState status={repo.status} errorMessage={repo.errorMessage} />
      ) : tab === 'chat' ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
            {(!history || history.length === 0) && !askMutation.isPending && (
              <p className="text-gray-500 text-sm text-center mt-10">
                Ask something like "Where is user authentication handled?"
              </p>
            )}
            {history?.map((qa, i) => (
              <ChatMessage key={i} qa={qa} />
            ))}
            {askMutation.isPending && (
              <p className="text-gray-500 text-sm">Thinking…</p>
            )}
          </div>

          <form onSubmit={submitQuestion} className="border-t border-gray-800 p-4 flex gap-2">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask a question about this codebase…"
              className="flex-1 rounded-lg bg-gray-900 border border-gray-800 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={askMutation.isPending}
              className="rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:bg-gray-800 text-gray-900 font-medium px-4 py-2 text-sm transition-colors"
            >
              Ask
            </button>
          </form>
        </div>
      ) : (
        <div className="flex-1">
          <DependencyGraph repoId={repoId} />
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, label }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-md transition-colors ${active ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-300'}`}
    >
      {label}
    </button>
  );
}

function IndexingState({ status, errorMessage }) {
  const [startedAt] = useState(() => Date.now());

  if (status === 'failed') {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-red-400 text-sm">Indexing failed: {errorMessage}</p>
      </div>
    );
  }
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6">
      <div className="h-6 w-6 rounded-full border-2 border-gray-700 border-t-emerald-400 animate-spin" />
      <p className="text-gray-400 text-sm">
        {status === 'pending' ? 'Queued for indexing…' : 'Indexing in progress — this can take a few minutes for larger repos.'}
      </p>
      <LoadingFacts startedAt={startedAt} />
    </div>
  );
}