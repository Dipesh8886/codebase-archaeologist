import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';

export default function AddRepoPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [selectedRepo, setSelectedRepo] = useState(null);
  const [scopedPath, setScopedPath] = useState('');
  const [excludePatterns, setExcludePatterns] = useState([]);
  const [estimate, setEstimate] = useState(null);
  const [exclusionSuggestions, setExclusionSuggestions] = useState([]);

  const { data: githubRepos, isLoading: loadingRepos } = useQuery({
    queryKey: ['github-repos'],
    queryFn: () => api.get('/repos/github').then((r) => r.data.repos),
  });

  const estimateMutation = useMutation({
    mutationFn: (payload) => api.post('/repos/estimate', payload).then((r) => r.data),
    onSuccess: (data) => {
      setEstimate(data.estimate);
      setExclusionSuggestions(data.exclusionSuggestions);
    },
  });

  const addMutation = useMutation({
    mutationFn: (payload) => api.post('/repos', payload).then((r) => r.data.repo),
    onSuccess: (repo) => {
      queryClient.invalidateQueries({ queryKey: ['repos'] });
      navigate(`/repos/${repo._id}`);
    },
  });

  function runEstimate() {
    if (!selectedRepo) return;
    estimateMutation.mutate({
      fullName: selectedRepo,
      scopedPath: scopedPath || null,
      excludePatterns,
    });
  }

  function toggleExclusion(dir) {
    setExcludePatterns((prev) => (prev.includes(dir) ? prev.filter((d) => d !== dir) : [...prev, dir]));
    setEstimate(null); // stale — user must re-run estimate after changing filters
  }

  function confirmIndex() {
    addMutation.mutate({ fullName: selectedRepo, scopedPath: scopedPath || null, excludePatterns });
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <h1 className="text-xl font-semibold mb-6">Add a repo</h1>

      <label className="block text-sm text-gray-400 mb-2">Select a repo</label>
      {loadingRepos ? (
        <p className="text-gray-500 text-sm">Loading your repos…</p>
      ) : (
        <select
          value={selectedRepo || ''}
          onChange={(e) => {
            setSelectedRepo(e.target.value);
            setEstimate(null);
          }}
          className="w-full rounded-lg bg-gray-900 border border-gray-800 px-3 py-2 mb-6"
        >
          <option value="" disabled>
            Choose a repo…
          </option>
          {githubRepos?.map((r) => (
            <option key={r.fullName} value={r.fullName}>
              {r.fullName} {r.isPrivate ? '(private)' : ''}
            </option>
          ))}
        </select>
      )}

      {selectedRepo && (
        <>
          <label className="block text-sm text-gray-400 mb-2">
            Scope to a folder (optional) — useful for large repos
          </label>
          <input
            type="text"
            placeholder="e.g. src/"
            value={scopedPath}
            onChange={(e) => {
              setScopedPath(e.target.value);
              setEstimate(null);
            }}
            className="w-full rounded-lg bg-gray-900 border border-gray-800 px-3 py-2 mb-6"
          />

          <button
            onClick={runEstimate}
            disabled={estimateMutation.isPending}
            className="rounded-lg bg-gray-800 hover:bg-gray-700 px-4 py-2 text-sm font-medium transition-colors mb-6"
          >
            {estimateMutation.isPending ? 'Estimating…' : 'Estimate storage cost'}
          </button>

          {exclusionSuggestions.length > 0 && (
            <div className="mb-6">
              <p className="text-sm text-gray-400 mb-2">
                These folders make up a large share of the repo — exclude any that aren't useful to search:
              </p>
              <div className="flex flex-wrap gap-2">
                {exclusionSuggestions.map((s) => (
                  <button
                    key={s.dir}
                    onClick={() => toggleExclusion(s.dir)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                      excludePatterns.includes(s.dir)
                        ? 'bg-red-950 border-red-800 text-red-300'
                        : 'border-gray-700 text-gray-300 hover:border-gray-500'
                    }`}
                  >
                    {excludePatterns.includes(s.dir) ? 'Excluding' : 'Exclude'} {s.dir}/ ({s.percentage}%)
                  </button>
                ))}
              </div>
            </div>
          )}

          {estimate && (
            <div
              className={`rounded-lg border p-4 mb-6 ${
                estimate.willExceedQuota ? 'border-red-800 bg-red-950/40' : 'border-gray-800 bg-gray-900/50'
              }`}
            >
              <div className="grid grid-cols-3 gap-4 text-sm mb-2">
                <Stat label="Files" value={estimate.fileCount} />
                <Stat label="Est. chunks" value={estimate.estimatedChunkCount} />
                <Stat label="Est. storage" value={`${estimate.estimatedStorageMb} MB`} />
              </div>
              <p className="text-xs text-gray-500">
                {estimate.remainingQuotaMb} MB remaining in your free-tier quota.
              </p>
              {estimate.willExceedQuota && (
                <p className="text-sm text-red-300 mt-2">{estimate.suggestion}</p>
              )}
            </div>
          )}

          <button
            onClick={confirmIndex}
            disabled={!estimate || estimate.willExceedQuota || addMutation.isPending}
            className="w-full rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:bg-gray-800 disabled:text-gray-500 text-gray-900 font-medium py-3 transition-colors"
          >
            {addMutation.isPending ? 'Starting index…' : 'Index this repo'}
          </button>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <p className="text-gray-500 text-xs">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
