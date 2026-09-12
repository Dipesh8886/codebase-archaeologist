import { Repo } from '../models/Repo.js';
import { User } from '../models/User.js';
import { listUserRepos, listRepoFiles, makeContentFetcher } from '../services/github.service.js';
import { estimateIndexCost, suggestExclusions } from '../services/indexEstimator.service.js';
import { getCollectionStorageEstimateMb, deleteRepoVectors } from '../services/vectorStore.service.js';
import { enqueueIndexingJob } from '../services/queue.service.js';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

export async function listGithubRepos(req, res) {
  const user = await User.findById(req.user._id).select('+githubAccessToken');
  const repos = await listUserRepos(user.githubAccessToken);
  res.json({ repos });
}

/**
 * Step before committing to indexing: shows the user exactly what it'll
 * cost against their quota, plus which top-level folders are worth
 * excluding. This is the direct fix for the old "hard cap at 500 files"
 * approach — the user makes an informed choice instead of hitting a wall.
 */
export async function estimateRepo(req, res) {
  const { fullName, scopedPath, excludePatterns } = req.body;
  const user = await User.findById(req.user._id).select('+githubAccessToken');
  const [owner, repoName] = fullName.split('/');

  const githubRepos = await listUserRepos(user.githubAccessToken);
  const match = githubRepos.find((r) => r.fullName === fullName);
  if (!match) return res.status(404).json({ error: 'Repo not found or not accessible' });

  const allFiles = await listRepoFiles(user.githubAccessToken, owner, repoName, match.defaultBranch);
  const fileList = allFiles.map((f) => ({
    path: f.path,
    size: f.size,
    contentFetcher: makeContentFetcher(user.githubAccessToken, owner, repoName, f.sha),
  }));

  const currentUsedMb = await getCollectionStorageEstimateMb();

  const [estimate, exclusionSuggestions] = await Promise.all([
    estimateIndexCost(fileList, {
      scopedPath: scopedPath || null,
      excludePatterns: excludePatterns || [],
      currentUsedMb,
    }),
    Promise.resolve(suggestExclusions(allFiles)),
  ]);

  res.json({ estimate, exclusionSuggestions, defaultBranch: match.defaultBranch, isPrivate: match.isPrivate });
}

export async function addRepo(req, res) {
  const { fullName, scopedPath, excludePatterns } = req.body;

  const user = await User.findById(req.user._id).select('+githubAccessToken');
  const [owner, repoName] = fullName.split('/');
  const githubRepos = await listUserRepos(user.githubAccessToken);
  const match = githubRepos.find((r) => r.fullName === fullName);
  if (!match) return res.status(404).json({ error: 'Repo not found or not accessible' });

  // If this repo already exists for this user (e.g. a previous attempt
  // failed), reset and re-index it instead of trying to insert a second
  // copy — that insert would violate the owner+fullName uniqueness
  // constraint and, without this check, crash the request.
  const existing = await Repo.findOne({ owner: req.user._id, fullName: match.fullName });
  if (existing) {
    // Best-effort cleanup of old vectors before re-indexing. If this repo
    // never actually got indexed last time (0 chunks), there's nothing to
    // delete and Qdrant may reasonably reject the request — that's not a
    // reason to block the user from retrying, so we log and continue
    // rather than letting a cleanup failure stop the whole re-add.
    try {
      await deleteRepoVectors(existing._id.toString());
    } catch (err) {
      logger.warn(`Could not clear old vectors for ${existing.fullName} before re-indexing`, {
        error: err.message,
      });
    }

    existing.scopedPath = scopedPath || null;
    existing.excludePatterns = excludePatterns?.length ? excludePatterns : existing.excludePatterns;
    existing.status = 'pending';
    existing.errorMessage = null;
    await existing.save();

    await enqueueIndexingJob(existing._id.toString(), req.user._id.toString());
    return res.status(200).json({ repo: existing });
  }

  const existingCount = await Repo.countDocuments({ owner: req.user._id });
  if (existingCount >= config.limits.maxReposPerUser) {
    return res.status(400).json({
      error: `You've reached the ${config.limits.maxReposPerUser}-repo limit for this free deployment. Delete a repo to add another.`,
    });
  }

  const repo = await Repo.create({
    owner: req.user._id,
    githubRepoId: match.githubRepoId,
    fullName: match.fullName,
    defaultBranch: match.defaultBranch,
    isPrivate: match.isPrivate,
    scopedPath: scopedPath || null,
    excludePatterns: excludePatterns?.length ? excludePatterns : undefined,
    status: 'pending',
  });

  await enqueueIndexingJob(repo._id.toString(), req.user._id.toString());

  res.status(201).json({ repo });
}

export async function listRepos(req, res) {
  const repos = await Repo.find({ owner: req.user._id }).sort({ createdAt: -1 });
  res.json({ repos });
}

export async function getRepo(req, res) {
  const repo = await Repo.findOne({ _id: req.params.repoId, owner: req.user._id });
  if (!repo) return res.status(404).json({ error: 'Repo not found' });
  res.json({ repo });
}

export async function deleteRepo(req, res) {
  const repo = await Repo.findOne({ _id: req.params.repoId, owner: req.user._id });
  if (!repo) return res.status(404).json({ error: 'Repo not found' });

  await deleteRepoVectors(repo._id.toString());
  await repo.deleteOne();

  res.json({ success: true });
}
