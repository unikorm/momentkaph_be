#!/usr/bin/env bash
set -euxo pipefail

APP_DIR=/opt/momentkaph_be
APP_NAME=BE
NGINX_DEST=/etc/nginx

# ---- BE: swap dist, keep previous for rollback, atomic replace ----
staging=$(mktemp -d "$APP_DIR/.dist.new.XXXXXX")
tar -xzf /tmp/BE.tar.gz -C "$staging"

rm -rf "$APP_DIR/dist.prev"
[ -d "$APP_DIR/dist" ] && mv "$APP_DIR/dist" "$APP_DIR/dist.prev"
mv "$staging" "$APP_DIR/dist"


# ---- nginx: only reload if the hash changed ----
new_hash=$(cat /tmp/nginx.hash)
cur_hash=$(cat "$APP_DIR/nginx.hash" 2>/dev/null || true)
if [ "$new_hash" != "$cur_hash" ]; then
  tar -xzf /tmp/nginx.tar.gz -C "$NGINX_DEST"
  echo "$new_hash" > "$APP_DIR/nginx.hash"
  nginx -t
else
  echo "nginx unchanged -> skipping reload"
fi

rm -f /tmp/BE.tar.gz /tmp/nginx.tar.gz /tmp/nginx.hash /tmp/deploy.sh
