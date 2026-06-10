import { NextRequest, NextResponse } from "next/server";
import { hybridSearch } from "@/lib/queries";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ error: "missing q" }, { status: 400 });
  try {
    return NextResponse.json({ results: await hybridSearch(q) });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "search failed" }, { status: 500 });
  }
}
