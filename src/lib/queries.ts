import { getPool } from "./db";
import type {
  ContentTypes,
  GEdge,
  GNode,
  HealthStatus,
  IndexHealth,
  History,
  HistoryBucket,
  HistoryMetric,
  HistoryPoint,
  NodeDetail,
  SearchResult,
  Stats,
  SubGraph,
  TagCount,
} from "./types";

const DEGREE_CTE = `
  deg AS (
    SELECT page_id, count(*)::int AS degree FROM (
      SELECT from_page_id AS page_id FROM links
      UNION ALL
      SELECT to_page_id FROM links
    ) x GROUP BY 1
  )
`;

async function edgesAmong(ids: number[]): Promise<GEdge[]> {
  if (ids.length === 0) return [];
  const { rows } = await getPool().query(
    `SELECT DISTINCT from_page_id AS source, to_page_id AS target, link_type
     FROM links
     WHERE from_page_id = ANY($1::int[]) AND to_page_id = ANY($1::int[])`,
    [ids]
  );
  return rows;
}

export async function getOverview(limit = 400): Promise<SubGraph> {
  const { rows: nodes } = await getPool().query(
    `WITH ${DEGREE_CTE}
     SELECT p.id, p.title, p.type, d.degree
     FROM pages p JOIN deg d ON d.page_id = p.id
     WHERE p.deleted_at IS NULL
     ORDER BY d.degree DESC
     LIMIT $1`,
    [limit]
  );
  const edges = await edgesAmong(nodes.map((n: GNode) => n.id));
  return { nodes, edges };
}

export async function getNeighbors(id: number, limit = 60): Promise<SubGraph> {
  const { rows: nodes } = await getPool().query(
    `WITH ${DEGREE_CTE},
     nb AS (
       SELECT DISTINCT CASE WHEN from_page_id = $1 THEN to_page_id ELSE from_page_id END AS pid
       FROM links WHERE from_page_id = $1 OR to_page_id = $1
     )
     SELECT p.id, p.title, p.type, COALESCE(d.degree, 0) AS degree
     FROM nb
     JOIN pages p ON p.id = nb.pid AND p.deleted_at IS NULL
     LEFT JOIN deg d ON d.page_id = p.id
     ORDER BY d.degree DESC NULLS LAST
     LIMIT $2`,
    [id, limit]
  );
  const ids = [id, ...nodes.map((n: GNode) => n.id)];
  const edges = await edgesAmong(ids);
  return { nodes: nodes.map((n: GNode) => ({ ...n, anchor: id })), edges };
}

export async function getNodeDetail(id: number): Promise<NodeDetail | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    `WITH ${DEGREE_CTE}
     SELECT p.id, p.title, p.type, p.compiled_truth, p.frontmatter,
            p.emotional_weight, p.created_at, p.updated_at,
            COALESCE(d.degree, 0) AS degree
     FROM pages p LEFT JOIN deg d ON d.page_id = p.id
     WHERE p.id = $1 AND p.deleted_at IS NULL`,
    [id]
  );
  if (rows.length === 0) return null;

  const [tagsRes, connRes] = await Promise.all([
    pool.query(`SELECT tag FROM tags WHERE page_id = $1 ORDER BY tag`, [id]),
    pool.query(
      `SELECT p2.id, p2.title, p2.type, l.link_type, l.context,
              CASE WHEN l.from_page_id = $1 THEN 'out' ELSE 'in' END AS dir
       FROM links l
       JOIN pages p2
         ON p2.id = CASE WHEN l.from_page_id = $1 THEN l.to_page_id ELSE l.from_page_id END
        AND p2.deleted_at IS NULL
       WHERE l.from_page_id = $1 OR l.to_page_id = $1
       ORDER BY p2.title
       LIMIT 80`,
      [id]
    ),
  ]);

  return {
    ...rows[0],
    tags: tagsRes.rows.map((r) => r.tag),
    connections: connRes.rows,
  };
}

