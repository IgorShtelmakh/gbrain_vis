"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { NodeDetail } from "@/lib/types";
import { typeColor } from "./GraphView";

type Props = {
  nodeId: number;
  onClose: () => void;
  onExpand: (id: number) => void;
  onNavigate: (id: number) => void;
};

export default function NodePanel({ nodeId, onClose, onExpand, onNavigate }: Props) {
  const [detail, setDetail] = useState<NodeDetail | null>(null);
  const [fetchedFor, setFetchedFor] = useState<number | null>(null);
  const loading = fetchedFor !== nodeId;
  const view = loading ? null : detail;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/nodes/${nodeId}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) {
          setDetail(d.error ? null : d);
          setFetchedFor(nodeId);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDetail(null);
          setFetchedFor(nodeId);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [nodeId]);

  return (
    <div className="panel flex flex-col min-h-0 flex-1">
      <div className="flex items-start justify-between gap-2 p-4 pb-2 shrink-0">
        {!view ? (
          <div className="h-6 w-48 rounded bg-white/5 animate-pulse" />
        ) : (
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-100 leading-tight truncate">
              {view.title}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
              <span
                className="px-1.5 py-0.5 rounded-full font-medium"
                style={{ background: `${typeColor(view.type)}22`, color: typeColor(view.type) }}
              >
                {view.type}
              </span>
              <span className="text-slate-500">{view.degree} connections</span>
            </div>
          </div>
        )}
        <button
          onClick={onClose}
          className="text-slate-500 hover:text-slate-200 transition-colors text-lg leading-none px-1"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {view && (
        <div className="px-4 pb-2 shrink-0">
          <button
            onClick={() => onExpand(view.id)}
            className="w-full rounded-lg bg-violet-500/15 hover:bg-violet-500/25 text-violet-300 text-xs font-medium py-1.5 transition-colors"
          >
            ⊕ Expand neighbors into graph
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 pb-4 min-h-0 space-y-4">
        {view?.tags && view.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {view.tags.map((t) => (
              <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-slate-400">
                #{t}
              </span>
            ))}
          </div>
        )}

        {view?.compiled_truth && (
          <div className="prose-dark text-[13px] leading-relaxed text-slate-300">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {view.compiled_truth.slice(0, 12000)}
            </ReactMarkdown>
          </div>
        )}

        {view && view.connections.length > 0 && (
          <div>
            <h3 className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-2">
              Connections
            </h3>
            <ul className="space-y-1">
              {view.connections.map((c, i) => (
                <li key={`${c.id}-${i}`}>
                  <button
                    onClick={() => onNavigate(c.id)}
                    className="group w-full text-left rounded-lg px-2 py-1.5 hover:bg-white/5 transition-colors"
                    title={c.context}
                  >
                    <span className="flex items-center gap-1.5 text-xs">
                      <span
                        className="size-1.5 rounded-full shrink-0"
                        style={{ background: typeColor(c.type) }}
                      />
                      <span className="text-slate-300 group-hover:text-white truncate">
                        {c.title}
                      </span>
                      <span className="ml-auto text-[10px] text-slate-600 shrink-0">
                        {c.dir === "out" ? "→" : "←"} {c.link_type}
                      </span>
                    </span>
                    {c.context && (
                      <span className="block text-[10px] text-slate-500 truncate pl-3 mt-0.5">
                        {c.context}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
