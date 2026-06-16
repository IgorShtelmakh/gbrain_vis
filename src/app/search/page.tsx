import Link from "next/link";
import SectionShell from "@/components/SectionShell";
import { hybridSearch } from "@/lib/queries";
import { typeColor } from "@/lib/colors";

// Reads the live DB on each request — never prerender at build time.
export const dynamic = "force-dynamic";

/** Render a ts_headline snippet: escape, then turn **..** into highlighted bold. */
function snippetHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string }>;
}) {
  const sp = await searchParams;
  const query = (sp.q ?? "").trim();
  const all = query ? await hybridSearch(query, 50) : [];

  const typeCounts = new Map<string, number>();
  for (const r of all) typeCounts.set(r.type, (typeCounts.get(r.type) ?? 0) + 1);
  const activeType = sp.type && typeCounts.has(sp.type) ? sp.type : undefined;
  const results = activeType ? all.filter((r) => r.type === activeType) : all;

  return (
    <SectionShell
      title="Search"
      subtitle="Hybrid full-text + semantic search across the brain."
    >
      <form action="/search" className="panel flex items-center gap-2 px-3 py-2">
        <svg viewBox="0 0 20 20" fill="currentColor" className="size-4 shrink-0 text-slate-500">
          <path
            fillRule="evenodd"
            d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.45 4.39l3.08 3.08a.75.75 0 1 1-1.06 1.06l-3.08-3.08A7 7 0 0 1 2 9Z"
            clipRule="evenodd"
          />
        </svg>
        <input
          name="q"
          defaultValue={query}
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

      {query && (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-500">
              {all.length} {all.length === 1 ? "match" : "matches"}
            </span>
            {typeCounts.size > 1 && (
              <>
                <FilterChip q={query} label="all" count={all.length} active={!activeType} />
                {[...typeCounts.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .map(([t, n]) => (
                    <FilterChip
                      key={t}
                      q={query}
                      type={t}
                      label={t}
                      count={n}
                      active={activeType === t}
                    />
                  ))}
              </>
            )}
          </div>

          <ul className="mt-3 space-y-1">
            {results.map((r) => (
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

          {all.length === 0 && (
            <p className="mt-8 text-center text-sm text-slate-500">
              No matches for “{query}”.
            </p>
          )}
        </>
      )}
    </SectionShell>
  );
}

function FilterChip({
  q,
  type,
  label,
  count,
  active,
}: {
  q: string;
  type?: string;
  label: string;
  count: number;
  active: boolean;
}) {
  const href = type
    ? `/search?q=${encodeURIComponent(q)}&type=${encodeURIComponent(type)}`
    : `/search?q=${encodeURIComponent(q)}`;
  return (
    <Link
      href={href}
      className={`rounded-full px-2.5 py-0.5 font-medium transition-colors ${
        active
          ? "bg-violet-500/20 text-violet-200"
          : "bg-white/5 text-slate-400 hover:text-slate-100"
      }`}
    >
      {label} <span className="tabular-nums opacity-70">{count}</span>
    </Link>
  );
}