export async function textSearch(q: string, limit = 12): Promise<SearchResult[]> {
  const { rows } = await getPool().query(
    `WITH ${DEGREE_CTE},
     q AS (SELECT websearch_to_tsquery('english', $1) AS tsq)
     SELECT p.id, p.title, p.type, COALESCE(d.degree, 0) AS degree,
            (ts_rank(p.search_vector, q.tsq) * 2 + similarity(p.title, $1))::float AS score,
            ts_headline('english', left(p.compiled_truth, 4000), q.tsq,
              'MaxFragments=2, MaxWords=20, MinWords=6, StartSel=**, StopSel=**') AS snippet
     FROM pages p
     LEFT JOIN deg d ON d.page_id = p.id, q
     WHERE p.deleted_at IS NULL
       AND (p.search_vector @@ q.tsq OR p.title % $1)
     ORDER BY score DESC
     LIMIT $2`,
    [q, limit]
  );
  return rows;
}

async function vectorSearch(q: string, limit = 20): Promise<SearchResult[]> {
  // GBRAIN_ prefix first: a stale OPENAI_API_KEY exported in the shell would
  // otherwise shadow .env.local (Next.js never overrides existing process env)
  const key = process.env.GBRAIN_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "text-embedding-3-large",
        dimensions: 1536,
        input: q,
      }),
    });
    if (!res.ok) {
      console.error("vectorSearch: embeddings API", res.status, await res.text());
      return [];
    }
    const data = await res.json();
    const embedding: number[] = data.data[0].embedding;
    const { rows } = await getPool().query(
      `WITH ${DEGREE_CTE},
       hits AS (
         SELECT cc.page_id, max(1 - (cc.embedding <=> $1::vector))::float AS sim,
                (array_agg(left(cc.chunk_text, 300) ORDER BY cc.embedding <=> $1::vector))[1] AS snippet
         FROM content_chunks cc
         GROUP BY cc.page_id
         ORDER BY sim DESC
         LIMIT $2
       )
       SELECT p.id, p.title, p.type, COALESCE(d.degree, 0) AS degree,
              h.sim AS score, h.snippet
       FROM hits h
       JOIN pages p ON p.id = h.page_id AND p.deleted_at IS NULL
       LEFT JOIN deg d ON d.page_id = p.id
       ORDER BY h.sim DESC`,
      [JSON.stringify(embedding), limit]
    );
    return rows;
  } catch (e) {
    console.error("vectorSearch failed:", e);
    return [];
  }
}

/** Reciprocal-rank fusion of text + vector results. */
export async function hybridSearch(q: string, limit = 12): Promise<SearchResult[]> {
  const [text, vector] = await Promise.all([textSearch(q, 25), vectorSearch(q, 25)]);
  if (vector.length === 0) return text.slice(0, limit);

  const K = 60;
  const fused = new Map<number, SearchResult & { rrf: number }>();
  for (const [list, weight] of [[text, 1], [vector, 1]] as const) {
    list.forEach((r, i) => {
      const prev = fused.get(r.id);
      const rrf = (prev?.rrf ?? 0) + weight / (K + i + 1);
      fused.set(r.id, { ...(prev ?? r), snippet: prev?.snippet ?? r.snippet, rrf });
    });
  }
  return [...fused.values()]
    .sort((a, b) => b.rrf - a.rrf)
    .slice(0, limit)
    .map(({ rrf, ...r }) => ({ ...r, score: rrf }));
}

/** Subgraph around a set of matched pages: matches + their highest-degree neighbors. */
export async function getSubgraphAround(
  matchedIds: number[],
  maxNodes = 130
): Promise<SubGraph> {
  if (matchedIds.length === 0) return { nodes: [], edges: [] };
  const pool = getPool();
  const { rows: matched } = await pool.query(
    `WITH ${DEGREE_CTE}
     SELECT p.id, p.title, p.type, COALESCE(d.degree, 0) AS degree
     FROM pages p LEFT JOIN deg d ON d.page_id = p.id
     WHERE p.id = ANY($1::int[]) AND p.deleted_at IS NULL`,
    [matchedIds]
  );
  const { rows: neighbors } = await pool.query(
    `WITH ${DEGREE_CTE},
     nb AS (
       SELECT DISTINCT CASE WHEN l.from_page_id = m.id THEN l.to_page_id ELSE l.from_page_id END AS pid,
              min(m.id) AS anchor
       FROM links l
       JOIN unnest($1::int[]) AS m(id)
         ON l.from_page_id = m.id OR l.to_page_id = m.id
       GROUP BY 1
     )
     SELECT p.id, p.title, p.type, COALESCE(d.degree, 0) AS degree, nb.anchor
     FROM nb
     JOIN pages p ON p.id = nb.pid AND p.deleted_at IS NULL
     LEFT JOIN deg d ON d.page_id = p.id
     WHERE NOT (p.id = ANY($1::int[]))
     ORDER BY d.degree DESC NULLS LAST
     LIMIT $2`,
    [matchedIds, Math.max(0, maxNodes - matched.length)]
  );
  const nodes: GNode[] = [...matched, ...neighbors];
  const edges = await edgesAmong(nodes.map((n) => n.id));
  return { nodes, edges };
}

