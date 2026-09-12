import mongoose from 'mongoose';

/**
 * One document per indexed repo. Storage estimates are computed BEFORE
 * indexing (see indexEstimator.service.js) so the user can see the cost
 * against their Qdrant quota before committing — this replaces the old
 * blunt "500 files max" rule with a real budget check.
 */
const repoSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  githubRepoId: { type: String, required: true },
  fullName: { type: String, required: true }, // e.g. "octocat/hello-world"
  defaultBranch: { type: String, default: 'main' },
  isPrivate: { type: Boolean, default: false },

  // Optional scoping — user can index a subfolder instead of the whole repo
  scopedPath: { type: String, default: null }, // e.g. "src/" or null for whole repo

  status: {
    type: String,
    enum: ['pending', 'estimating', 'indexing', 'ready', 'failed'],
    default: 'pending',
  },
  errorMessage: { type: String, default: null },

  stats: {
    fileCount: { type: Number, default: 0 },
    chunkCount: { type: Number, default: 0 },
    estimatedStorageMb: { type: Number, default: 0 },
    languages: [{ type: String }], // detected via Tree-sitter grammars matched
    indexedAt: { type: Date, default: null },
  },

  // Excluded paths applied during indexing (defaults + user overrides)
  excludePatterns: {
    type: [String],
    default: ['node_modules', '.git', 'dist', 'build', '*.min.js', '*.lock', 'vendor', '__pycache__'],
  },

  createdAt: { type: Date, default: Date.now },
});

repoSchema.index({ owner: 1, fullName: 1 }, { unique: true });

export const Repo = mongoose.model('Repo', repoSchema);
