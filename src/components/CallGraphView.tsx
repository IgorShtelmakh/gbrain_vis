"use client";

import { useEffect, useRef, useState } from "react";
import type Graph from "graphology";
import type Sigma from "sigma";
import type FA2Layout from "graphology-layout-forceatlas2/worker";
import type { CallEdge, CallNode } from "@/lib/types";
import { typeColor } from "@/lib/colors";

// sigma touches WebGL globals at import time, so it must never load during SSR.
type GraphLibs = {
  Graph: typeof import("graphology").default;
  Sigma: typeof import("sigma").default;
  forceAtlas2: typeof import("graphology-layout-forceatlas2").default;
  FA2Layout: typeof import("graphology-layout-forceatlas2/worker").default;
  EdgeArrowProgram: typeof import("sigma/rendering").EdgeArrowProgram;
  EdgeRectangleProgram: typeof import("sigma/rendering").EdgeRectangleProgram;
};
let libsPromise: Promise<GraphLibs> | null = null;
function loadLibs(): Promise<GraphLibs> {
  if (!libsPromise) {
    libsPromise = Promise.all([
      import("graphology"),
      import("sigma"),
      import("graphology-layout-forceatlas2"),
      import("graphology-layout-forceatlas2/worker"),
      import("sigma/rendering"),
    ]).then(([g, s, fa2, w, r]) => ({
      Graph: g.default,
      Sigma: s.default,
      forceAtlas2: fa2.default,
      FA2Layout: w.default,
      EdgeArrowProgram: r.EdgeArrowProgram,
      EdgeRectangleProgram: r.EdgeRectangleProgram,
    }));
  }
  return libsPromise;
}

const EXTERNAL_COLOR = "#5b6b8c"; // muted slate for framework/external leaves
const DIM_NODE = "#252b42";
const DIM_EDGE = "#1a2036";
const CALLS_COLOR = "#7dd3fc"; // cyan — "calls"
const REF_COLOR = "#c084fc"; // violet — "references"
const CALLS_DIM = "#2c3b54";
const REF_DIM = "#3a2c54";

function nodeSize(n: CallNode, isCenter: boolean): number {
  if (isCenter) return 14;
  if (n.external) return 4.5;
  return Math.min(5 + Math.sqrt(n.inDegree + n.outDegree) * 1.4, 12);
}

type Props = {
  center: string;
  nodes: CallNode[];
  edges: CallEdge[];
  selected: string | null;
  /** when false, external (framework) symbols and their edges are hidden */
  showExternal: boolean;
  /** bump to refit the camera to the whole graph */
  fitToken: number;
  onSelect: (symbol: string) => void;
};