export async function synthesizeAnswer(
  question: string,
  results: SearchResult[]
): Promise<string | null> {
  const key = process.env.GBRAIN_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!key || results.length === 0) return null;
  const { rows } = await getPool().query(
    `SELECT id, title, left(compiled_truth, 1500) AS body
     FROM pages WHERE id = ANY($1::int[])`,
    [results.slice(0, 8).map((r) => r.id)]
  );
  const context = rows
    .map((r) => `<page id="${r.id}" title="${r.title}">\n${r.body}\n</page>`)
    .join("\n\n");
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-fable-5",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `Answer the question using ONLY the knowledge-base pages below. Cite pages inline as [title]. If the pages don't contain the answer, say what's missing.\n\n${context}\n\nQuestion: ${question}`,
          },
        ],
      }),
    });
    if (!res.ok) {
      console.error("synthesizeAnswer: messages API", res.status, await res.text());
      return null;
    }
    const data = await res.json();
    // skip non-text blocks (e.g. thinking) — the answer is the first text block
    const text = (data.content as { type: string; text?: string }[] | undefined)?.find(
      (b) => b.type === "text"
    )?.text;
    return text ?? null;
  } catch (e) {
    console.error("synthesizeAnswer failed:", e);
    return null;
  }
}

/** All tags with how many (non-deleted) pages carry each. */
export async function getAllTags(): Promise<TagCount[]> {
  const { rows } = await getPool().query(
    `SELECT t.tag, count(*)::int AS count
     FROM tags t JOIN pages p ON p.id = t.page_id AND p.deleted_at IS NULL
     GROUP BY t.tag
     ORDER BY count DESC, t.tag`
  );
  return rows;
}

/** Pages carrying a given tag, highest-degree first. */
export async function getPagesByTag(tag: string, limit = 200): Promise<GNode[]> {
  const { rows } = await getPool().query(
    `WITH ${DEGREE_CTE}
     SELECT p.id, p.title, p.type, COALESCE(d.degree, 0) AS degree
     FROM tags t
     JOIN pages p ON p.id = t.page_id AND p.deleted_at IS NULL
     LEFT JOIN deg d ON d.page_id = p.id
     WHERE t.tag = $1
     ORDER BY d.degree DESC NULLS LAST, p.title
     LIMIT $2`,
    [tag, limit]
  );
  return rows;
}

const HISTORY_BUCKETS = new Set<HistoryBucket>(["day", "week", "month"]);
// Whitelist mapping metric -> column name. The column is interpolated into SQL
// (a column name cannot be a bind param), so it MUST come from this map only.
const HISTORY_METRIC_COLS: Record<HistoryMetric, string> = {
  created: "created_at",
  updated: "updated_at",
};

