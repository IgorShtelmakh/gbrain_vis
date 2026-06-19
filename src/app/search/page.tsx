import SectionShell from "@/components/SectionShell";
import SearchClient from "@/components/SearchClient";

// The search itself runs client-side (so the page never blocks on the DB or the
// LLM); we only read the initial query from the URL for shareable /search?q=… links.
export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const query = (sp.q ?? "").trim();

  return (
    <SectionShell
      title="Search"
      subtitle="Hybrid full-text + semantic search across the brain, with an AI answer."
    >
      <SearchClient initialQuery={query} />
    </SectionShell>
  );
}
