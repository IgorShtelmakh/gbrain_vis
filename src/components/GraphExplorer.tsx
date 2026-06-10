"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AskResponse, GEdge, GNode, SearchResult, Stats } from "@/lib/types";
import { typeColor } from "./GraphView";
import NodePanel from "./NodePanel";
import SearchPanel from "./SearchPanel";

const GraphView = dynamic(() => import("./GraphView"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 grid place-items-center text-slate-500 text-sm">
      Loading renderer…
    </div>
  ),
});

type Mode = { kind: "overview" } | { kind: "query"; query: string };

export default function GraphExplorer() {
  const [nodes, setNodes] = useState<GNode[]>([]);
  const [edges, setEdges] = useState<GEdge[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: "overview" });

  const [input, setInput] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [highlightIds, setHighlightIds] = useState<number[] | null>(null);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [focusToken, setFocusToken] = useState(0);
  const [hiddenTypes, setHiddenTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const nodesRef = useRef(nodes);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  const mergeSubgraph = useCallback((sub: { nodes: GNode[]; edges: GEdge[] }) => {
    setNodes((prev) => {
      const have = new Set(prev.map((n) => n.id));
      return [...prev, ...sub.nodes.filter((n) => !have.has(n.id))];
    });
    setEdges((prev) => {
      const have = new Set(prev.map((e) => `${e.source}|${e.target}`));
      return [
        ...prev,
        ...sub.edges.filter(
          (e) => !have.has(`${e.source}|${e.target}`) && !have.has(`${e.target}|${e.source}`)
        ),
      ];
    });
  }, []);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/graph/overview?limit=400");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setNodes(data.nodes);
      setEdges(data.edges);
      setMode({ kind: "overview" });
      setResults(null);
      setAnswer(null);
      setHighlightIds(null);
      setSelectedId(null);
    } catch {
      setError("Could not reach the gbrain database.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      loadOverview();
      fetch("/api/stats")
        .then((r) => r.json())
        .then((s) => !s.error && setStats(s))
        .catch(() => {});
    }, 0);
    return () => window.clearTimeout(id);
  }, [loadOverview]);

  const ask = useCallback(async (question: string) => {
    const q = question.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data: AskResponse & { error?: string } = await res.json();
      if (data.error) throw new Error(data.error);
      setNodes(data.subgraph.nodes);
      setEdges(data.subgraph.edges);
      setResults(data.results);
      setAnswer(data.answer);
      setHighlightIds(data.results.map((r) => r.id));
      setMode({ kind: "query", query: q });
      if (data.results.length > 0) {
        setSelectedId(data.results[0].id);
        setFocusToken((t) => t + 1);
      } else {
        setSelectedId(null);
      }
    } catch {
      setError("Search failed — try rephrasing.");
    } finally {
      setLoading(false);
    }
  }, []);

  const expandNode = useCallback(
    async (id: number) => {
      try {
        const res = await fetch(`/api/nodes/${id}/neighbors?limit=60`);
        const data = await res.json();
        if (!data.error) mergeSubgraph(data);
      } catch {
        /* ignore */
      }
    },
    [mergeSubgraph]
  );

  const selectNode = useCallback(
    (id: number, focus = false) => {
      setSelectedId(id);
      if (focus) setFocusToken((t) => t + 1);
      // if the node isn't in the current graph (e.g. clicked in connections list), pull it in
      if (!nodesRef.current.some((n) => n.id === id)) {
        expandNode(id).then(() => setFocusToken((t) => t + 1));
      }
    },
    [expandNode]
  );

  const toggleType = useCallback((type: string) => {
    setHiddenTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  }, []);

  const visibleCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of nodes) counts.set(n.type, (counts.get(n.type) ?? 0) + 1);
    return counts;
  }, [nodes]);

  return (
    <div className="relative h-dvh w-dvw overflow-hidden bg-[#080b14]">
      {/* graph canvas */}
      <GraphView
        nodes={nodes}
        edges={edges}
        highlightIds={highlightIds}
        selectedId={selectedId}
        focusToken={focusToken}
        hiddenTypes={hiddenTypes}
        onNodeClick={(id) => selectNode(id)}
        onNodeDoubleClick={(id) => {
          selectNode(id);
          expandNode(id);
        }}
        onBackgroundClick={() => setSelectedId(null)}
      />

      {/* header */}
      <header className="absolute top-0 inset-x-0 z-10 flex items-center gap-3 px-4 py-3 pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-2 panel px-3 py-2">
          <span className="text-lg leading-none">🧠</span>
          <span className="text-sm font-semibold text-slate-100 tracking-tight">
            gbrain<span className="text-violet-400">·</span>explorer
          </span>
        </div>

        <form
          className="pointer-events-auto flex-1 max-w-xl"
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
        >
          <div className="panel flex items-center gap-2 px-3 py-2 focus-within:ring-1 focus-within:ring-violet-500/50">
            <svg viewBox="0 0 20 20" fill="currentColor" className="size-4 text-slate-500 shrink-0">
              <path
                fillRule="evenodd"
                d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.45 4.39l3.08 3.08a.75.75 0 1 1-1.06 1.06l-3.08-3.08A7 7 0 0 1 2 9Z"
                clipRule="evenodd"
              />
            </svg>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask the brain anything… (Enter to search)"
              className="flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-600 outline-none"
            />
            {input && (
              <button
                type="submit"
                className="text-xs font-medium text-violet-300 bg-violet-500/15 hover:bg-violet-500/25 rounded-md px-2.5 py-1 transition-colors"
              >
                Ask
              </button>
            )}
          </div>
        </form>

        {mode.kind === "query" && (
          <button
            onClick={loadOverview}
            className="pointer-events-auto panel px-3 py-2 text-xs font-medium text-slate-300 hover:text-white transition-colors"
          >
            ← Overview
          </button>
        )}

        <div className="pointer-events-auto ml-auto panel px-3 py-2 text-[11px] text-slate-500 hidden md:block">
          {nodes.length.toLocaleString()} nodes · {edges.length.toLocaleString()} edges
          {stats && (
            <span className="text-slate-600">
              {" "}
              / {stats.totalPages.toLocaleString()} · {stats.totalLinks.toLocaleString()} total
            </span>
          )}
        </div>
      </header>

      {/* legend */}
      <div className="absolute bottom-4 left-4 z-10 panel px-3 py-2.5 space-y-1.5">
        <div className="text-[10px] uppercase tracking-wider text-slate-600 font-semibold">
          Node types
        </div>
        {[...visibleCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([type, count]) => {
            const hidden = hiddenTypes.includes(type);
            return (
              <button
                key={type}
                onClick={() => toggleType(type)}
                className={`flex w-full items-center gap-2 text-xs transition-opacity ${
                  hidden ? "opacity-30" : "opacity-100"
                }`}
              >
                <span className="size-2.5 rounded-full" style={{ background: typeColor(type) }} />
                <span className="text-slate-300">{type}</span>
                <span className="ml-auto text-slate-600 tabular-nums pl-3">{count}</span>
              </button>
            );
          })}
        <div className="pt-1 text-[10px] text-slate-600 border-t border-white/5">
          click = inspect · 2×click = expand · drag = move
        </div>
      </div>

      {/* right column: results + node detail */}
      <aside className="absolute top-16 bottom-4 right-4 z-10 w-[360px] max-w-[90vw] flex flex-col gap-3 pointer-events-none [&>*]:pointer-events-auto">
        {results && mode.kind === "query" && (
          <SearchPanel
            query={mode.query}
            results={results}
            answer={answer}
            selectedId={selectedId}
            onSelect={(id) => selectNode(id, true)}
            onClose={() => {
              setResults(null);
              setHighlightIds(null);
            }}
          />
        )}
        {selectedId != null && (
          <NodePanel
            nodeId={selectedId}
            onClose={() => setSelectedId(null)}
            onExpand={expandNode}
            onNavigate={(id) => selectNode(id, true)}
          />
        )}
      </aside>

      {/* loading / error overlays */}
      {loading && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-[#080b14]/60 backdrop-blur-[2px]">
          <div className="panel flex items-center gap-3 px-5 py-3">
            <span className="size-4 rounded-full border-2 border-violet-400 border-t-transparent animate-spin" />
            <span className="text-sm text-slate-300">
              {mode.kind === "query" || input ? "Searching the brain…" : "Mapping the brain…"}
            </span>
          </div>
        </div>
      )}
      {error && !loading && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 panel px-4 py-2.5 text-sm text-rose-300">
          {error}{" "}
          <button onClick={loadOverview} className="underline text-rose-200 ml-1">
            retry
          </button>
        </div>
      )}
    </div>
  );
}
