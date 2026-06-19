export type GNode = {
  id: number;
  title: string;
  type: string;
  degree: number;
  /** id of the node this one was expanded from — used for initial placement */
  anchor?: number;
};

export type GEdge = {
  source: number;
  target: number;
  link_type: string;
};

export type SubGraph = {
  nodes: GNode[];
  edges: GEdge[];
};

export type SearchResult = {
  id: number;
  title: string;
  type: string;
  degree: number;
  score: number;
  snippet: string | null;
};

/** Fast phase of a search: matches + the subgraph to render. */
export type AskResponse = {
  results: SearchResult[];
  subgraph: SubGraph;
};

/** Slow phase: the LLM answer synthesized from the matches. */
export type AnswerResponse = {
  answer: string | null;
};

// --- Code call graph (symbol -> symbol "calls"/"references" edges) ---
/** A symbol you can center the call-graph on (an internal, page-backed symbol). */
export type SymbolHit = {
  /** fully-qualified symbol name — the call graph's node id */
  symbol: string;
  /** short display name (last path segment) */
  label: string;
  /** the page that defines it, if we have one */
  pageId: number | null;
  pageType: string | null;
  /** how many edges touch it overall (caller + callee count) */
  degree: number;
};

export type CallNode = {
  /** fully-qualified symbol name — unique node id */
  symbol: string;
  label: string;
  /** true if no page in our corpus defines it (a framework/external leaf) */
  external: boolean;
  pageId: number | null;
  pageType: string | null;
  /** source file of the definition, if known */
  file: string | null;
  /** BFS distance from the centered symbol (0 = center) */
  depth: number;
  /** callers / callees within this subgraph */
  inDegree: number;
  outDegree: number;
};

export type CallEdgeKind = "calls" | "references";

export type CallEdge = {
  from: string;
  to: string;
  kind: CallEdgeKind | string;
};

/** An ego call-graph centered on one symbol. */
export type CallGraph = {
  center: string;
  depth: number;
  nodes: CallNode[];
  edges: CallEdge[];
  /** true if the node set was capped for legibility */
  truncated: boolean;
};

export type Connection = {
  id: number;
  title: string;
  type: string;
  link_type: string;
  dir: "in" | "out";
  context: string;
};

export type NodeDetail = {
  id: number;
  title: string;
  type: string;
  compiled_truth: string;
  frontmatter: Record<string, unknown>;
  emotional_weight: number;
  created_at: string;
  updated_at: string;
  degree: number;
  tags: string[];
  connections: Connection[];
};

export type Stats = {
  types: { type: string; count: number }[];
  linkTypes: { link_type: string; count: number }[];
  totalPages: number;
  totalLinks: number;
};

// --- History (timeline of when knowledge was added) ---
export type HistoryBucket = "day" | "week" | "month";
/** Which timestamp the timeline & stats are built on. */
export type HistoryMetric = "created" | "updated";

export type HistoryPoint = {
  /** ISO timestamp at the start of the bucket */
  period: string;
  total: number;
  byType: Record<string, number>;
};

export type RecentPage = {
  id: number;
  title: string;
  type: string;
  created_at: string;
  updated_at: string | null;
};

export type History = {
  bucket: HistoryBucket;
  metric: HistoryMetric;
  /** all types that appear, ordered by total additions desc */
  types: string[];
  points: HistoryPoint[];
  /** running total aligned 1:1 with points */
  cumulative: number[];
  totalPages: number;
  datedPages: number;
  firstAt: string | null;
  lastAt: string | null;
  /** most-recently created pages */
  recent: RecentPage[];
  /** most-recently updated pages (edited after creation) */
  recentUpdated: RecentPage[];
};

// --- Content types present in the DB ---
export type TypeBreakdown = {
  type: string;
  count: number;
  /** a few example page titles, most-recent first */
  samples: string[];
};

export type TagCount = { tag: string; count: number };

