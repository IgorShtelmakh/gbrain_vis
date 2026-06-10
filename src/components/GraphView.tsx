"use client";

import { useEffect, useRef, useState } from "react";
import type Graph from "graphology";
import type Sigma from "sigma";
import type FA2Layout from "graphology-layout-forceatlas2/worker";
import type { GEdge, GNode } from "@/lib/types";

// sigma touches WebGL globals at import time, so it must never load during SSR
type GraphLibs = {
  Graph: typeof import("graphology").default;
  Sigma: typeof import("sigma").default;
  forceAtlas2: typeof import("graphology-layout-forceatlas2").default;
  FA2Layout: typeof import("graphology-layout-forceatlas2/worker").default;
};
let libsPromise: Promise<GraphLibs> | null = null;
function loadLibs(): Promise<GraphLibs> {
  if (!libsPromise) {
    libsPromise = Promise.all([
      import("graphology"),
      import("sigma"),
      import("graphology-layout-forceatlas2"),
      import("graphology-layout-forceatlas2/worker"),
    ]).then(([g, s, fa2, w]) => ({
      Graph: g.default,
      Sigma: s.default,
      forceAtlas2: fa2.default,
      FA2Layout: w.default,
    }));
  }
  return libsPromise;
}

export const TYPE_COLORS: Record<string, string> = {
  concept: "#8b7cf6",
  "php-source": "#f59e0b",
  person: "#34d399",
  company: "#38bdf8",
  note: "#f472b6",
};
const FALLBACK_COLORS = ["#22d3ee", "#fb7185", "#a3e635", "#fbbf24", "#c084fc"];
const colorCache = new Map<string, string>();

export function typeColor(type: string): string {
  if (TYPE_COLORS[type]) return TYPE_COLORS[type];
  if (!colorCache.has(type)) {
    colorCache.set(type, FALLBACK_COLORS[colorCache.size % FALLBACK_COLORS.length]);
  }
  return colorCache.get(type)!;
}

const DIM_NODE = "#252b42";
const DIM_EDGE = "#1a2036";
const EDGE_COLOR = "#2c3554";
const EDGE_ACTIVE = "#7dd3fc";

function nodeSize(degree: number): number {
  return Math.min(3 + Math.sqrt(degree) * 0.9, 24);
}

type Props = {
  nodes: GNode[];
  edges: GEdge[];
  /** when set, non-highlighted nodes are dimmed */
  highlightIds: number[] | null;
  selectedId: number | null;
  /** bump to re-trigger camera focus on selectedId */
  focusToken: number;
  hiddenTypes: string[];
  onNodeClick: (id: number) => void;
  onNodeDoubleClick: (id: number) => void;
  onBackgroundClick: () => void;
};

