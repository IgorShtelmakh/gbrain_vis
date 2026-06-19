"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CallGraph, SymbolHit } from "@/lib/types";
import { typeColor } from "@/lib/colors";
import NavBar from "./NavBar";

const CallGraphView = dynamic(() => import("./CallGraphView"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 grid place-items-center text-slate-500 text-sm">
      Loading renderer…
    </div>
  ),
});

export default function CallGraphExplorer({
  initialSymbol,
}: {
  initialSymbol: string | null;
}) {
  const [input, setInput] = useState("");
  const [hits, setHits] = useState<SymbolHit[]>([]);
  const [showHits, setShowHits] = useState(false);

  const [center, setCenter] = useState<string | null>(initialSymbol);
  const [graph, setGraph] = useState<CallGraph | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [depth, setDepth] = useState(2);
  const [showExternal, setShowExternal] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [fitToken, setFitToken] = useState(0);

  const reqRef = useRef(0);

  // ---- symbol typeahead (debounced) ----
  useEffect(() => {
    const q = input.trim();
    const id = window.setTimeout(async () => {
      if (!q) {
        setHits([]);
        return;
      }
      try {
        const res = await fetch(`/api/callgraph/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setHits(data.symbols ?? []);
      } catch {
        setHits([]);
      }
    }, q ? 180 : 0);
    return () => window.clearTimeout(id);
  }, [input]);

  // ---- load the ego-graph for a symbol ----
  const loadGraph = useCallback(async (symbol: string, d: number) => {
    const req = ++reqRef.current;
    setLoading(true);
    setError(null);
    setCenter(symbol);
    setSelected(symbol);
    try {
      const res = await fetch(
        `/api/callgraph?symbol=${encodeURIComponent(symbol)}&depth=${d}`
      );
      const data: CallGraph & { error?: string } = await res.json();
      if (req !== reqRef.current) return;
      if (data.error) throw new Error(data.error);
      setGraph(data);
      setFitToken((t) => t + 1);
      window.history.replaceState(null, "", `/code?symbol=${encodeURIComponent(symbol)}`);
    } catch {
      if (req === reqRef.current) {
        setGraph(null);
        setError("Could not build the call graph for that symbol.");
      }
    } finally {
      if (req === reqRef.current) setLoading(false);
    }
  }, []);

  // Initial load (center is seeded from the URL) and reload whenever depth
  // changes. Deferred so we don't setState synchronously inside the effect.
  useEffect(() => {
    if (!center) return;
    const id = window.setTimeout(() => loadGraph(center, depth), 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depth]);

  const pick = (symbol: string) => {
    setInput("");
    setHits([]);
    setShowHits(false);
    loadGraph(symbol, depth);
  };

  // ---- side panel: selected node + its callers/callees ----
  const nodeBy = useMemo(
    () => new Map((graph?.nodes ?? []).map((n) => [n.symbol, n])),
    [graph]
  );
  const selNode = selected ? nodeBy.get(selected) : null;
  const callees = useMemo(
    () =>
      (graph?.edges ?? [])
        .filter((e) => e.from === selected)
        .map((e) => ({ node: nodeBy.get(e.to), kind: e.kind }))
        .filter((x) => x.node),
    [graph, selected, nodeBy]
  );
  const callers = useMemo(
    () =>
      (graph?.edges ?? [])
        .filter((e) => e.to === selected)
        .map((e) => ({ node: nodeBy.get(e.from), kind: e.kind }))
        .filter((x) => x.node),
    [graph, selected, nodeBy]
  );

  const counts = useMemo(() => {
    const ns = graph?.nodes ?? [];
    return {
      total: ns.length,
      internal: ns.filter((n) => !n.external).length,
      external: ns.filter((n) => n.external).length,
      edges: graph?.edges.length ?? 0,
    };
  }, [graph]);

  return (
    <div className="relative h-dvh w-dvw overflow-hidden bg-[#080b14]">
      {center && graph && (
        <CallGraphView
          center={center}
          nodes={graph.nodes}
          edges={graph.edges}
          selected={selected}
          showExternal={showExternal}
          fitToken={fitToken}
          onSelect={setSelected}
        />
      )}

      {/* header: nav + symbol search */}
      <header className="absolute top-0 inset-x-0 z-10 flex items-center gap-3 px-4 py-3 pointer-events-none">
        <div className="pointer-events-auto">
          <NavBar />
        </div>
        <div className="pointer-events-auto flex-1 max-w-xl relative">
          <div className="panel flex items-center gap-2 px-3 py-2 focus-within:ring-1 focus-within:ring-violet-500/50">
            <svg viewBox="0 0 20 20" fill="currentColor" className="size-4 text-slate-500 shrink-0">
              <path d="M3 4.5h14M3 10h14M3 15.5h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
            </svg>
            <input
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setShowHits(true);
              }}
              onFocus={() => setShowHits(true)}
              onBlur={() => setTimeout(() => setShowHits(false), 150)}
              placeholder="Find a function or class to map…"
              className="flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-600 outline-none"
            />
          </div>
          {showHits && hits.length > 0 && (
            <ul className="absolute mt-1 w-full panel max-h-80 overflow-y-auto py-1 z-20">
              {hits.map((h) => (
                <li key={h.symbol}>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(h.symbol)}
                    className="w-full text-left px-3 py-1.5 hover:bg-white/5 transition-colors"
                  >
                    <span className="flex items-center gap-2 text-sm">
                      <span
                        className="size-2 rounded-full shrink-0"
                        style={{ background: typeColor(h.pageType ?? "") }}
                      />
                      <span className="text-slate-200 truncate font-medium">{h.label}</span>
                      <span className="ml-auto text-[10px] text-slate-600 shrink-0">
                        {h.degree} edges
                      </span>
                    </span>
                    <span className="block text-[10px] text-slate-500 truncate pl-4">
                      {h.symbol}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </header>

      {/* empty / loading / error states */}
      {!center && (
        <div className="absolute inset-0 grid place-items-center px-6">
          <div className="text-center max-w-md">
            <div className="text-4xl mb-3">🕸️</div>
            <h1 className="text-lg font-semibold text-slate-200">Code call graph</h1>
            <p className="mt-2 text-sm text-slate-500">
              Search for a function or class above to see what it calls and what calls it,
              traced through the indexed codebase.
            </p>
          </div>
        </div>
      )}
      {loading && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 panel flex items-center gap-3 px-5 py-3">
          <span className="size-4 rounded-full border-2 border-violet-400 border-t-transparent animate-spin" />
          <span className="text-sm text-slate-300">Tracing calls…</span>
        </div>
      )}
      {error && !loading && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 panel px-4 py-2.5 text-sm text-rose-300">
          {error}
        </div>
      )}

      {/* legend + controls (bottom-left) */}
      {center && (
        <div className="absolute bottom-4 left-4 z-10 panel px-3 py-2.5 space-y-2 w-56">
          <div className="text-[10px] uppercase tracking-wider text-slate-600 font-semibold">
            Call graph
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex items-center gap-2">
              <span className="h-0.5 w-5 rounded" style={{ background: CALLS }} />
              <span className="text-slate-300">calls</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-0.5 w-5 rounded" style={{ background: REF }} />
              <span className="text-slate-300">references</span>
            </div>
          </div>
          <div className="pt-1 border-t border-white/5 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Depth</span>
              <div className="flex gap-1">
                {[1, 2, 3].map((d) => (
                  <button
                    key={d}
                    onClick={() => setDepth(d)}
                    className={`size-6 rounded-md text-xs font-medium transition-colors ${
                      depth === d
                        ? "bg-violet-500/25 text-violet-200"
                        : "text-slate-400 hover:bg-white/5"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center justify-between text-xs cursor-pointer">
              <span className="text-slate-400">
                Framework nodes
                <span className="text-slate-600"> ({counts.external})</span>
              </span>
              <input
                type="checkbox"
                checked={showExternal}
                onChange={(e) => setShowExternal(e.target.checked)}
                className="accent-violet-500"
              />
            </label>
          </div>
          <div className="pt-1 text-[10px] text-slate-600 border-t border-white/5">
            {counts.internal} internal · {counts.edges} edges
            {graph?.truncated && <span className="text-amber-500"> · capped</span>}
          </div>
        </div>
      )}

      {/* selected-node detail (right) */}
      {selNode && (
        <aside className="absolute top-16 bottom-4 right-4 z-10 w-[340px] max-w-[90vw] panel flex flex-col pointer-events-auto">
          <div className="p-4 pb-3 shrink-0 border-b border-white/5">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-100 leading-tight break-words">
                {selNode.label}
              </h2>
              {selNode.symbol === center && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 shrink-0">
                  center
                </span>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
              {selNode.external ? (
                <span className="px-1.5 py-0.5 rounded-full bg-white/5 text-slate-400">external</span>
              ) : (
                <span
                  className="px-1.5 py-0.5 rounded-full font-medium"
                  style={{
                    background: `${typeColor(selNode.pageType ?? "")}22`,
                    color: typeColor(selNode.pageType ?? ""),
                  }}
                >
                  {selNode.pageType}
                </span>
              )}
              <span className="text-slate-500">
                {selNode.inDegree} in · {selNode.outDegree} out
              </span>
            </div>
            {selNode.file && (
              <div className="mt-1.5 text-[11px] text-slate-500 break-all font-mono">
                {selNode.file}
              </div>
            )}
            <div className="mt-3 flex gap-2">
              {selNode.symbol !== center && (
                <button
                  onClick={() => loadGraph(selNode.symbol, depth)}
                  className="flex-1 rounded-lg bg-violet-500/15 hover:bg-violet-500/25 text-violet-300 text-xs font-medium py-1.5 transition-colors"
                >
                  Center here
                </button>
              )}
              {selNode.pageId != null && (
                <Link
                  href={`/page/${selNode.pageId}`}
                  className="flex-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-medium py-1.5 text-center transition-colors"
                >
                  Open page →
                </Link>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <RelationList title={`Calls (${callees.length})`} items={callees} onPick={setSelected} arrow="→" />
            <RelationList title={`Called by (${callers.length})`} items={callers} onPick={setSelected} arrow="←" />
          </div>
        </aside>
      )}
    </div>
  );
}

const CALLS = "#7dd3fc";
const REF = "#c084fc";

function RelationList({
  title,
  items,
  onPick,
  arrow,
}: {
  title: string;
  items: { node: { symbol: string; label: string; external: boolean; pageType: string | null } | undefined; kind: string }[];
  onPick: (symbol: string) => void;
  arrow: string;
}) {
  if (items.length === 0) {
    return (
      <div>
        <h3 className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5">
          {title}
        </h3>
        <p className="text-xs text-slate-600">none</p>
      </div>
    );
  }
  return (
    <div>
      <h3 className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5">
        {title}
      </h3>
      <ul className="space-y-0.5">
        {items.map(({ node, kind }, i) => (
          <li key={`${node!.symbol}-${i}`}>
            <button
              onClick={() => onPick(node!.symbol)}
              className="group w-full text-left rounded-lg px-2 py-1.5 hover:bg-white/5 transition-colors"
            >
              <span className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-600 shrink-0">{arrow}</span>
                <span
                  className="size-1.5 rounded-full shrink-0"
                  style={{ background: node!.external ? "#5b6b8c" : typeColor(node!.pageType ?? "") }}
                />
                <span className="text-slate-300 group-hover:text-white truncate">{node!.label}</span>
                <span
                  className="ml-auto text-[9px] shrink-0"
                  style={{ color: kind === "references" ? REF : CALLS }}
                >
                  {kind}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
