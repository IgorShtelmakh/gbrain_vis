import fs from "node:fs/promises";
import path from "node:path";
import { getPool } from "./db";
import { hybridSearch, synthesizeAnswer } from "./queries";
import { CONTROL_QUESTIONS } from "./controlQuestions";
import type {
  ControlEvalRun,
  ControlQuestion,
  ControlQuestionResult,
  EvalCategory,
} from "./types";

// Results live on a Docker volume so they survive container rebuilds. The
// nightly run overwrites this file; the Health page reads it.
const EVAL_DIR = process.env.EVAL_DATA_DIR || "/data";
const EVAL_FILE = path.join(EVAL_DIR, "control-eval.json");

// Judge model. sonnet-4-6 is a capable, cost-reasonable judge available on this
// API key (fable-5 requires special access the key lacks). Override with
// EVAL_JUDGE_MODEL if a stronger/cheaper judge is wanted.
const JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL || "claude-sonnet-4-6";

// How many retrieved pages the judge sees (with bodies) vs. how many ranks the
// retrieved list records for inspection.
const JUDGE_CTX = 6;
const RETRIEVED_KEEP = 8;

// Bar a navigation question must clear to count as passed. Defaults to Hit@3:
// gbrain_vis's retrieval has no reranker/source-tier boost (unlike Garry's full
// harness), so the right page often lands at rank 2-3 rather than rank 1.
// Set EVAL_NAV_PASS=hit1 for the strict "top result is correct" bar.
const NAV_PASS: "hit1" | "hit3" =
  (process.env.EVAL_NAV_PASS || "hit3").toLowerCase() === "hit1" ? "hit1" : "hit3";

// Single-flight guard — the eval is heavy (retrieval + LLM calls per question)
// and should never run concurrently with itself.
let running = false;

/** True while a control eval is in flight. */
export function isEvalRunning(): boolean {
  return running;
}

/** Read the most recent persisted run, or null if none has been written yet. */
export async function readLatestEval(): Promise<ControlEvalRun | null> {
  try {
    const raw = await fs.readFile(EVAL_FILE, "utf8");
    return JSON.parse(raw) as ControlEvalRun;
  } catch {
    return null;
  }
}

function anthropicKey(): string | null {
  return process.env.GBRAIN_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || null;
}

/** Pull the first balanced-looking JSON object out of an LLM text response. */
function parseJson(text: string): Record<string, unknown> | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** One judge call. Returns the parsed JSON object, or null on any failure. */
async function judge(system: string, user: string): Promise<Record<string, unknown> | null> {
  const key = anthropicKey();
  if (!key) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: JUDGE_MODEL,
        max_tokens: 512,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) {
      console.error("eval judge: messages API", res.status, await res.text());
      return null;
    }
    const data = await res.json();
    const text =
      (data.content as { type: string; text?: string }[] | undefined)?.find(
        (b) => b.type === "text"
      )?.text ?? "";
    return parseJson(text);
  } catch (e) {
    console.error("eval judge failed:", e);
    return null;
  }
}

/** compiled_truth excerpts for grounding the judge, keyed by page id. */
async function pageBodies(ids: number[]): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map();
  const { rows } = await getPool().query<{ id: number; body: string }>(
    `SELECT id, left(compiled_truth, 1200) AS body FROM pages WHERE id = ANY($1::int[])`,
    [ids]
  );
  return new Map(rows.map((r) => [r.id, r.body]));
}

const NAV_SYSTEM =
  "You grade a knowledge-base navigation retriever. The user asked to be pointed " +
  "to the single page that is the authoritative location for the thing named in " +
  "the question (a job, command, definition, or piece of logic). You are shown the " +
  "retrieved pages in rank order. Decide which rank, if any, is the page that " +
  "directly and authoritatively answers the question — not merely a related page. " +
  'Reply with JSON only: {"answer_rank": <rank number or null>, "why": "<one short sentence>"}.';

const EVID_SYSTEM =
  "You grade a knowledge-base question-answering system on two axes. You are given " +
  "the question, the system's answer, and the source pages it could draw on. " +
  "Grade strictly:\n" +
  '- "cite": true only if the answer references a source that genuinely contains ' +
  "the supporting evidence (a real page among the sources actually backs the claim).\n" +
  '- "rule": true only if the answer states the correct underlying rule / mechanism ' +
  "(factually right and specific, not vague, hedged, or wrong).\n" +
  'Reply with JSON only: {"cite": <bool>, "rule": <bool>, "why": "<one short sentence>"}.';