export default function GraphView({
  nodes,
  edges,
  highlightIds,
  selectedId,
  focusToken,
  hiddenTypes,
  onNodeClick,
  onNodeDoubleClick,
  onBackgroundClick,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const fa2Ref = useRef<FA2Layout | null>(null);
  const fa2Timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // mutable state read by reducers (avoids re-creating sigma on every change)
  const hoverRef = useRef<string | null>(null);
  const highlightRef = useRef<Set<string> | null>(null);
  const selectedRef = useRef<string | null>(null);
  const hiddenRef = useRef<Set<string>>(new Set());
  const dragRef = useRef<string | null>(null);

  const cbRef = useRef({ onNodeClick, onNodeDoubleClick, onBackgroundClick });
  useEffect(() => {
    cbRef.current = { onNodeClick, onNodeDoubleClick, onBackgroundClick };
  });

  const [libs, setLibs] = useState<GraphLibs | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadLibs().then((l) => !cancelled && setLibs(l));
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- mount: create graph + sigma once libs are ready ----
  useEffect(() => {
    if (!libs || !containerRef.current) return;
    const { Graph, Sigma } = libs;
    const graph = new Graph({ multi: false, type: "undirected" });
    graphRef.current = graph;
    const sigma = new Sigma(graph, containerRef.current!, {
      labelColor: { color: "#c7d0e8" },
      labelSize: 11,
      labelFont: "var(--font-geist-sans), system-ui, sans-serif",
      labelWeight: "500",
      labelRenderedSizeThreshold: 7,
      labelDensity: 0.8,
      defaultEdgeColor: EDGE_COLOR,
      minCameraRatio: 0.02,
      maxCameraRatio: 4,
      zIndex: true,
      allowInvalidContainer: true,
      nodeReducer: (node, data) => {
        const res: Record<string, unknown> = { ...data };
        if (hiddenRef.current.has(data.nodeType)) {
          res.hidden = true;
          return res;
        }
        const hovered = hoverRef.current;
        const hl = highlightRef.current;
        const g = graphRef.current!;
        const active =
          node === selectedRef.current ||
          node === hovered ||
          (hovered ? g.hasEdge(node, hovered) || g.hasEdge(hovered, node) : false);

        if (hovered && !active) {
          res.color = DIM_NODE;
          res.label = "";
          res.zIndex = 0;
        } else if (hl && !hl.has(node) && !active) {
          res.color = DIM_NODE;
          res.label = "";
          res.zIndex = 0;
        } else {
          res.zIndex = 1;
        }
        if (hl?.has(node)) {
          res.zIndex = 2;
          res.forceLabel = true;
        }
        if (node === selectedRef.current) {
          res.highlighted = true;
          res.size = (data.size as number) + 2;
          res.zIndex = 3;
        }
        return res;
      },
      edgeReducer: (edge, data) => {
        const res: Record<string, unknown> = { ...data };
        const g = graphRef.current!;
        const [s, t] = g.extremities(edge);
        if (hiddenRef.current.has(g.getNodeAttribute(s, "nodeType")) ||
            hiddenRef.current.has(g.getNodeAttribute(t, "nodeType"))) {
          res.hidden = true;
          return res;
        }
        const hovered = hoverRef.current;
        const hl = highlightRef.current;
        if (hovered) {
          if (s === hovered || t === hovered) {
            res.color = EDGE_ACTIVE;
            res.size = 1.6;
          } else {
            res.color = DIM_EDGE;
          }
        } else if (hl) {
          if (hl.has(s) && hl.has(t)) {
            res.color = EDGE_ACTIVE;
            res.size = 1.2;
          } else if (hl.has(s) || hl.has(t)) {
            res.color = "#3d4a75";
          } else {
            res.color = DIM_EDGE;
          }
        }
        return res;
      },
    });
    sigmaRef.current = sigma;

    sigma.on("clickNode", ({ node }) => cbRef.current.onNodeClick(Number(node)));
    sigma.on("doubleClickNode", ({ node, event }) => {
      event.preventSigmaDefault();
      cbRef.current.onNodeDoubleClick(Number(node));
    });
    sigma.on("clickStage", () => cbRef.current.onBackgroundClick());
    sigma.on("enterNode", ({ node }) => {
      hoverRef.current = node;
      containerRef.current!.style.cursor = "pointer";
      sigma.refresh({ skipIndexation: true });
    });
    sigma.on("leaveNode", () => {
      hoverRef.current = null;
      containerRef.current!.style.cursor = "default";
      sigma.refresh({ skipIndexation: true });
    });

    // node dragging
    sigma.on("downNode", ({ node }) => {
      dragRef.current = node;
      graph.setNodeAttribute(node, "fixed", true);
      if (!sigma.getCustomBBox()) sigma.setCustomBBox(sigma.getBBox());
    });
    sigma.getMouseCaptor().on("mousemovebody", (e) => {
      const node = dragRef.current;
      if (!node) return;
      const pos = sigma.viewportToGraph(e);
      graph.setNodeAttribute(node, "x", pos.x);
      graph.setNodeAttribute(node, "y", pos.y);
      e.preventSigmaDefault();
      e.original.preventDefault();
      e.original.stopPropagation();
    });
    sigma.getMouseCaptor().on("mouseup", () => {
      if (dragRef.current) graph.removeNodeAttribute(dragRef.current, "fixed");
      dragRef.current = null;
    });

    return () => {
      if (fa2Timer.current) clearTimeout(fa2Timer.current);
      fa2Ref.current?.kill();
      fa2Ref.current = null;
      sigma.kill();
      sigmaRef.current = null;
      graphRef.current = null;
    };
  }, [libs]);

  // ---- sync data into the graph ----
  useEffect(() => {
    const graph = graphRef.current;
    const sigma = sigmaRef.current;
    if (!libs || !graph || !sigma) return;

    const wanted = new Set(nodes.map((n) => String(n.id)));
    let changed = false;

    // drop nodes that are no longer present
    for (const node of graph.nodes()) {
      if (!wanted.has(node)) {
        graph.dropNode(node);
        changed = true;
      }
    }

    // add new nodes
    const isEmptyStart = graph.order === 0;
    const R = Math.sqrt(nodes.length) * 14;
    for (const n of nodes) {
      const key = String(n.id);
      if (graph.hasNode(key)) continue;
      changed = true;
      let x: number, y: number;
      const anchorKey = n.anchor != null ? String(n.anchor) : null;
      if (!isEmptyStart && anchorKey && graph.hasNode(anchorKey)) {
        // place expanded nodes in a small ring around their anchor
        const ax = graph.getNodeAttribute(anchorKey, "x") as number;
        const ay = graph.getNodeAttribute(anchorKey, "y") as number;
        const angle = Math.random() * Math.PI * 2;
        const dist = 18 + Math.random() * 22;
        x = ax + Math.cos(angle) * dist;
        y = ay + Math.sin(angle) * dist;
      } else {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.sqrt(Math.random()) * R;
        x = Math.cos(angle) * dist;
        y = Math.sin(angle) * dist;
      }
      graph.addNode(key, {
        label: n.title,
        nodeType: n.type,
        degree: n.degree,
        color: typeColor(n.type),
        size: nodeSize(n.degree),
        x,
        y,
      });
    }

    // edges
    const wantedEdges = new Set<string>();
    for (const e of edges) {
      const s = String(e.source);
      const t = String(e.target);
      if (!graph.hasNode(s) || !graph.hasNode(t) || s === t) continue;
      const key = s < t ? `${s}|${t}` : `${t}|${s}`;
      if (wantedEdges.has(key)) continue;
      wantedEdges.add(key);
      if (!graph.hasEdge(s, t)) {
        graph.addEdge(s, t, { linkType: e.link_type, size: 0.7 });
        changed = true;
      }
    }
    for (const edge of graph.edges()) {
      const [s, t] = graph.extremities(edge);
      const key = s < t ? `${s}|${t}` : `${t}|${s}`;
      if (!wantedEdges.has(key)) {
        graph.dropEdge(edge);
        changed = true;
      }
    }

    if (!changed) return;
    sigma.setCustomBBox(null);

    // (re)run force layout for a few seconds, then settle
    if (fa2Timer.current) clearTimeout(fa2Timer.current);
    fa2Ref.current?.kill();
    if (graph.order > 1) {
      const settings = libs.forceAtlas2.inferSettings(graph);
      const fa2 = new libs.FA2Layout(graph, {
        settings: { ...settings, slowDown: 8 },
      });
      fa2Ref.current = fa2;
      fa2.start();
      fa2Timer.current = setTimeout(() => fa2.stop(), isEmptyStart ? 5000 : 2500);
    }
  }, [libs, nodes, edges]);

  // ---- reducer inputs ----
  useEffect(() => {
    highlightRef.current = highlightIds ? new Set(highlightIds.map(String)) : null;
    selectedRef.current = selectedId != null ? String(selectedId) : null;
    hiddenRef.current = new Set(hiddenTypes);
    sigmaRef.current?.refresh({ skipIndexation: true });
  }, [highlightIds, selectedId, hiddenTypes]);

  // ---- camera focus ----
  useEffect(() => {
    if (focusToken === 0 || selectedId == null) return;
    const sigma = sigmaRef.current;
    const graph = graphRef.current;
    if (!sigma || !graph) return;
    const key = String(selectedId);
    if (!graph.hasNode(key)) return;
    const flyTo = () => {
      if (!graph.hasNode(key)) return;
      const pos = sigma.getNodeDisplayData(key);
      if (!pos) return;
      sigma.getCamera().animate(
        { x: pos.x, y: pos.y, ratio: 0.35 },
        { duration: 700, easing: "cubicInOut" }
      );
    };
    // first pass once the node exists, second pass after the force layout settles
    const t1 = setTimeout(flyTo, 400);
    const t2 = setTimeout(flyTo, 2900);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [focusToken, selectedId]);

  return <div ref={containerRef} className="absolute inset-0" />;
}
