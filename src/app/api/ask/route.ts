import { NextRequest, NextResponse } from "next/server";
import { getSubgraphAround, hybridSearch } from "@/lib/queries";
import type { AskResponse } from "@/lib/types";

// Fast phase of a search: returns the matches + the subgraph to render so the
// UI can paint them immediately. The synthesized answer is fetched separately
// from /api/answer so the slow LLM call doesn't block the matches.
export async function POST(req: NextRequest) {
  let question: string;
  try {
    const body = await req.json();
    question = String(body.question ?? "").trim();
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  if (!question) return NextResponse.json({ error: "missing question" }, { status: 400 });

  try {
    const results = await hybridSearch(question, 12);
    const subgraph = await getSubgraphAround(results.map((r) => r.id));
    const res: AskResponse = { results, subgraph };
    return NextResponse.json(res);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "ask failed" }, { status: 500 });
  }
}
