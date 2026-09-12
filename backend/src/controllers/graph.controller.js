import { Repo } from '../models/Repo.js';
import { User } from '../models/User.js';
import { listRepoFiles, makeContentFetcher } from '../services/github.service.js';
import { buildDependencyGraph, expandCluster } from '../services/dependencyGraph.service.js';

// Simple in-memory cache of the full file graph per repo so cluster-expand
// requests don't re-fetch and re-parse the whole repo from GitHub each time.
// Cleared on process restart — fine for a free-tier single-instance deploy.
const graphCache = new Map(); // repoId -> { files, clusters, cachedAt }
const CACHE_TTL_MS = 15 * 60 * 1000;

async function loadOrBuildGraph(repo, user) {
  const cached = graphCache.get(repo._id.toString());
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) return cached;

  const [owner, repoName] = repo.fullName.split('/');
  const allFiles = await listRepoFiles(user.githubAccessToken, owner, repoName, repo.defaultBranch);

  const textFiles = allFiles.filter((f) =>
    /\.(js|jsx|ts|tsx|py|go|java|rb|rs)$/.test(f.path)
  );

  const filesWithContent = await Promise.all(
    textFiles.map(async (f) => ({
      path: f.path,
      content: await makeContentFetcher(user.githubAccessToken, owner, repoName, f.sha)(),
    }))
  );

  const graph = buildDependencyGraph(filesWithContent);
  const entry = { ...graph, cachedAt: Date.now() };
  graphCache.set(repo._id.toString(), entry);
  return entry;
}

/**
 * Default view: directory clusters only. This is what fixes the hairball
 * problem — the frontend renders ~10-20 cluster nodes instead of hundreds
 * of file nodes on first load.
 */
export async function getClusteredGraph(req, res) {
  const repo = await Repo.findOne({ _id: req.params.repoId, owner: req.user._id });
  if (!repo) return res.status(404).json({ error: 'Repo not found' });

  const user = await User.findById(req.user._id).select('+githubAccessToken');
  const graph = await loadOrBuildGraph(repo, user);
  res.json({ clusters: graph.clusters });
}

/**
 * Lazy-expand a single cluster into its files, called when the user clicks
 * a cluster node in the frontend.
 */
export async function getExpandedCluster(req, res) {
  const repo = await Repo.findOne({ _id: req.params.repoId, owner: req.user._id });
  if (!repo) return res.status(404).json({ error: 'Repo not found' });

  const user = await User.findById(req.user._id).select('+githubAccessToken');
  const graph = await loadOrBuildGraph(repo, user);
  const expanded = expandCluster(req.params.dir, graph.files);
  res.json({ expanded });
}
