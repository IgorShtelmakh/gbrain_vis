import CallGraphExplorer from "@/components/CallGraphExplorer";
import { primarySymbolForPage } from "@/lib/queries";

// The graph is built client-side on demand; we only resolve an initial symbol
// from the URL (?symbol=… directly, or ?page=… from a code page's panel).
export const dynamic = "force-dynamic";

export default async function CodePage({
  searchParams,
}: {
  searchParams: Promise<{ symbol?: string; page?: string }>;
}) {
  const sp = await searchParams;
  let symbol = (sp.symbol ?? "").trim() || null;
  if (!symbol && sp.page) {
    const id = parseInt(sp.page, 10);
    if (Number.isFinite(id)) symbol = await primarySymbolForPage(id);
  }
  return <CallGraphExplorer initialSymbol={symbol} />;
}
