#!/usr/bin/env bash
# Trigger the nightly control-question eval inside the running container.
# The container holds EVAL_CRON_TOKEN in its env; the route writes the result
# to the eval_data volume, which the Health page reads.
#
# Install (run once, as a user that can `docker exec`):
#   (crontab -l 2>/dev/null; echo "30 3 * * * /home/gbrain/gbrain_vis/scripts/run-eval.sh >> /var/log/gbrain-eval.log 2>&1") | crontab -
set -euo pipefail

CONTAINER="${GBRAIN_VIS_CONTAINER:-gbrain_vis_web}"

docker exec "$CONTAINER" node -e "
fetch('http://127.0.0.1:3000/api/eval/run', {
  method: 'POST',
  headers: { 'x-eval-token': process.env.EVAL_CRON_TOKEN },
})
  .then(async (r) => console.log(new Date().toISOString(), 'HTTP', r.status, await r.text()))
  .catch((e) => { console.error(new Date().toISOString(), 'ERR', e.message); process.exit(1); });
"
