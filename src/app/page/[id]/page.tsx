import Link from "next/link";
import { notFound } from "next/navigation";
import SectionShell from "@/components/SectionShell";
import Markdown from "@/components/Markdown";
import { getNodeDetail } from "@/lib/queries";
import { typeColor } from "@/lib/colors";

// Reads the live DB on each request — never prerender at build time.
export const dynamic = "force-dynamic";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function PageDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const nid = Number(id);
  if (!Number.isInteger(nid)) notFound();
  const d = await getNodeDetail(nid);
  if (!d) notFound();

  return (
    <SectionShell
      title={d.title}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <span
            className="rounded-full px-2 py-0.5 text-xs font-medium"
            style={{ background: `${typeColor(d.type)}22`, color: typeColor(d.type) }}
          >
            {d.type}
          </span>
          <span className="text-slate-500">{d.degree} connections</span>
          {d.created_at && (
            <span className="text-slate-600">· added {fmtDate(d.created_at)}</span>
          )}
          {d.updated_at && (
            <span className="text-slate-600">· updated {fmtDate(d.updated_at)}</span>
          )}
        </span>
      }
      actions={
        <Link
          href="/search"
          className="panel px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white"
        >
          ← Search
        </Link>
      }
    >
      {d.tags.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-1.5">
          {d.tags.map((t) => (
            <Link
              key={t}
              href={`/tags/${encodeURIComponent(t)}`}
              className="rounded bg-white/5 px-2 py-0.5 text-xs text-slate-400 hover:bg-white/10 hover:text-slate-200"
            >
              #{t}
            </Link>
          ))}
        </div>
      )}

      {d.compiled_truth && (
        <article className="prose-dark panel p-6 text-sm leading-relaxed text-slate-300">
          <Markdown>{d.compiled_truth.slice(0, 20000)}</Markdown>
        </article>
      )}

      {d.connections.length > 0 && (
        <section className="panel mt-6 p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-200">
            Connections
            <span className="ml-2 font-normal text-slate-600">{d.connections.length}</span>
          </h2>
          <ul className="divide-y divide-white/5">
            {d.connections.map((c, i) => (
              <li key={`${c.id}-${i}`}>
                <Link
                  href={`/page/${c.id}`}
                  className="group block py-2"
                  title={c.context}
                >
                  <span className="flex items-center gap-2 text-sm">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: typeColor(c.type) }}
                    />
                    <span className="truncate text-slate-200 group-hover:text-white">
                      {c.title}
                    </span>
                    <span className="ml-auto shrink-0 text-xs text-slate-600">
                      {c.dir === "out" ? "→" : "←"} {c.link_type}
                    </span>
                  </span>
                  {c.context && (
                    <span className="mt-0.5 block truncate pl-4 text-xs text-slate-500">
                      {c.context}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </SectionShell>
  );
}
