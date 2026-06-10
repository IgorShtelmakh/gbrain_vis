# 🧠 gbrain visual explorer

Interactive browser visualization for a [gbrain](https://github.com/garrytan/gbrain)
knowledge graph stored in Postgres. Ask questions in natural language, see the
matching nodes light up, and walk the graph by expanding neighborhoods.

![gbrain explorer — interactive knowledge graph](docs/screenshot.png)

## Features

- **Overview map** — the ~400 most-connected pages, force-laid-out (ForceAtlas2 in a
  web worker), colored by page type, sized by connection count. Rendered with
  WebGL (sigma.js), so it stays smooth at thousands of nodes.
- **Ask the brain** — hybrid search: Postgres full-text + trigram title match,
  rank-fused with pgvector semantic search (when an OpenAI key is set). Results
  render as a focused subgraph with matches highlighted and 1-hop context dimmed
  around them.
- **Synthesized answers** — with an Anthropic key set, Claude answers the question
  from the retrieved pages, with citations.
- **Fully interactive**:
  - *click* a node → inspect it: markdown content, tags, connections with the
    context snippet of each link
  - *double-click* (or "Expand neighbors") → pull the node's neighborhood from the
    DB and grow the graph in place
  - *drag* nodes, *hover* to spotlight a neighborhood, *toggle* types in the legend

## Requirements

- Node.js 20+
- A gbrain Postgres database (Supabase or any Postgres with `pgvector` + `pg_trgm`)

## Install

```bash
git clone https://github.com/IgorShtelmakh/gbrain_vis.git
cd gbrain_vis
npm install
cp .env.local.example .env.local
```

Edit `.env.local`:

```bash
# required — read-only access is enough, the app only runs SELECTs
GBRAIN_DATABASE_URL=postgresql://user:password@host:5432/postgres

# optional — embeds your question for pgvector semantic search
# (must be an OpenAI key: gbrain chunks are embedded with text-embedding-3-large)
GBRAIN_OPENAI_API_KEY=sk-...

# optional — Claude-synthesized answers with citations above search results
GBRAIN_ANTHROPIC_API_KEY=sk-ant-...
```

Without the optional keys the app still works — search falls back to full-text +
trigram matching.

## Run

```bash
npm run dev          # development — http://localhost:3000
```

```bash
npm run build        # production
npm start
```

## How it works

| Endpoint | Purpose |
|---|---|
| `GET /api/graph/overview` | top-N nodes by degree + edges among them |
| `POST /api/ask` | hybrid search → 1-hop subgraph around matches → optional Claude answer |
| `GET /api/search?q=` | hybrid-ranked pages with highlighted snippets |
| `GET /api/nodes/:id` | page detail: markdown, tags, connections with context |
| `GET /api/nodes/:id/neighbors` | neighborhood subgraph for expansion |
| `GET /api/stats` | counts by type for the legend |

Nodes are gbrain `pages`, edges are `links`. Search reuses the indexes gbrain
already maintains: the `search_vector` tsvector, a `pg_trgm` index on titles, and
the `content_chunks.embedding` pgvector column (1536-dim `text-embedding-3-large`).
Text and vector rankings are merged with reciprocal-rank fusion, the same idea
gbrain itself uses.

## Stack

Next.js 16 (App Router, TypeScript) · sigma.js v3 + graphology · ForceAtlas2 worker
layout · Tailwind CSS v4 · node-postgres
