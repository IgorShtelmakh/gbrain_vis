import { NextRequest, NextResponse } from "next/server";
import { synthesizeAnswer } from "@/lib/queries";
import type { AnswerResponse, SearchResult } from "@/lib/types";

// Slow phase of a search: synthesizes the LLM answer from matches already found
// by /api/ask. Kept separate so the matches render without waiting on the LLM.
export async function POST(req: NextRequest) {
  let question: string;
  let results: SearchResult[];
  try {
    const body = await req.json();
    question = String(body.question ?? "").trim();
    results = Array.isArray(body.results) ? body.results : [];
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  if (!question) return NextResponse.json({ error: "missing question" }, { status: 400 });

  try {
    const answer = await synthesizeAnswer(question, results);
    const res: AnswerResponse = { answer };
    return NextResponse.json(res);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "answer failed" }, { status: 500 });
  }
}