/** Timeline of when pages were added/updated, bucketed and split by type. */
export async function getHistory(
  bucket: HistoryBucket = "month",
  metric: HistoryMetric = "created"
): Promise<History> {
  const b: HistoryBucket = HISTORY_BUCKETS.has(bucket) ? bucket : "month";
  const m: HistoryMetric = metric in HISTORY_METRIC_COLS ? metric : "created";
  const col = HISTORY_METRIC_COLS[m]; // safe — whitelisted column name
  const pool = getPool();
  const [series, span, recent, recentUpdated] = await Promise.all([
    pool.query(
      // date_trunc's unit is passed as a bind param (safe); col is whitelisted above.
      `SELECT date_trunc($1, ${col}) AS period, type, count(*)::int AS count
       FROM pages
       WHERE deleted_at IS NULL AND ${col} IS NOT NULL
       GROUP BY 1, 2
       ORDER BY 1`,
      [b]
    ),
    pool.query(
      `SELECT (SELECT count(*)::int FROM pages WHERE deleted_at IS NULL) AS total,
              count(*)::int AS dated,
              min(${col}) AS first, max(${col}) AS last
       FROM pages WHERE deleted_at IS NULL AND ${col} IS NOT NULL`
    ),
    pool.query(
      `SELECT id, title, type, created_at, updated_at
       FROM pages
       WHERE deleted_at IS NULL AND created_at IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 40`
    ),
    pool.query(
      // Only pages actually edited after creation — excludes the update==create case.
      `SELECT id, title, type, created_at, updated_at
       FROM pages
       WHERE deleted_at IS NULL AND updated_at IS NOT NULL AND updated_at > created_at
       ORDER BY updated_at DESC
       LIMIT 40`
    ),
  ]);

  const typeTotals = new Map<string, number>();
  const pointMap = new Map<string, HistoryPoint>();
  for (const r of series.rows) {
    const key = (r.period as Date).toISOString();
    let p = pointMap.get(key);
    if (!p) {
      p = { period: key, total: 0, byType: {} };
      pointMap.set(key, p);
    }
    p.byType[r.type] = (p.byType[r.type] ?? 0) + r.count;
    p.total += r.count;
    typeTotals.set(r.type, (typeTotals.get(r.type) ?? 0) + r.count);
  }
  const points = [...pointMap.values()].sort((a, c) => a.period.localeCompare(c.period));
  let run = 0;
  const cumulative = points.map((p) => (run += p.total));
  const types = [...typeTotals.entries()].sort((a, c) => c[1] - a[1]).map(([t]) => t);

  const s = span.rows[0];
  const toRecent = (r: { id: number; title: string; type: string; created_at: Date; updated_at: Date | null }) => ({
    id: r.id,
    title: r.title,
    type: r.type,
    created_at: (r.created_at as Date).toISOString(),
    updated_at: r.updated_at ? (r.updated_at as Date).toISOString() : null,
  });
  return {
    bucket: b,
    metric: m,
    types,
    points,
    cumulative,
    totalPages: s.total,
    datedPages: s.dated,
    firstAt: s.first ? (s.first as Date).toISOString() : null,
    lastAt: s.last ? (s.last as Date).toISOString() : null,
    recent: recent.rows.map(toRecent),
    recentUpdated: recentUpdated.rows.map(toRecent),
  };
}

/** Breakdown of the content present in the DB: page types, link types, tags. */
export async function getContentTypes(): Promise<ContentTypes> {
  const pool = getPool();
  const [typesRes, linkRes, tagsRes, totals] = await Promise.all([
    pool.query(
      `WITH ranked AS (
         SELECT type, title,
                row_number() OVER (
                  PARTITION BY type ORDER BY created_at DESC NULLS LAST, id DESC
                ) AS rn,
                count(*) OVER (PARTITION BY type) AS cnt
         FROM pages WHERE deleted_at IS NULL
       )
       SELECT type, max(cnt)::int AS count,
              array_agg(title ORDER BY rn) FILTER (WHERE rn <= 5) AS samples
       FROM ranked
       GROUP BY type
       ORDER BY count DESC`
    ),
    pool.query(
      `SELECT link_type, count(*)::int AS count FROM links GROUP BY link_type ORDER BY count DESC`
    ),
    pool.query(
      `SELECT t.tag, count(*)::int AS count
       FROM tags t JOIN pages p ON p.id = t.page_id AND p.deleted_at IS NULL
       GROUP BY t.tag
       ORDER BY count DESC, t.tag
       LIMIT 60`
    ),
    pool.query(
      `SELECT (SELECT count(*)::int FROM pages WHERE deleted_at IS NULL) AS pages,
              (SELECT count(*)::int FROM links) AS links,
              (SELECT count(DISTINCT t.page_id)::int
                 FROM tags t JOIN pages p ON p.id = t.page_id AND p.deleted_at IS NULL) AS tagged`
    ),
  ]);
  return {
    totalPages: totals.rows[0].pages,
    totalLinks: totals.rows[0].links,
    taggedPages: totals.rows[0].tagged,
    types: typesRes.rows.map((r) => ({
      type: r.type,
      count: r.count,
      samples: r.samples ?? [],
    })),
    linkTypes: linkRes.rows,
    tags: tagsRes.rows,
  };
}

