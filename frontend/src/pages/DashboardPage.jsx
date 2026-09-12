import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import RepoStatusBadge from '../components/RepoStatusBadge.jsx';

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['repos'],
    queryFn: () => api.get('/repos').then((r) => r.data.repos),
    refetchInterval: (query) =>
      query.state.data?.some((r) => ['pending', 'estimating', 'indexing'].includes(r.status)) ? 3000 : false,
  });

  const deleteMutation = useMutation({
    mutationFn: (repoId) => api.delete(`/repos/${repoId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['repos'] }),
  });

  function handleDelete(e, repoId, fullName) {
    e.preventDefault();
    e.stopPropagation();
    if (confirm(`Delete ${fullName}? This removes it and its indexed data.`)) {
      deleteMutation.mutate(repoId);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <header className="flex items-center justify-between mb-10">
        <h1 className="text-xl font-semibold">Codebase Archaeologist</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">{user?.githubUsername}</span>
          <button onClick={logout} className="text-sm text-gray-400 hover:text-white transition-colors">
            Log out
          </button>
        </div>
      </header>

      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-medium">Your repos</h2>
        <Link
          to="/repos/new"
          className="rounded-lg bg-emerald-500 hover:bg-emerald-400 text-gray-900 font-medium text-sm px-4 py-2 transition-colors"
        >
          + Add New Repo
        </Link>
      </div>

      {isLoading && <p className="text-gray-500 text-sm">Loading…</p>}

      {!isLoading && (!data || data.length === 0) && (
        <div className="rounded-lg border border-gray-800 p-10 text-center text-gray-500">
          No repos yet. Add one to start exploring.
        </div>
      )}

      <ul className="space-y-2">
        {data?.map((repo) => (
          <li key={repo._id}>
            <Link
              to={`/repos/${repo._id}`}
              className="flex items-center justify-between rounded-lg border border-gray-800 px-4 py-3 hover:border-gray-600 transition-colors"
            >
              <div>
                <p className="font-medium">{repo.fullName}</p>
                <p className="text-xs text-gray-500">
                  {repo.scopedPath ? `Scoped to ${repo.scopedPath}` : 'Whole repo'} ·{' '}
                  {repo.stats?.fileCount ?? 0} files · {repo.stats?.chunkCount ?? 0} chunks
                </p>
              </div>
              <div className="flex items-center gap-3">
                <RepoStatusBadge status={repo.status} />
                <button
                  onClick={(e) => handleDelete(e, repo._id, repo.fullName)}
                  className="text-xs text-gray-500 hover:text-red-400 transition-colors px-2 py-1"
                  title="Delete repo"
                >
                  Delete
                </button>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}