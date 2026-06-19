"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { SearchResult } from "@/lib/types";
import { typeColor } from "./GraphView";

type Props = {
  query: string;
  results: SearchResult[] | null;
  answer: string | null;
  /** phase 1 — matches + subgraph still loading */
  matchesLoading: boolean;
  /** phase 2 — synthesized answer still loading */
  answerLoading: boolean;
  selectedId: number | null;
  onSelect: (id: number) => void;
  onClose: () => void;
};

/** A shimmering placeholder bar. */
function Bar({ className = "" }: { className?: string }) {
  return <span className={`block rounded bg-white/10 animate-pulse ${className}`} />;
}

export default function SearchPanel({
  query,
  results,
  answer,
  matchesLoading,
  answerLoading,
  selectedId,
  onSelect,
  onClose,
}: Props) {
  const count = results?.length ?? 0;
  return (
    <div className="panel flex flex-col min-h-0 max-h-[55%]">
      <div className="flex items-center justify-between p-4 pb-2 shrink-0">
        <h2 className="text-xs uppercase tracking-wider text-slate-500 font-semibold truncate pr-2">
          {matchesLoading ? "Searching" : `${count} ${count === 1 ? "match" : "matches"}`} — “{query}”
        </h2>
        <button
          onClick={onClose}
          className="text-slate-500 hover:text-slate-200 transition-colors text-lg leading-none px-1 shrink-0"
          aria-label="Close results"
        >
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-3 min-h-0">
        {/* AI response */}
        <div className="mb-3 rounded-xl bg-cyan-500/8 border border-cyan-500/20 p-3">
          <div className="text-[10px] uppercase tracking-wider text-cyan-400 font-semibold mb-1.5">
            AI response
          </div>
          {answerLoading ? (
            <div className="space-y-1.5" aria-label="Synthesizing answer">
              <Bar className="h-2.5 w-[92%]" />
              <Bar className="h-2.5 w-full" />
              <Bar className="h-2.5 w-[85%]" />
              <Bar className="h-2.5 w-[60%]" />
            </div>
          ) : answer ? (
            <div className="prose-dark text-[13px] leading-relaxed text-slate-200">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{answer}</ReactMarkdown>
            </div>
          ) : (
            <div className="text-[12px] text-slate-500">
              No answer could be synthesized for this query.
            </div>
          )}
        </div>

        {/* Gbrain matches */}
        <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5 px-0.5">
          Gbrain matches
        </div>
        {matchesLoading ? (
          <ul className="space-y-1" aria-label="Loading matches">
            {Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className="rounded-lg px-2.5 py-2">
                <span className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-white/10 shrink-0" />
                  <Bar className="h-3 w-1/2" />
                </span>
                <Bar className="h-2 w-4/5 mt-2 ml-6" />
              </li>
            ))}
          </ul>
        ) : count === 0 ? (
          <div className="text-[12px] text-slate-500 px-2.5 py-2">No matches found.</div>
        ) : (
          <ul className="space-y-1">
            {(results ?? []).map((r, i) => (
              <li key={r.id}>
                <button
                  onClick={() => onSelect(r.id)}
                  className={`w-full text-left rounded-lg px-2.5 py-2 transition-colors ${
                    selectedId === r.id ? "bg-violet-500/15" : "hover:bg-white/5"
                  }`}
                >
                  <span className="flex items-center gap-2 text-[13px]">
                    <span className="text-[10px] text-slate-600 w-4 shrink-0">{i + 1}</span>
                    <span
                      className="size-2 rounded-full shrink-0"
                      style={{ background: typeColor(r.type) }}
                    />
                    <span className="text-slate-200 truncate font-medium">{r.title}</span>
                    <span className="ml-auto text-[10px] text-slate-600 shrink-0">
                      {r.degree} links
                    </span>
                  </span>
                  {r.snippet && (
                    <span
                      className="block text-[11px] text-slate-500 mt-1 pl-6 line-clamp-2 [&_b]:text-cyan-300 [&_b]:font-medium"
                      dangerouslySetInnerHTML={{
                        __html: r.snippet
                          .replace(/&/g, "&amp;")
                          .replace(/</g, "&lt;")
                          .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>"),
                      }}
                    />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
