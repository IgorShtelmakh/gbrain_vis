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

export type AskResponse = {
  results: SearchResult[];
  subgraph: SubGraph;
  answer: string | null;
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
