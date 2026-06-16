import SectionShell from "@/components/SectionShell";
import { getContentTypes } from "@/lib/queries";
import { typeColor } from "@/lib/colors";

// Reads the live DB on each request — never prerender at build time.
export const dynamic = "force-dynamic";

export default async function TypesPage() {
  const c = await getContentTypes();
  const maxType = Math.max(1, ...c.types.map((t) => t.count));
  const maxLink = Math.max(1, ...c.linkTypes.map((l) => l.count));
  const maxTag = Math.max(1, ...c.tags.map((t) => t.count));

  return (
    <SectionShell
      title="Content types"
      subtitle="What kinds of knowledge live in the brain — page types, how pages connect, and the tags that describe them."
    >
      {/* summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Pages" value={c.totalPages.toLocaleString()} />
        <Stat label="Page types" value={c.types.length.toLocaleString()} />
        <Stat label="Links" value={c.totalLinks.toLocaleString()} />
        <Stat label="Tagged pages" value={c.taggedPages.toLocaleString()} />
      </div>

      {/* page types */}
      <section className="panel mt-6 p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-200">Page types</h2>
        <div className="space-y-4">
          {c.types.map((t) => (
            <div key={t.type}>
              <div className="flex items-center gap-2 text-sm">
                <span
                  className="size-2.5 rounded-full"
                  style={{ background: typeColor(t.type) }}
                />
                <span className="font-medium text-slate-200">{t.type}</span>
                <span className="tabular-nums text-slate-500">
                  {t.count.toLocaleString()}
                </span>
                <span className="text-xs text-slate-600">
                  {((t.count / c.totalPages) * 100).toFixed(t.count / c.totalPages < 0.1 ? 1 : 0)}%
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(t.count / maxType) * 100}%`,
                    background: typeColor(t.type),
                  }}
                />
              </div>
              {t.samples.length > 0 && (
                <p className="mt-1.5 truncate text-xs text-slate-500">
                  e.g. {t.samples.join(" · ")}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* link types */}
        <section className="panel p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-200">
            Link types
            <span className="ml-2 font-normal text-slate-600">how pages connect</span>
          </h2>
          <div className="space-y-3">
            {c.linkTypes.map((l) => (
              <div key={l.link_type}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-300">{l.link_type}</span>
                  <span className="tabular-nums text-slate-500">
                    {l.count.toLocaleString()}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full bg-sky-400/70"
                    style={{ width: `${(l.count / maxLink) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* tags */}
        <section className="panel p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-200">
            Top tags
            <span className="ml-2 font-normal text-slate-600">{c.tags.length} shown</span>
          </h2>
          {c.tags.length === 0 ? (
            <p className="text-sm text-slate-500">No tags in this database.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {c.tags.map((t) => (
                <span
                  key={t.tag}
                  className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-slate-300"
                  style={{ opacity: 0.55 + 0.45 * (t.count / maxTag) }}
                >
                  {t.tag}
                  <span className="ml-1.5 tabular-nums text-slate-500">{t.count}</span>
                </span>
              ))}
            </div>
          )}
        </section>
      </div>
    </SectionShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-100">{value}</div>
    </div>
  );
}
