import { NextRequest, NextResponse } from "next/server";
import { searchSymbols } from "@/lib/queries";

// Typeahead for symbols you can center the call graph on (internal definitions).
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ symbols: [] });
  try {
    return NextResponse.json({ symbols: await searchSymbols(q, 20) });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "symbol search failed" }, { status: 500 });
  }
}