export async function getStats(): Promise<Stats> {
  const pool = getPool();
  const [types, linkTypes, totals] = await Promise.all([
    pool.query(
      `SELECT type, count(*)::int AS count FROM pages WHERE deleted_at IS NULL GROUP BY type ORDER BY count DESC`
    ),
    pool.query(
      `SELECT link_type, count(*)::int AS count FROM links GROUP BY link_type ORDER BY count DESC`
    ),
    pool.query(
      `SELECT (SELECT count(*)::int FROM pages WHERE deleted_at IS NULL) AS pages,
              (SELECT count(*)::int FROM links) AS links`
    ),
  ]);
  return {
    types: types.rows,
    linkTypes: linkTypes.rows,
    totalPages: totals.rows[0].pages,
    totalLinks: totals.rows[0].links,
  };
}

/**
 * Liveness + freshness probe for the gbrain backend. Never throws — a failed
 * DB call is reported as `db.connected: false` with the error message, so the
 * Health page can always render.
 */
export async function getHealth(): Promise<HealthStatus> {
  const pool = getPool();
  const checkedAt = new Date().toISOString();
  const db: HealthStatus["db"] = {
    connected: false,
    latencyMs: null,
    serverTime: null,
    version: null,
    error: null,
  };
  const data: HealthStatus["data"] = {
    activePages: 0,
    deletedPages: 0,
    lastCreatedAt: null,
    lastUpdatedAt: null,
  };

  try {
    const start = Date.now();
    const ping = await pool.query<{ server_time: Date; version: string }>(
      `SELECT now() AS server_time, version() AS version`
    );
    db.latencyMs = Date.now() - start;
    db.connected = true;
    db.serverTime = ping.rows[0].server_time.toISOString();
    db.version = ping.rows[0].version;

    const res = await pool.query<{
      active: number;
      deleted: number;
      last_created: Date | null;
      last_updated: Date | null;
    }>(
      `SELECT (count(*) FILTER (WHERE deleted_at IS NULL))::int AS active,
              (count(*) FILTER (WHERE deleted_at IS NOT NULL))::int AS deleted,
              max(created_at) FILTER (WHERE deleted_at IS NULL) AS last_created,
              max(updated_at) FILTER (WHERE deleted_at IS NULL) AS last_updated
       FROM pages`
    );
    const s = res.rows[0];
    data.activePages = s.active;
    data.deletedPages = s.deleted;
    data.lastCreatedAt = s.last_created ? s.last_created.toISOString() : null;
    data.lastUpdatedAt = s.last_updated ? s.last_updated.toISOString() : null;
  } catch (e) {
    db.error = e instanceof Error ? e.message : String(e);
    console.error("Health check failed:", e);
  }

  return {
    ok: db.connected,
    checkedAt,
    db,
    data,
    pool: {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount,
    },
  };
}

// Max points per indexation dimension — together they sum to 100.
const INDEX_WEIGHTS = {
  embed: 35, // share of pages with embedded chunks
  links: 25, // share of pages the linker has processed
  timeline: 10, // share of pages carrying a timeline
  orphans: 15, // connectivity — penalised by orphan share
  deadLinks: 15, // link integrity — penalised by dangling links
} as const;

/**
 * Indexation quality of the corpus: how thoroughly pages are embedded, linked,
 * dated, and free of dangling references. Returns null (not throws) if the DB
 * is unreachable so the Health page degrades gracefully.
 */
