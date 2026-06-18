# Control-question retrieval eval ("Garry scoring")

A nightly eval that runs a fixed 20-question control set through gbrain_vis's own
retrieval + answer synthesis and scores it. The result is shown on the **Health**
page (`/health`).

## What it measures

The 20 questions (`src/lib/controlQuestions.ts`) fall in three families, each
graded on two axes by a **reference-free LLM judge** (no hand-maintained answer
key — the judge reads the retrieved pages and the synthesized answer):

| family         | n | axes            | passes when                                  |
|----------------|---|-----------------|----------------------------------------------|
| `navigation`   | 6 | Hit@1 / Hit@3   | the right page is surfaced (see nav bar below) |
| `evidence`     | 9 | cite / rule     | answer cites a real supporting source **and** states the correct rule |
| `decode`       | 5 | cite / rule     | answer identifies the actual cause **and** cites it |

The headline **score is the count of passing questions out of 20**; the goal is
20/20.

### Navigation pass bar

Navigation defaults to **Hit@3** (the correct page is in the top 3 results).
gbrain_vis's retrieval is plain hybrid search (vector + keyword + RRF) — it has
**no reranker or source-tier boost** like Garry's full harness, so the correct
page often lands at rank 2–3 rather than rank 1. Both Hit@1 and Hit@3 are always
shown so the difference is visible. Set `EVAL_NAV_PASS=hit1` for the strict
"top result is correct" bar.

> This is gbrain_vis's *own reproduction* of the rubric, not Garry's harness, so
> the numbers will differ from a `gbrain eval` run — chiefly on navigation rank.

## How it runs

- Runner: `src/lib/eval.ts` (`runControlEval`) — sequential to stay within the
  5-connection pool and the LLM rate limit; takes ~8 min.
- Trigger: `POST /api/eval/run` with header `x-eval-token: $EVAL_CRON_TOKEN`.
  Returns `202` immediately and runs in the background.
- Schedule: a host cron calls `scripts/run-eval.sh` nightly at 03:30 UTC.
- Result: written to `/data/control-eval.json` on the `eval_data` Docker volume
  (survives image rebuilds); the Health page reads the latest.

## Config (env)

| var               | default             | purpose                              |
|-------------------|---------------------|--------------------------------------|
| `EVAL_CRON_TOKEN` | — (required)        | shared secret for the trigger route  |
| `EVAL_JUDGE_MODEL`| `claude-sonnet-4-6` | judge model                          |
| `EVAL_NAV_PASS`   | `hit3`              | navigation pass bar (`hit1`/`hit3`)  |
| `EVAL_DATA_DIR`   | `/data`             | where the result JSON is written     |

## Manual run

```sh
scripts/run-eval.sh            # fire the eval (returns immediately)
# inspect the latest result:
docker exec gbrain_vis_web node -e "console.log(require('/data/control-eval.json').score)"
```
