import { NextRequest, NextResponse } from "next/server";
import { getCallGraph } from "@/lib/queries";

// Ego call-graph centered on a fully-qualified symbol, out to `depth` hops.
export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol")?.trim();
  if (!symbol) return NextResponse.json({ error: "missing symbol" }, { status: 400 });
  const depth = Math.min(3, Math.max(1, parseInt(req.nextUrl.searchParams.get("depth") ?? "2", 10) || 2));
  try {
    const graph = await getCallGraph(symbol, depth);
    if (!graph) return NextResponse.json({ error: "symbol not found" }, { status: 404 });
    return NextResponse.json(graph);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "callgraph failed" }, { status: 500 });
  }
}