export async function getIndexHealth(): Promise<IndexHealth | null> {
  const pool = getPool();
  try {
    const [pagesRes, linksRes, orphanRes, timelineRes, contraRes] = await Promise.all([
      // One pass over pages; maxv is computed once via the cross join (not per row).
      pool.query<{
        active: number;
        links_extracted: number;
        no_chunks: number;
        embedded: number;
        missing_embed: number;
        stale: number;
      }>(
        `SELECT
           count(*)::int AS active,
           (count(*) FILTER (WHERE p.links_extracted_at IS NOT NULL))::int AS links_extracted,
           (count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM content_chunks c WHERE c.page_id = p.id)))::int AS no_chunks,
           (count(*) FILTER (WHERE EXISTS (SELECT 1 FROM content_chunks c WHERE c.page_id = p.id AND c.embedding IS NOT NULL)))::int AS embedded,
           (count(*) FILTER (WHERE EXISTS (SELECT 1 FROM content_chunks c WHERE c.page_id = p.id)
                               AND NOT EXISTS (SELECT 1 FROM content_chunks c WHERE c.page_id = p.id AND c.embedding IS NOT NULL)))::int AS missing_embed,
           (count(*) FILTER (WHERE p.chunker_version < m.maxv))::int AS stale
         FROM pages p
         CROSS JOIN (SELECT max(chunker_version) AS maxv FROM pages WHERE deleted_at IS NULL) m
         WHERE p.deleted_at IS NULL`
      ),
      pool.query<{ total: number; dead: number }>(
        `SELECT count(*)::int AS total,
                (count(*) FILTER (WHERE l.to_page_id IS NULL
                  OR NOT EXISTS (SELECT 1 FROM pages p WHERE p.id = l.to_page_id AND p.deleted_at IS NULL)))::int AS dead
         FROM links l`
      ),
      pool.query<{ orphans: number }>(
        `SELECT count(*)::int AS orphans
         FROM pages p
         WHERE p.deleted_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM links l WHERE l.from_page_id = p.id OR l.to_page_id = p.id)`
      ),
      pool.query<{ n: number }>(
        `SELECT count(*)::int AS n
         FROM pages p
         WHERE p.deleted_at IS NULL
           AND EXISTS (SELECT 1 FROM timeline_entries t WHERE t.page_id = p.id)`
      ),
      pool.query<{ ran_at: Date; queries_evaluated: number; total_contradictions_flagged: number }>(
        `SELECT ran_at, queries_evaluated, total_contradictions_flagged
         FROM eval_contradictions_runs ORDER BY ran_at DESC LIMIT 1`
      ),
    ]);

    const p = pagesRes.rows[0];
    const l = linksRes.rows[0];
    const orphans = orphanRes.rows[0].orphans;
    const timelinePages = timelineRes.rows[0].n;
    const active = Math.max(1, p.active); // guard divide-by-zero on an empty brain

    // Each dimension is a 0..1 health ratio scaled by its weight, then rounded.
    const ratios = {
      embed: p.embedded / active,
      links: p.links_extracted / active,
      timeline: timelinePages / active,
      orphans: 1 - orphans / active,
      deadLinks: l.total > 0 ? 1 - l.dead / l.total : 1,
    };
    const labels = {
      embed: "embed",
      links: "links",
      timeline: "timeline",
      orphans: "orphans",
      deadLinks: "dead-links",
    };
    const parts: IndexHealth["parts"] = (
      Object.keys(INDEX_WEIGHTS) as (keyof typeof INDEX_WEIGHTS)[]
    ).map((key) => ({
      key,
      label: labels[key],
      points: Math.round(INDEX_WEIGHTS[key] * Math.max(0, Math.min(1, ratios[key]))),
      max: INDEX_WEIGHTS[key],
    }));
    const score = parts.reduce((sum, part) => sum + part.points, 0);

    const cRow = contraRes.rows[0];

    return {
      score,
      parts,
      totalPages: p.active,
      embeddedPct: Math.round((p.embedded / active) * 100),
      missingEmbeddings: p.missing_embed,
      staleEmbeddings: p.stale,
      pagesWithoutChunks: p.no_chunks,
      orphans,
      totalLinks: l.total,
      deadLinks: l.dead,
      timelinePages,
      contradictions: cRow
        ? {
            flagged: cRow.total_contradictions_flagged,
            queriesEvaluated: cRow.queries_evaluated,
            ranAt: cRow.ran_at.toISOString(),
          }
        : null,
    };
  } catch (e) {
    console.error("Index health failed:", e);
    return null;
  }
}
