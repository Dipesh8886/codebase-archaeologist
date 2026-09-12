import { Octokit } from '@octokit/rest';

const DEFAULT_EXCLUDE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '__pycache__', 'vendor']);

function client(accessToken) {
  return new Octokit({ auth: accessToken });
}

export async function listUserRepos(accessToken) {
  const octokit = client(accessToken);
  const repos = await octokit.paginate(octokit.repos.listForAuthenticatedUser, {
    per_page: 100,
    sort: 'updated',
  });
  return repos.map((r) => ({
    githubRepoId: String(r.id),
    fullName: r.full_name,
    defaultBranch: r.default_branch,
    isPrivate: r.private,
    description: r.description,
  }));
}

/**
 * Recursively list all files in a repo via the Git Trees API (one call,
 * recursive=1) rather than walking directories one call at a time — this
 * matters a lot for staying within GitHub's rate limits on large repos.
 */
export async function listRepoFiles(accessToken, owner, repo, branch) {
  const octokit = client(accessToken);
  const { data } = await octokit.git.getTree({
    owner,
    repo,
    tree_sha: branch,
    recursive: '1',
  });

  return data.tree
    .filter((item) => item.type === 'blob')
    .filter((item) => !DEFAULT_EXCLUDE_DIRS.has(item.path.split('/')[0]))
    .map((item) => ({ path: item.path, size: item.size, sha: item.sha }));
}

export function makeContentFetcher(accessToken, owner, repo, sha) {
  const octokit = client(accessToken);
  return async () => {
    const { data } = await octokit.git.getBlob({ owner, repo, file_sha: sha });
    return Buffer.from(data.content, data.encoding).toString('utf-8');
  };
}
