"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AnswerResponse, SearchResult } from "@/lib/types";
import { typeColor } from "@/lib/colors";

/** Render a ts_headline snippet: escape, then turn **..** into highlighted bold. */
function snippetHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
}

/** A shimmering placeholder bar. */
function Bar({ className = "" }: { className?: string }) {
  return <span className={`block rounded bg-white/10 animate-pulse ${className}`} />;
}

export default function SearchClient({ initialQuery }: { initialQuery: string }) {
  const [input, setInput] = useState(initialQuery);
  // the query currently being shown (empty until the first search runs)
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [answerLoading, setAnswerLoading] = useState(false);
  const [activeType, setActiveType] = useState<string | undefined>(undefined);
  // bumped on each search so a stale in-flight response can't overwrite a newer one
  const runRef = useRef(0);

  const runSearch = useCallback(async (raw: string) => {
    const q = raw.trim();
    if (!q) return;
    const run = ++runRef.current;
    // Open both sections in a loading state immediately — the page never blocks.
    setQuery(q);
    setActiveType(undefined);
    setResults(null);
    setAnswer(null);
    setMatchesLoading(true);
    setAnswerLoading(true);
    // keep the URL shareable without a full navigation/reload
    window.history.replaceState(null, "", `/search?q=${encodeURIComponent(q)}`);

    let matches: SearchResult[] = [];
    try {
      // phase 1 — matches (fast)
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=50`);
      const data: { results?: SearchResult[]; error?: string } = await res.json();
      if (run !== runRef.current) return;
      matches = data.error ? [] : data.results ?? [];
      setResults(matches);
    } catch {
      if (run !== runRef.current) return;
      setResults([]);
    } finally {
      if (run === runRef.current) setMatchesLoading(false);
    }

    // phase 2 — synthesized answer (slow LLM call); nothing to synthesize with no matches
    if (matches.length === 0) {
      if (run === runRef.current) setAnswerLoading(false);
      return;
    }
    try {
      const ares = await fetch("/api/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, results: matches }),
      });
      const adata: AnswerResponse & { error?: string } = await ares.json();
      if (run !== runRef.current) return;
      setAnswer(adata.error ? null : adata.answer);
    } catch {
      if (run !== runRef.current) return;
      setAnswer(null);
    } finally {
      if (run === runRef.current) setAnswerLoading(false);
    }
  }, []);

  // run the search from the URL on first load (e.g. a shared /search?q=… link).
  // deferred so we don't setState synchronously inside the effect body.
  useEffect(() => {
    if (!initialQuery.trim()) return;
    const id = window.setTimeout(() => runSearch(initialQuery), 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const all = results ?? [];
  const typeCounts = new Map<string, number>();
  for (const r of all) typeCounts.set(r.type, (typeCounts.get(r.type) ?? 0) + 1);
  const shown = activeType ? all.filter((r) => r.type === activeType) : all;
  const hasQuery = query.trim().length > 0;

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          runSearch(input);
        }}
        className="panel flex items-center gap-2 px-3 py-2"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="size-4 shrink-0 text-slate-500">
          <path
            fillRule="evenodd"
            d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.45 4.39l3.08 3.08a.75.75 0 1 1-1.06 1.06l-3.08-3.08A7 7 0 0 1 2 9Z"
            clipRule="evenodd"
          />
        </svg>
        <input
          name="q"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          autoFocus
          placeholder="Search the knowledge base…"
          className="flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-600 outline-none"
        />
        <button
          type="submit"
          className="rounded-md bg-violet-500/15 px-3 py-1 text-xs font-medium text-violet-300 hover:bg-violet-500/25"
        >
          Search
        </button>
      </form>

      {hasQuery && (
        <div className="mt-4 space-y-5">
          {/* AI response */}
          <section className="rounded-xl border border-cyan-500/20 bg-cyan-500/8 p-4">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-cyan-400">
              AI response
            </div>
            {answerLoading ? (
              <div className="space-y-2" aria-label="Synthesizing answer">
                <Bar className="h-3 w-[92%]" />
                <Bar className="h-3 w-full" />
                <Bar className="h-3 w-[85%]" />
                <Bar className="h-3 w-[60%]" />
              </div>
            ) : answer ? (
              <div className="prose-dark text-sm leading-relaxed text-slate-200">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{answer}</ReactMarkdown>
              </div>
            ) : (
              <div className="text-sm text-slate-500">
                No answer could be synthesized for this query.
              </div>
            )}
          </section>

          {/* Gbrain matches */}
          <section>
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Gbrain matches
              </span>
              {matchesLoading ? (
                <span className="text-slate-600">searching…</span>
              ) : (
                <span className="text-slate-500">
                  {all.length} {all.length === 1 ? "match" : "matches"}
                </span>
              )}
              {!matchesLoading && typeCounts.size > 1 && (
                <>
                  <FilterChip
                    label="all"
                    count={all.length}
                    active={!activeType}
                    onClick={() => setActiveType(undefined)}
                  />
                  {[...typeCounts.entries()]
                    .sort((a, b) => b[1] - a[1])
                    .map(([t, n]) => (
                      <FilterChip
                        key={t}
                        label={t}
                        count={n}
                        active={activeType === t}
                        onClick={() => setActiveType(t)}
                      />
                    ))}
                </>
              )}
            </div>

            {matchesLoading ? (
              <ul className="space-y-1" aria-label="Loading matches">
                {Array.from({ length: 6 }).map((_, i) => (
                  <li key={i} className="rounded-lg px-3 py-2.5">
                    <span className="flex items-center gap-2">
                      <span className="size-2 shrink-0 rounded-full bg-white/10" />
                      <Bar className="h-3.5 w-1/3" />
                    </span>
                    <Bar className="mt-2 ml-4 h-2.5 w-4/5" />
                  </li>
                ))}
              </ul>
            ) : all.length === 0 ? (
              <p className="mt-6 text-center text-sm text-slate-500">
                No matches for “{query}”.
              </p>
            ) : (
              <ul className="space-y-1">
                {shown.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/page/${r.id}`}
                      className="block rounded-lg px-3 py-2.5 transition-colors hover:bg-white/5"
                    >
                      <span className="flex items-center gap-2 text-sm">
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ background: typeColor(r.type) }}
                        />
                        <span className="truncate font-medium text-slate-200">{r.title}</span>
                        <span className="ml-auto shrink-0 text-xs text-slate-600">
                          {r.degree} links
                        </span>
                      </span>
                      {r.snippet && (
                        <span
                          className="mt-1 block pl-4 text-xs leading-relaxed text-slate-500 [&_b]:font-medium [&_b]:text-cyan-300"
                          dangerouslySetInnerHTML={{ __html: snippetHtml(r.snippet) }}
                        />
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </>
  );
}

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2.5 py-0.5 font-medium transition-colors ${
        active
          ? "bg-violet-500/20 text-violet-200"
          : "bg-white/5 text-slate-400 hover:text-slate-100"
      }`}
    >
      {label} <span className="tabular-nums opacity-70">{count}</span>
    </button>
  );
}
