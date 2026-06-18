#!/usr/bin/env bash
# Redeploy gbrain_vis: pull latest, rebuild the image, restart the container,
# and keep the edge proxy's drop-in config in sync. Run as the `gbrain` user.
set -euo pipefail

APP_DIR="/home/gbrain/gbrain_vis"
EDGE_CONTAINER="contact-finder-agent-ui-1" # owns :80/:443
# Our vhost lives in the edge's persistent caddy_config volume (/config), so a
# contactfinder rebuild/restart cannot drop it. The edge's main Caddyfile pulls
# it in via `import /config/caddy.d/*.caddy` (added to contactfinder's source).
EDGE_DROPIN="/config/caddy.d"
cd "$APP_DIR"

echo "==> Pulling latest from origin/$(git rev-parse --abbrev-ref HEAD)"
git pull --ff-only

echo "==> Rebuilding and restarting container"
docker compose up -d --build

echo "==> Syncing edge proxy config into the persistent caddy_config volume"
if docker ps --format '{{.Names}}' | grep -qx "$EDGE_CONTAINER"; then
  docker exec "$EDGE_CONTAINER" mkdir -p "$EDGE_DROPIN"
  changed=0
  for f in caddy/*.caddy; do
    base="$(basename "$f")"
    # Re-copy only when the in-volume copy differs (or is missing).
    if ! docker exec "$EDGE_CONTAINER" sh -c "cat '$EDGE_DROPIN/$base' 2>/dev/null" | cmp -s - "$f"; then
      docker cp "$f" "$EDGE_CONTAINER:$EDGE_DROPIN/$base"
      changed=1
    fi
  done
  # Ensure the running Caddyfile imports the drop-in dir (idempotent, additive).
  # The same line lives in contactfinder's source Caddyfile so rebuilds keep it.
  if ! docker exec "$EDGE_CONTAINER" grep -q "import /config/caddy.d" /etc/caddy/Caddyfile; then
    docker exec "$EDGE_CONTAINER" sh -c 'printf "\nimport /config/caddy.d/*.caddy\n" >> /etc/caddy/Caddyfile'
    changed=1
  fi
  if [ "$changed" = 1 ]; then
    echo "   routing changed — validating + reloading the edge"
    if docker exec "$EDGE_CONTAINER" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
      docker exec "$EDGE_CONTAINER" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile \
        && echo "   edge reloaded" \
        || echo "   !! edge reload failed — check $EDGE_CONTAINER"
    else
      echo "   !! edge config invalid — NOT reloading (left running config intact)"
    fi
  else
    echo "   routing unchanged"
  fi
else
  echo "   !! edge container $EDGE_CONTAINER not running — routing not applied"
fi

echo "==> Pruning dangling images"
docker image prune -f >/dev/null

echo "==> Waiting for app to become ready"
for i in $(seq 1 30); do
  # /login is always public (the password gate redirects other paths to it).
  code=$(docker run --rm --network contact-finder-agent_default curlimages/curl:latest \
           -s -o /dev/null -w '%{http_code}' http://gbrain_vis:3000/login 2>/dev/null || echo 000)
  if [ "$code" = "200" ]; then
    echo "==> Healthy (HTTP 200). Live at https://gbrain.respaid.com"
    exit 0
  fi
  sleep 2
done

echo "!! App did not return HTTP 200 in time. Recent logs:" >&2
docker logs --tail 30 gbrain_vis_web >&2
exit 1
