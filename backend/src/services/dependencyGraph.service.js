import path from 'node:path';

/**
 * Parses import/require statements to build a file-level dependency graph,
 * then pre-computes a directory-clustered view so the frontend never has
 * to render a flat hairball for large repos.
 *
 * Two views are returned:
 *  - `clusters`: one node per top-level directory, edge weight = number of
 *    cross-directory imports. This is the DEFAULT view.
 *  - `files`: full per-file graph, used only when the user expands a
 *    cluster (lazy-loaded by the frontend, not rendered all at once).
 */

// Matches ES import/require and Python import statements — enough coverage
// for the common cases without needing a full parser per language.
const IMPORT_PATTERNS = [
  /import\s+.*?\s+from\s+['"](.+?)['"]/g,
  /require\(\s*['"](.+?)['"]\s*\)/g,
  /import\s*\(\s*['"](.+?)['"]\s*\)/g, // dynamic import()
  /^\s*from\s+([.\w]+)\s+import/gm, // python "from x import y"
  /^\s*import\s+([.\w]+)/gm, // python "import x"
];

function extractRawImports(content) {
  const found = new Set();
  for (const pattern of IMPORT_PATTERNS) {
    let match;
    // reset lastIndex since patterns are reused across files
    pattern.lastIndex = 0;
    while ((match = pattern.exec(content)) !== null) {
      found.add(match[1]);
    }
  }
  return [...found];
}

/**
 * Resolve a raw import specifier to a file in the repo's file set, when
 * possible. External packages (no relative path) are dropped from the
 * graph — we only graph internal file-to-file dependencies.
 */
function resolveImport(fromFile, rawImport, allFilePaths) {
  if (!rawImport.startsWith('.')) return null; // external package, e.g. "react"

  const fromDir = path.dirname(fromFile);
  const resolved = path.normalize(path.join(fromDir, rawImport));

  const candidates = [
    resolved,
    `${resolved}.js`, `${resolved}.jsx`, `${resolved}.ts`, `${resolved}.tsx`,
    `${resolved}.py`, `${resolved}/index.js`, `${resolved}/index.ts`,
  ];

  return candidates.find((c) => allFilePaths.has(c)) || null;
}

/**
 * @param {Array<{path: string, content: string}>} files
 * @returns {{ files: {nodes, edges}, clusters: {nodes, edges} }}
 */
export function buildDependencyGraph(files) {
  const allFilePaths = new Set(files.map((f) => f.path));
  const fileEdges = [];

  for (const file of files) {
    const rawImports = extractRawImports(file.content);
    for (const raw of rawImports) {
      const resolved = resolveImport(file.path, raw, allFilePaths);
      if (resolved && resolved !== file.path) {
        fileEdges.push({ from: file.path, to: resolved });
      }
    }
  }

  const fileNodes = files.map((f) => ({
    id: f.path,
    label: path.basename(f.path),
    dir: f.path.split('/')[0] || '.',
  }));

  const clusters = buildClusteredView(fileNodes, fileEdges);

  return {
    files: { nodes: fileNodes, edges: dedupeEdges(fileEdges) },
    clusters,
  };
}

function dedupeEdges(edges) {
  const seen = new Set();
  return edges.filter((e) => {
    const key = `${e.from}->${e.to}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Collapse file nodes into top-level-directory clusters. This is the
 * default graph view: a repo with 300 files might collapse to ~15
 * directory nodes, which is actually navigable, versus a flat 300-node
 * force layout that's unreadable regardless of algorithm.
 */
function buildClusteredView(fileNodes, fileEdges) {
  const dirOf = new Map(fileNodes.map((n) => [n.id, n.dir]));

  const clusterCounts = {};
  for (const n of fileNodes) {
    clusterCounts[n.dir] = (clusterCounts[n.dir] || 0) + 1;
  }

  const clusterNodes = Object.entries(clusterCounts).map(([dir, count]) => ({
    id: dir,
    label: dir,
    fileCount: count,
  }));

  const edgeWeights = {};
  for (const e of fileEdges) {
    const fromDir = dirOf.get(e.from);
    const toDir = dirOf.get(e.to);
    if (!fromDir || !toDir || fromDir === toDir) continue; // skip intra-cluster edges in the collapsed view
    const key = `${fromDir}->${toDir}`;
    edgeWeights[key] = (edgeWeights[key] || 0) + 1;
  }

  const clusterEdges = Object.entries(edgeWeights).map(([key, weight]) => {
    const [from, to] = key.split('->');
    return { from, to, weight };
  });

  return { nodes: clusterNodes, edges: clusterEdges };
}

/**
 * Used when the frontend expands a single cluster: returns just that
 * directory's files and their edges (including edges to other clusters,
 * shown as "external" stub nodes) — never the whole-repo file graph at once.
 */
export function expandCluster(dir, fileGraph) {
  const nodesInDir = fileGraph.nodes.filter((n) => n.dir === dir);
  const nodeIds = new Set(nodesInDir.map((n) => n.id));

  const relevantEdges = fileGraph.edges.filter((e) => nodeIds.has(e.from) || nodeIds.has(e.to));

  const externalStubs = new Map();
  for (const e of relevantEdges) {
    for (const id of [e.from, e.to]) {
      if (!nodeIds.has(id) && !externalStubs.has(id)) {
        externalStubs.set(id, { id, label: path.basename(id), external: true });
      }
    }
  }

  return {
    nodes: [...nodesInDir, ...externalStubs.values()],
    edges: relevantEdges,
  };
}
