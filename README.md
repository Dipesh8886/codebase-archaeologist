# AI Codebase Archaeologist

Ask natural-language questions about any GitHub repo and get AI-powered answers
with exact file-level citations, plus an interactive dependency graph — built
entirely on free tiers ($0/month).

## Project structure

```
codebase-archaeologist/
├── backend/     Node.js/Express API + BullMQ worker (see backend/README.md)
├── frontend/    React + Vite + Tailwind SPA (see frontend/README.md)
└── README.md    This file
```

## What was fixed vs. the original spec

1. **Multi-language support at MVP, not post-MVP** — swapped `@babel/parser`
   (JS/TS only) for Tree-sitter, which covers JS/TS/Python/Go/Java/Ruby/Rust/C/C++
   at zero added cost. See `backend/src/services/chunking.service.js`.
2. **No more flat "500 files" cap** — replaced with a pre-index storage
   estimator that checks real Qdrant quota usage and lets users scope to a
   subfolder or exclude directories instead of hitting an arbitrary wall.
   See `backend/src/services/indexEstimator.service.js` and the Add Repo page.
3. **Groq rate limits handled by architecture, not hope** — the LLM is only
   ever called during Q&A (never during indexing), plus automatic fallback
   to a free secondary model (Gemini Flash / OpenRouter) on 429s.
   See `backend/src/services/llm.service.js`.
4. **Dependency graph won't turn into a hairball** — default view is
   directory-clustered; clicking a cluster lazy-loads just that folder's
   files. See `backend/src/services/dependencyGraph.service.js` and
   `frontend/src/components/DependencyGraph.jsx`.

## Quick start

1. `cd backend && cp .env.example .env` — fill in GitHub OAuth, MongoDB Atlas,
   Qdrant Cloud, Upstash Redis, Groq, Hugging Face, and (optional) Gemini/OpenRouter
   credentials — all free-tier signups.
2. `bash scripts/generate-jwt-keys.sh` — paste the output into `.env`.
3. `npm install && bash scripts/fetch-grammars.sh && npm run dev` — starts the API.
4. In a second terminal: `npm run worker` — starts the background indexing worker.
5. `cd ../frontend && cp .env.example .env && npm install && npm run dev`.

## Deployment (all free tier)

| Component | Platform |
|---|---|
| Frontend | Vercel |
| Backend API + Worker | Render (render.yaml included) |
| Database | MongoDB Atlas (M0) |
| Vector DB | Qdrant Cloud |
| Cache/Queue | Upstash Redis |
| LLM | Groq (primary), Gemini/OpenRouter (fallback) |
| Embeddings | Hugging Face Inference API |

See `backend/render.yaml` for the two-service (API + worker) Render config.
