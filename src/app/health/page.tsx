import Link from "next/link";
import SectionShell from "@/components/SectionShell";
import { getHealth, getIndexHealth } from "@/lib/queries";
import type { IndexHealth } from "@/lib/types";

// Always probe the live backend — never serve a cached status.
export const dynamic = "force-dynamic";

function fmtAgo(iso: string, nowIso: string): string {
  const ms = new Date(nowIso).getTime() - new Date(iso).getTime();
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// gbrain may ingest in bursts, so staleness is a soft signal, not a failure.
const STALE_DAYS = 14;

export default async function HealthPage() {
  const [h, index] = await Promise.all([getHealth(), getIndexHealth()]);
  const { db, data, pool } = h;

  const lastActivity = data.lastUpdatedAt ?? data.lastCreatedAt;
  const staleMs = lastActivity
    ? new Date(h.checkedAt).getTime() - new Date(lastActivity).getTime()
    : null;
  const stale = staleMs !== null && staleMs > STALE_DAYS * 86_400_000;

  // clock drift between this server and the database
  const driftMs =
    db.serverTime !== null
      ? Math.abs(new Date(h.checkedAt).getTime() - new Date(db.serverTime).getTime())
      : null;

  return (
    <SectionShell
      title="Health"
      subtitle={`Live status of the gbrain backend · checked ${fmtAgo(h.checkedAt, h.checkedAt)} (${fmtDateTime(h.checkedAt)} UTC)`}
      actions={
        <Link
          href="/health"
          prefetch={false}
          className="rounded-md px-3 py-1.5 text-xs font-medium text-slate-300 panel transition-colors hover:text-white hover:bg-white/5"
        >
          ↻ Refresh
        </Link>
      }
    >
      {/* overall banner */}
      <div
        className={`flex items-center gap-3 rounded-xl border p-4 ${
          h.ok
            ? "border-emerald-500/30 bg-emerald-500/10"
            : "border-red-500/40 bg-red-500/10"
        }`}
      >
        <span className="relative flex size-3">
          {h.ok && (
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400/60" />
          )}
          <span
            className={`relative inline-flex size-3 rounded-full ${
              h.ok ? "bg-emerald-400" : "bg-red-500"
            }`}
          />
        </span>
        <div>
          <div className="text-sm font-semibold text-slate-100">
            {h.ok ? "Operational" : "Database unreachable"}
          </div>
          <div className="text-xs text-slate-400">
            {h.ok
              ? "The app can reach the gbrain database and read its data."
              : "The app could not connect to the gbrain database."}
          </div>
        </div>
      </div>

      {/* connection error detail */}
      {db.error && (
        <pre className="mt-3 overflow-x-auto rounded-lg border border-red-500/30 bg-red-950/30 p-3 text-xs text-red-300">
          {db.error}
        </pre>
      )}

      {/* indexation quality */}
      {index && <Indexation index={index} checkedAt={h.checkedAt} />}

      {/* checks grid */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Check
          label="Database"
          value={db.connected ? "Connected" : "Down"}
          ok={db.connected}
          hint={db.latencyMs !== null ? `${db.latencyMs} ms round-trip` : undefined}
        />
        <Check
          label="Pool"
          value={`${pool.idle}/${pool.total} idle`}
          ok={pool.waiting === 0}
          hint={pool.waiting > 0 ? `${pool.waiting} waiting for a slot` : "no waiters"}
        />
        <Check
          label="Data freshness"
          value={lastActivity ? fmtAgo(lastActivity, h.checkedAt) : "—"}
          ok={!stale}
          hint={
            stale
              ? `no changes in over ${STALE_DAYS} days`
              : "last page change"
          }
        />
      </div>

      {/* metrics */}
      <section className="panel mt-6 p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-200">Database</h2>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          <Row label="Active pages" value={data.activePages.toLocaleString()} />
          <Row label="Deleted pages" value={data.deletedPages.toLocaleString()} />
          <Row
            label="Last page created"
            value={
              data.lastCreatedAt
                ? `${fmtDateTime(data.lastCreatedAt)} UTC · ${fmtAgo(data.lastCreatedAt, h.checkedAt)}`
                : "—"
            }
          />
          <Row
            label="Last page updated"
            value={
              data.lastUpdatedAt
                ? `${fmtDateTime(data.lastUpdatedAt)} UTC · ${fmtAgo(data.lastUpdatedAt, h.checkedAt)}`
                : "—"
            }
          />
          <Row
            label="DB server time"
            value={db.serverTime ? `${fmtDateTime(db.serverTime)} UTC` : "—"}
            hint={driftMs !== null ? `~${(driftMs / 1000).toFixed(1)}s clock drift` : undefined}
          />
          <Row label="Postgres" value={db.version ? db.version.split(" on ")[0] : "—"} />
        </dl>
      </section>
    </SectionShell>
  );
}

function Check({
  label,
  value,
  ok,
  hint,
}: {
  label: string;
  value: string;
  ok: boolean;
  hint?: string;
}) {
  return (
    <div className="panel px-4 py-3">
      <div className="flex items-center gap-2">
        <span
          className={`size-2 rounded-full ${ok ? "bg-emerald-400" : "bg-amber-400"}`}
        />
        <span className="text-[11px] uppercase tracking-wider text-slate-500">{label}</span>
      </div>
      <div className="mt-1.5 text-lg font-semibold text-slate-100">{value}</div>
      {hint && <div className="text-[11px] text-slate-600">{hint}</div>}
    </div>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-white/5 pb-2">
      <dt className="shrink-0 text-xs text-slate-500">{label}</dt>
      <dd className="min-w-0 truncate text-right text-sm tabular-nums text-slate-200">
        {value}
        {hint && <span className="ml-2 text-[11px] text-slate-600">{hint}</span>}
      </dd>
    </div>
  );
}

function scoreTone(score: number): { text: string; bar: string } {
  if (score >= 85) return { text: "text-emerald-300", bar: "bg-emerald-400" };
  if (score >= 60) return { text: "text-amber-300", bar: "bg-amber-400" };
  return { text: "text-red-300", bar: "bg-red-400" };
}

function Indexation({ index, checkedAt }: { index: IndexHealth; checkedAt: string }) {
  const tone = scoreTone(index.score);
  const orphanPct = index.totalPages
    ? Math.round((index.orphans / index.totalPages) * 100)
    : 0;
  const breakdown = index.parts.map((p) => `${p.label} ${p.points}`).join(" · ");

  return (
    <section className="panel mt-6 p-5">
      <h2 className="mb-4 text-sm font-semibold text-slate-200">Indexation</h2>

      {/* score */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-baseline gap-1">
          <span className={`text-3xl font-semibold tabular-nums ${tone.text}`}>
            {index.score}
          </span>
          <span className="text-sm text-slate-500">/100</span>
        </div>
        <div className="min-w-[200px] flex-1">
          <div className="h-2 overflow-hidden rounded-full bg-white/5">
            <div
              className={`h-full rounded-full ${tone.bar}`}
              style={{ width: `${index.score}%` }}
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
            {index.parts.map((p) => (
              <span key={p.key} className="tabular-nums">
                {p.label}{" "}
                <span className="text-slate-300">{p.points}</span>
                <span className="text-slate-600">/{p.max}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-1 text-[11px] text-slate-600">{breakdown}</p>

      {/* metrics */}
      <dl className="mt-4 space-y-2.5 text-sm">
        <Row
          label="Pages"
          value={`${index.totalPages.toLocaleString()}`}
          hint={`embed ${index.embeddedPct}% · ${index.missingEmbeddings.toLocaleString()} missing · ${index.staleEmbeddings.toLocaleString()} stale`}
        />
        <div className="flex items-baseline justify-between gap-4 border-b border-white/5 pb-2">
          <dt className="shrink-0 text-xs text-slate-500">Chunks</dt>
          <dd className="min-w-0 text-right text-sm text-slate-200">
            {index.pagesWithoutChunks > 0 ? (
              <span className="text-amber-300">
                {index.pagesWithoutChunks.toLocaleString()} page(s) without chunks — invisible to
                semantic search ⚠
              </span>
            ) : (
              <span className="text-slate-400">every page has chunks</span>
            )}
          </dd>
        </div>
        <Row
          label="Graph"
          value={`${index.orphans.toLocaleString()}/${index.totalPages.toLocaleString()} orphans`}
          hint={`${orphanPct}% · ${index.deadLinks.toLocaleString()} dead links of ${index.totalLinks.toLocaleString()}`}
        />
        <Row
          label="Contradictions"
          value={
            index.contradictions
              ? `${index.contradictions.flagged} flagged`
              : "no probe yet"
          }
          hint={
            index.contradictions
              ? `from ${index.contradictions.queriesEvaluated} queries · ${fmtAgo(index.contradictions.ranAt, checkedAt)}`
              : undefined
          }
        />
      </dl>
    </section>
  );
}
