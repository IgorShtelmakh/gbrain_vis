import Link from "next/link";
import SectionShell from "@/components/SectionShell";
import { getPagesByTag } from "@/lib/queries";
import { typeColor } from "@/lib/colors";

// Reads the live DB on each request — never prerender at build time.
export const dynamic = "force-dynamic";

const LIMIT = 300;

export default async function TagPage({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const { tag } = await params;
  const decoded = decodeURIComponent(tag);
  const pages = await getPagesByTag(decoded, LIMIT);

  return (
    <SectionShell
      title={`#${decoded}`}
      subtitle={`${pages.length}${pages.length === LIMIT ? "+" : ""} ${
        pages.length === 1 ? "page" : "pages"
      } with this tag.`}
      actions={
        <Link
          href="/tags"
          className="panel px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white"
        >
          ← All tags
        </Link>
      }
    >
      {pages.length === 0 ? (
        <p className="text-sm text-slate-500">No pages carry this tag.</p>
      ) : (
        <ul className="panel divide-y divide-white/5 p-2">
          {pages.map((p) => (
            <li key={p.id}>
              <Link
                href={`/page/${p.id}`}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-white/5"
              >
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: typeColor(p.type) }}
                />
                <span className="truncate text-slate-200">{p.title}</span>
                <span className="ml-auto shrink-0 text-xs text-slate-600">{p.type}</span>
                <span className="shrink-0 tabular-nums text-xs text-slate-500">
                  {p.degree} links
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionShell>
  );
}