const DECODE_SYSTEM =
  "You grade a knowledge-base diagnostic system on two axes. The question describes " +
  "an observed symptom and asks which rule / code / config caused it (and whether a " +
  "fix was correct). You are given the question, the system's answer, and the source " +
  "pages. Grade strictly:\n" +
  '- "cite": true only if the answer references a source that genuinely contains the ' +
  "relevant evidence.\n" +
  '- "rule": true only if the answer correctly identifies the actual cause / rule / ' +
  "code path (specific and right, not a plausible guess).\n" +
  'Reply with JSON only: {"cite": <bool>, "rule": <bool>, "why": "<one short sentence>"}.';

function toBool(v: unknown): boolean {
  return v === true || v === "true" || v === 1;
}

/** Retrieve, (synthesize), and judge a single control question. Never throws. */
async function gradeOne(q: ControlQuestion): Promise<ControlQuestionResult> {
  const base = { id: q.id, category: q.category, question: q.question };
  try {
    const results = await hybridSearch(q.question, RETRIEVED_KEEP);
    const retrieved = results.slice(0, RETRIEVED_KEEP).map((r, i) => ({
      id: r.id,
      title: r.title,
      type: r.type,
      rank: i + 1,
    }));
    const ctxIds = results.slice(0, JUDGE_CTX).map((r) => r.id);
    const bodies = await pageBodies(ctxIds);
    const ctx = results
      .slice(0, JUDGE_CTX)
      .map(
        (r, i) =>
          `[rank ${i + 1}] (id ${r.id}) ${r.title}\n${(bodies.get(r.id) || r.snippet || "").slice(0, 700)}`
      )
      .join("\n\n");

    if (q.category === "navigation") {
      const j = await judge(
        NAV_SYSTEM,
        `Question: ${q.question}\n\nRetrieved pages (rank order):\n\n${ctx}\n\nReturn JSON only.`
      );
      const rawRank = j?.answer_rank;
      const rank = typeof rawRank === "number" && rawRank >= 1 ? Math.floor(rawRank) : null;
      const hit1 = rank === 1;
      const hit3 = rank !== null && rank <= 3;
      const answerPage = rank !== null ? results[rank - 1] : undefined;
      return {
        ...base,
        passed: NAV_PASS === "hit1" ? hit1 : hit3,
        hit1,
        hit3,
        answerRank: rank,
        answerPageId: answerPage?.id ?? null,
        answerTitle: answerPage?.title ?? null,
        cite: null,
        rule: null,
        notes: typeof j?.why === "string" ? j.why : "(no judge response)",
        retrieved,
        error: null,
      };
    }

    const answer = await synthesizeAnswer(q.question, results);
    const j = await judge(
      q.category === "evidence" ? EVID_SYSTEM : DECODE_SYSTEM,
      `Question: ${q.question}\n\nSystem answer:\n${answer ?? "(no answer produced)"}\n\nSource pages:\n\n${ctx}\n\nReturn JSON only.`
    );
    const cite = toBool(j?.cite);
    const rule = toBool(j?.rule);
    return {
      ...base,
      passed: cite && rule,
      hit1: null,
      hit3: null,
      answerRank: null,
      answerPageId: null,
      answerTitle: null,
      cite,
      rule,
      notes: typeof j?.why === "string" ? j.why : "(no judge response)",
      retrieved,
      error: null,
    };
  } catch (e) {
    const nav = q.category === "navigation";
    return {
      ...base,
      passed: false,
      hit1: nav ? false : null,
      hit3: nav ? false : null,
      answerRank: null,
      answerPageId: null,
      answerTitle: null,
      cite: nav ? null : false,
      rule: nav ? null : false,
      notes: "",
      retrieved: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Run the full control set, score it, and persist the result. Questions are
 * graded sequentially to stay gentle on the 5-connection pool and the LLM rate
 * limit. Throws only if a run is already in flight.
 */
export async function runControlEval(): Promise<ControlEvalRun> {
  if (running) throw new Error("control eval already running");
  running = true;
  const ranAt = new Date().toISOString();
  const start = Date.now();
  try {
    const questions: ControlQuestionResult[] = [];
    for (const q of CONTROL_QUESTIONS) {
      questions.push(await gradeOne(q));
    }
    const score = questions.filter((q) => q.passed).length;
    const cats: EvalCategory[] = ["navigation", "evidence", "decode"];
    const byCategory = cats.map((category) => ({
      category,
      passed: questions.filter((q) => q.category === category && q.passed).length,
      total: questions.filter((q) => q.category === category).length,
    }));
    const run: ControlEvalRun = {
      ranAt,
      durationMs: Date.now() - start,
      judgeModel: JUDGE_MODEL,
      navPass: NAV_PASS,
      score,
      total: questions.length,
      byCategory,
      questions,
    };
    await fs.mkdir(EVAL_DIR, { recursive: true });
    await fs.writeFile(EVAL_FILE, JSON.stringify(run, null, 2), "utf8");
    return run;
  } finally {
    running = false;
  }
}
