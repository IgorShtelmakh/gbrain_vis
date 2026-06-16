import Link from "next/link";
import SectionShell from "@/components/SectionShell";
import { getAllTags } from "@/lib/queries";

// Reads the live DB on each request — never prerender at build time.
export const dynamic = "force-dynamic";

export default async function TagsPage() {
  const tags = await getAllTags();
  const max = Math.max(1, ...tags.map((t) => t.count));

  return (
    <SectionShell
      title="Tags"
      subtitle={`${tags.length} ${tags.length === 1 ? "tag" : "tags"} describing the pages.`}
    >
      {tags.length === 0 ? (
        <p className="text-sm text-slate-500">No tags in this database.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {tags.map((t) => (
            <Link
              key={t.tag}
              href={`/tags/${encodeURIComponent(t.tag)}`}
              className="rounded-full border border-white/10 px-3 py-1 text-sm text-slate-300 transition-colors hover:border-violet-400/40 hover:text-white"
              style={{ opacity: 0.6 + 0.4 * (t.count / max) }}
            >
              {t.tag}
              <span className="ml-1.5 tabular-nums text-xs text-slate-500">{t.count}</span>
            </Link>
          ))}
        </div>
      )}
    </SectionShell>
  );
}
