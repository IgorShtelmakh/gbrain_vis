import { NextRequest, NextResponse } from "next/server";
import { getSubgraphAround, hybridSearch, synthesizeAnswer } from "@/lib/queries";
import type { AskResponse } from "@/lib/types";

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
    const [subgraph, answer] = await Promise.all([
      getSubgraphAround(results.map((r) => r.id)),
      synthesizeAnswer(question, results),
    ]);
    const res: AskResponse = { results, subgraph, answer };
    return NextResponse.json(res);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "ask failed" }, { status: 500 });
  }
}