export type ContentTypes = {
  totalPages: number;
  totalLinks: number;
  taggedPages: number;
  types: TypeBreakdown[];
  linkTypes: { link_type: string; count: number }[];
  tags: TagCount[];
};

// --- Health / status of the gbrain backend ---
export type HealthStatus = {
  /** overall: true only if the database is reachable */
  ok: boolean;
  /** ISO server timestamp when this check ran */
  checkedAt: string;
  db: {
    connected: boolean;
    /** round-trip time of the ping query, ms */
    latencyMs: number | null;
    /** the database's own clock, ISO */
    serverTime: string | null;
    /** Postgres version string */
    version: string | null;
    /** error message if the check failed */
    error: string | null;
  };
  data: {
    /** live (non-deleted) pages */
    activePages: number;
    deletedPages: number;
    /** freshness signals — most recent ingest / edit */
    lastCreatedAt: string | null;
    lastUpdatedAt: string | null;
  };
  /** pg connection-pool gauges */
  pool: {
    total: number;
    idle: number;
    waiting: number;
  };
};

// --- Indexation quality (how well the corpus is embedded, linked, dated) ---
export type IndexScorePart = {
  key: string;
  label: string;
  /** points awarded for this dimension */
  points: number;
  /** max points the dimension can contribute */
  max: number;
};

export type IndexHealth = {
  /** composite 0–100, sum of the parts */
  score: number;
  parts: IndexScorePart[];
  totalPages: number;
  /** % of pages with at least one embedded chunk */
  embeddedPct: number;
  /** pages that have chunks but none embedded yet */
  missingEmbeddings: number;
  /** pages chunked by an older chunker generation */
  staleEmbeddings: number;
  /** pages with no chunks at all — invisible to semantic search */
  pagesWithoutChunks: number;
  orphans: number;
  totalLinks: number;
  deadLinks: number;
  /** pages that have at least one timeline entry */
  timelinePages: number;
  /** latest contradiction probe, if one has run */
  contradictions: {
    flagged: number;
    queriesEvaluated: number;
    ranAt: string;
  } | null;
};

// --- Control-question retrieval eval ("Garry scoring") ---
// navigation -> graded on Hit@1 / Hit@3 (did retrieval surface the right page).
// evidence & decode -> graded on cite / rule (did the answer cite a real
// supporting source AND state the correct rule/diagnosis). Judging is
// reference-free: an LLM judge reads the retrieved pages + synthesized answer.
export type EvalCategory = "navigation" | "evidence" | "decode";

export type ControlQuestion = {
  id: number;
  category: EvalCategory;
  question: string;
};

/** A page that retrieval returned, with its 1-based rank. */
export type EvalRetrieved = { id: number; title: string; type: string; rank: number };

export type ControlQuestionResult = {
  id: number;
  category: EvalCategory;
  question: string;
  /** overall: navigation -> Hit@1; evidence/decode -> cite && rule */
  passed: boolean;
  // navigation axes (null for evidence/decode)
  hit1: boolean | null;
  hit3: boolean | null;
  /** rank (1-based) of the page the judge deemed correct, or null if none */
  answerRank: number | null;
  answerPageId: number | null;
  answerTitle: string | null;
  // evidence/decode axes (null for navigation)
  cite: boolean | null;
  rule: boolean | null;
  /** judge's one-line rationale */
  notes: string;
  /** top retrieved pages, for inspection */
  retrieved: EvalRetrieved[];
  /** set if grading this question threw */
  error?: string | null;
};

export type ControlEvalRun = {
  /** ISO timestamp the run started */
  ranAt: string;
  durationMs: number;
  judgeModel: string;
  /** the bar a navigation question must clear to pass: "hit1" or "hit3" */
  navPass: "hit1" | "hit3";
  /** number of questions that passed */
  score: number;
  /** number of questions evaluated */
  total: number;
  byCategory: { category: EvalCategory; passed: number; total: number }[];
  questions: ControlQuestionResult[];
};