export default function CallGraphView({
  center,
  nodes,
  edges,
  selected,
  showExternal,
  fitToken,
  onSelect,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const fa2Ref = useRef<FA2Layout | null>(null);
  const fa2Timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hoverRef = useRef<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  const showExtRef = useRef(showExternal);
  const dragRef = useRef<string | null>(null);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  });

  const [libs, setLibs] = useState<GraphLibs | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadLibs().then((l) => !cancelled && setLibs(l));
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- mount sigma once ----
  useEffect(() => {
    if (!libs || !containerRef.current) return;
    const { Graph, Sigma, EdgeArrowProgram, EdgeRectangleProgram } = libs;
    const graph = new Graph({ multi: true, type: "directed" });
    graphRef.current = graph;
    const sigma = new Sigma(graph, containerRef.current!, {
      labelColor: { color: "#c7d0e8" },
      labelSize: 11,
      labelFont: "var(--font-geist-sans), system-ui, sans-serif",
      labelWeight: "500",
      labelRenderedSizeThreshold: 4,
      labelDensity: 0.9,
      minCameraRatio: 0.05,
      maxCameraRatio: 4,
      zIndex: true,
      allowInvalidContainer: true,
      defaultEdgeType: "arrow",
      edgeProgramClasses: { arrow: EdgeArrowProgram, line: EdgeRectangleProgram },
      nodeReducer: (node, data) => {
        const res: Record<string, unknown> = { ...data };
        if (!showExtRef.current && data.external) {
          res.hidden = true;
          return res;
        }
        const g = graphRef.current!;
        const hovered = hoverRef.current;
        const active =
          node === selectedRef.current ||
          node === hovered ||
          (hovered ? g.hasEdge(node, hovered) || g.hasEdge(hovered, node) : false);
        if (hovered && !active) {
          res.color = DIM_NODE;
          res.label = "";
          res.zIndex = 0;
        } else {
          res.zIndex = 1;
        }
        if (node === center) {
          res.forceLabel = true;
          res.zIndex = 2;
        }
        if (node === selectedRef.current) {
          res.highlighted = true;
          res.forceLabel = true;
          res.zIndex = 3;
        }
        return res;
      },
      edgeReducer: (edge, data) => {
        const res: Record<string, unknown> = { ...data };
        const g = graphRef.current!;
        const [s, t] = g.extremities(edge);
        if (
          !showExtRef.current &&
          (g.getNodeAttribute(s, "external") || g.getNodeAttribute(t, "external"))
        ) {
          res.hidden = true;
          return res;
        }
        const isRef = data.kind === "references";
        const hovered = hoverRef.current;
        const touching = hovered && (s === hovered || t === hovered);
        if (hovered && !touching) {
          res.color = DIM_EDGE;
        } else {
          res.color = isRef ? REF_COLOR : CALLS_COLOR;
          if (touching) res.size = 2.2;
        }
        return res;
      },
    });
    sigmaRef.current = sigma;

    sigma.on("clickNode", ({ node }) => onSelectRef.current(node));
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

    // dragging
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
  }, [libs, center]);

  // ---- sync data ----
  useEffect(() => {
    const graph = graphRef.current;
    const sigma = sigmaRef.current;
    if (!libs || !graph || !sigma) return;

    graph.clear();
    const R = Math.sqrt(Math.max(nodes.length, 1)) * 16;
    for (const n of nodes) {
      const isCenter = n.symbol === center;
      const angle = Math.random() * Math.PI * 2;
      const dist = isCenter ? 0 : Math.sqrt(Math.random()) * R;
      graph.addNode(n.symbol, {
        label: n.label,
        external: n.external,
        nodeType: n.pageType ?? "external",
        color: isCenter ? "#fbbf24" : n.external ? EXTERNAL_COLOR : typeColor(n.pageType ?? ""),
        size: nodeSize(n, isCenter),
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
      });
    }
    let i = 0;
    for (const e of edges) {
      if (!graph.hasNode(e.from) || !graph.hasNode(e.to) || e.from === e.to) continue;
      graph.addEdgeWithKey(`e${i++}`, e.from, e.to, {
        kind: e.kind,
        size: e.kind === "references" ? 1 : 1.4,
        color: e.kind === "references" ? REF_DIM : CALLS_DIM,
        type: "arrow",
      });
    }

    sigma.setCustomBBox(null);
    if (fa2Timer.current) clearTimeout(fa2Timer.current);
    fa2Ref.current?.kill();
    if (graph.order > 1) {
      const settings = libs.forceAtlas2.inferSettings(graph);
      const fa2 = new libs.FA2Layout(graph, { settings: { ...settings, slowDown: 6 } });
      fa2Ref.current = fa2;
      fa2.start();
      fa2Timer.current = setTimeout(() => fa2.stop(), 3500);
    }
  }, [libs, nodes, edges, center]);

  // ---- reducer inputs ----
  useEffect(() => {
    selectedRef.current = selected;
    showExtRef.current = showExternal;
    sigmaRef.current?.refresh({ skipIndexation: true });
  }, [selected, showExternal]);

  // ---- fit camera ----
  useEffect(() => {
    const sigma = sigmaRef.current;
    if (!sigma) return;
    const fit = () => {
      sigma.setCustomBBox(null);
      sigma.getCamera().animate({ x: 0.5, y: 0.5, ratio: 1.1 }, { duration: 500 });
    };
    const t1 = setTimeout(fit, 600);
    const t2 = setTimeout(fit, 3700);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [fitToken]);

  return <div ref={containerRef} className="absolute inset-0" />;
}
