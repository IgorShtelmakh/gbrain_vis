# gbrain_vis — Plan

Browser-based visualization + question-answering UI over a gbrain Postgres database
(https://github.com/garrytan/gbrain).

## What's in the database (verified live)

| Table | Rows | Role |
|---|---|---|
| `pages` | ~10,476 active | Graph **nodes**: `type` (concept: 9,056 / php-source: 1,420), `title`, `compiled_truth` (markdown), `frontmatter` jsonb, `timeline`, `emotional_weight`, `search_vector` (tsvector), trgm index on title |
| `links` | ~17,832 | Graph **edges**: `from_page_id` → `to_page_id`, `link_type` (≈all `mentions`), `context` snippet |
| `content_chunks` | 12,320 (all embedded) | pgvector(1536), OpenAI text-embedding-3-large |
| `tags`, `timeline_entries`, `sources` | — | Filters / detail panel enrichment |

Implication: search works out of the box LLM-free (FTS + trigram). Vector search of a
user question needs an `OPENAI_API_KEY` (to embed the query with the same model).
Answer synthesis needs an `ANTHROPIC_API_KEY`. Both are optional layers, not prerequisites.

## Key design decisions

1. **Never render all 10k nodes by default.** Two modes:
   - **Overview**: top ~300–500 nodes by degree (+ `emotional_weight`), edges among them —
     a readable "shape of the brain" map, colored by `type`, sized by degree.
   - **Focus**: any search/click loads a node's 1–2 hop neighborhood subgraph.
2. **Question → subgraph** flow (the core feature):
   `question → hybrid search (FTS + trgm + optional vector, RRF-fused) → top-K pages →
   expand 1-hop neighborhood → render subgraph with matched nodes highlighted →
   side panel shows ranked pages + (optionally) a Claude-synthesized answer citing them.`
3. **Read-only DB access.** Connection via `GBRAIN_DATABASE_URL` env var only; all queries
   SELECT-only. Credentials never in code. (Note: the DB password was shared in chat —
   worth rotating in Supabase.)
4. **WebGL graph rendering** — sigma.js + graphology (handles 10k+ nodes; ForceAtlas2
   layout in a web worker). Canvas libs (vis.js, cytoscape default renderer) choke at this scale.

## Stack

- **Next.js 15 (App Router) + TypeScript** — one app: API routes (server, `pg` pool) + UI. Single deployable, no CORS.
- **sigma.js v3 + graphology** for the graph; `@react-sigma/core` bindings.
- **Tailwind + shadcn/ui** for panels; `react-markdown` for `compiled_truth`.
- Optional: `openai` (query embedding), `@anthropic-ai/sdk` (answer synthesis, model `claude-fable-5`).

## API surface

| Endpoint | Returns |
|---|---|
| `GET /api/graph/overview?limit=400&type=` | top nodes by degree + induced edges |
| `GET /api/nodes/:id` | page detail: title, compiled_truth, frontmatter, tags, timeline |
| `GET /api/nodes/:id/neighbors?depth=1\|2` | neighborhood subgraph |
| `GET /api/search?q=` | hybrid-ranked pages (FTS `ts_rank` + trgm `similarity` + optional pgvector cosine, fused via reciprocal-rank) |
| `POST /api/ask` | `{question}` → `{results, subgraph, answer?}` — search + neighborhood expansion + optional Claude synthesis with citations |
| `GET /api/stats` | counts by type/link_type for legend & filters |

## UI layout

```
┌─────────────────────────────────────────────────┐
│ Search / Ask bar                    [filters ▾] │
├──────────────────────────────┬──────────────────┤
│                              │ Results / Answer │
│   Graph canvas (sigma.js)    │  - ranked pages  │
│   color = type               │  - synthesized   │
│   size = degree              │    answer + cites│
│   highlight = matched        ├──────────────────┤
│                              │ Node detail      │
│                              │  markdown, tags, │
│                              │  timeline, edges │
└──────────────────────────────┴──────────────────┘
```

Interactions: click node → detail panel + option to expand neighbors; hover edge → `context`
snippet; legend toggles types; dim non-matched nodes after a search.

## Phases

1. **Scaffold + DB layer** — Next.js app, `.env.local` with `GBRAIN_DATABASE_URL`, pg pool,
   `/api/stats` + `/api/graph/overview` working.
2. **Graph view** — sigma.js overview render, FA2 layout, zoom/pan, click → node detail panel.
3. **Search** — hybrid FTS+trgm endpoint, search bar, matched-node highlighting, neighborhood
   expansion ("Focus" mode).
4. **Ask** — vector search (if OPENAI_API_KEY) fused into ranking; Claude answer synthesis
   with page citations that link back to graph nodes.
5. **Polish** — type/link filters, edge-context tooltips, timeline in detail panel, loading
   states, deploy notes (Vercel or local).

Each phase ends runnable. Phases 1–3 need no API keys at all.
