import { NextRequest, NextResponse } from "next/server";
import { isEvalRunning, runControlEval } from "@/lib/eval";

// Heavy, on-demand job — never cache, always run live.
export const dynamic = "force-dynamic";

/**
 * Trigger a full control-question eval. Token-gated: the nightly cron sends
 * `x-eval-token` matching EVAL_CRON_TOKEN. The password gate (proxy.ts) lets
 * this path through so the cron can reach it without a login cookie; this
 * handler is the actual guard.
 *
 * The run takes several minutes (past undici's 5-min header timeout), so we
 * kick it off and return 202 immediately rather than holding the connection.
 * The result lands in the persisted file and shows up on the Health page.
 */
export async function POST(req: NextRequest) {
  const token = process.env.EVAL_CRON_TOKEN;
  const given = req.headers.get("x-eval-token");
  if (!token || given !== token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (isEvalRunning()) {
    return NextResponse.json({ error: "control eval already running" }, { status: 409 });
  }
  // Fire and forget — keep the long job off the request lifecycle.
  runControlEval().catch((e) => console.error("control eval failed:", e));
  return NextResponse.json({ ok: true, started: true }, { status: 202 });
}
