import { getPool } from "./db";
import type {
  GEdge,
  GNode,
  NodeDetail,
  SearchResult,
  Stats,
  SubGraph,
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
