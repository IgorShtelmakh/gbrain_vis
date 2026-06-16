import Link from "next/link";
import SectionShell from "@/components/SectionShell";
import { getHistory } from "@/lib/queries";
import { typeColor } from "@/lib/colors";
import type { HistoryBucket } from "@/lib/types";

// Reads the live DB on each request — never prerender at build time.
export const dynamic = "force-dynamic";

const BUCKETS: HistoryBucket[] = ["day", "week", "month"];
const CHART_H = 240; // px

function fmtPeriod(iso: string, bucket: HistoryBucket): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    timeZone: "UTC",
    ...(bucket === "month"
      ? { month: "short", year: "numeric" }
      : { month: "short", day: "numeric" }),
  });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ bucket?: string }>;
}) {
  const sp = await searchParams;
  const bucket: HistoryBucket = BUCKETS.includes(sp.bucket as HistoryBucket)
    ? (sp.bucket as HistoryBucket)
    : "month";
  const h = await getHistory(bucket);

  const maxTotal = Math.max(1, ...h.points.map((p) => p.total));
  const labelStep = Math.max(1, Math.ceil(h.points.length / 16));
  const undated = h.totalPages - h.datedPages;

  return (
    <SectionShell
      title="History"
      subtitle="When knowledge was added to the brain, by the page's creation date."
      actions={
        <div className="flex items-center gap-1 panel p-1">
          {BUCKETS.map((b) => (
            <Link
              key={b}
              href={`/history?bucket=${b}`}
              aria-current={b === bucket ? "page" : undefined}
              className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${
                b === bucket
                  ? "bg-violet-500/20 text-violet-200"
                  : "text-slate-400 hover:text-slate-100 hover:bg-white/5"
              }`}
            >
              {b}
            </Link>
          ))}
        </div>
      }
    >
      {/* summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Pages total" value={h.totalPages.toLocaleString()} />
        <Stat
          label="With a date"
          value={h.datedPages.toLocaleString()}
          hint={undated > 0 ? `${undated.toLocaleString()} undated` : undefined}
        />
        <Stat label="First added" value={h.firstAt ? fmtDate(h.firstAt) : "—"} />
        <Stat label="Latest added" value={h.lastAt ? fmtDate(h.lastAt) : "—"} />
      </div>

      {/* chart */}
      <section className="panel mt-6 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200">
            Pages added per {bucket}
          </h2>
          <p className="text-xs text-slate-500">
            stacked by type · hover a bar for the running total
          </p>
        </div>

        {h.points.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">
            No creation timestamps recorded on pages.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto pb-2">
              <div
                className="flex items-end gap-[3px]"
                style={{ minWidth: h.points.length * 10 }}
              >
                {h.points.map((p, i) => (
                  <div
                    key={p.period}
                    className="group flex flex-1 flex-col items-stretch"
                    style={{ minWidth: 7 }}
                  >
                    <div
                      className="flex flex-col justify-end overflow-hidden rounded-t-[3px] group-hover:ring-1 group-hover:ring-violet-300/40"
                      style={{ height: CHART_H }}
                      title={`${fmtPeriod(p.period, bucket)}: +${p.total} (running total ${h.cumulative[i].toLocaleString()})`}
                    >
                      {h.types
                        .filter((t) => p.byType[t])
                        .map((t) => (
                          <div
                            key={t}
                            style={{
                              height: Math.max(1, (p.byType[t] / maxTotal) * CHART_H),
                              background: typeColor(t),
                            }}
                          />
                        ))}
                    </div>
                  </div>
                ))}
              </div>
              {/* x labels */}
              <div className="mt-1.5 flex gap-[3px]" style={{ minWidth: h.points.length * 10 }}>
                {h.points.map((p, i) => (
                  <div
                    key={p.period}
                    className="flex-1 overflow-visible whitespace-nowrap text-[10px] text-slate-600"
                    style={{ minWidth: 7 }}
                  >
                    {i % labelStep === 0 ? fmtPeriod(p.period, bucket) : ""}
                  </div>
                ))}
              </div>
            </div>

            {/* type legend */}
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-white/5 pt-3">
              {h.types.map((t) => (
                <span key={t} className="flex items-center gap-1.5 text-xs text-slate-400">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ background: typeColor(t) }}
                  />
                  {t}
                </span>
              ))}
            </div>
          </>
        )}
      </section>

      {/* recent additions */}
      <section className="panel mt-6 p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-200">Recently added</h2>
        <ul className="divide-y divide-white/5">
          {h.recent.map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-2">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: typeColor(r.type) }}
              />
              <span className="min-w-0 flex-1 truncate text-sm text-slate-200">
                {r.title}
              </span>
              <span className="shrink-0 text-xs text-slate-600">{r.type}</span>
              <span className="shrink-0 tabular-nums text-xs text-slate-500">
                {fmtDate(r.created_at)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </SectionShell>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="panel px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-100">{value}</div>
      {hint && <div className="text-[11px] text-slate-600">{hint}</div>}
    </div>
  );
}
