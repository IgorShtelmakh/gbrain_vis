#!/usr/bin/env bash
# Redeploy gbrain_vis: pull latest, rebuild the image, restart the container,
# and keep the edge proxy's drop-in config in sync. Run as the `gbrain` user.
set -euo pipefail

APP_DIR="/home/gbrain/gbrain_vis"
SITES_DIR="/srv/caddy/sites-enabled"      # edge Caddy mounts this read-only
EDGE_CONTAINER="contact-finder-agent-ui-1" # owns :80/:443, imports sites-enabled/*
cd "$APP_DIR"

echo "==> Pulling latest from origin/$(git rev-parse --abbrev-ref HEAD)"
git pull --ff-only

echo "==> Rebuilding and restarting container"
docker compose up -d --build

echo "==> Syncing edge proxy config (gbrain's own *.caddy files)"
mkdir -p "$SITES_DIR"
changed=0
for f in caddy/*.caddy; do
  base="$(basename "$f")"
  if ! cmp -s "$f" "$SITES_DIR/$base"; then
    cp "$f" "$SITES_DIR/$base"
    changed=1
  fi
done
if [ "$changed" = 1 ]; then
  echo "   routing changed — reloading the edge"
  if docker ps --format '{{.Names}}' | grep -qx "$EDGE_CONTAINER"; then
    docker exec "$EDGE_CONTAINER" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile \
      && echo "   edge reloaded" \
      || echo "   !! edge reload failed — check $EDGE_CONTAINER"
  else
    echo "   !! edge container $EDGE_CONTAINER not running — routing not applied"
  fi
else
  echo "   routing unchanged"
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
