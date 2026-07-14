#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/opt/momentkaph_be
APP_NAME=BE
NGINX_DEST=/opt/nginx/

# ---- BE: swap dist, keep previous for rollback, atomic replace ----
rm -rf "$APP_DIR/dist.prev"
[ -d "$APP_DIR/dist" ] && mv "$APP_DIR/dist" "$APP_DIR/dist.prev"
mkdir -p "$APP_DIR/dist"
staging=$(mktemp -d "$APP_DIR/.dist.new.XXXXXX")
tar -xzf /tmp/BE.tar.gz -C "$staging"
mv "$staging"/* "$APP_DIR/dist"
rm -rf "$staging"


# ---- nginx: only reload if the hash changed ----
new_hash=$(cat /tmp/nginx.hash)
cur_hash=$(cat "$APP_DIR/nginx.hash" 2>/dev/null || true)
if [ "$new_hash" != "$cur_hash" ]; then
  tar -xzf /tmp/nginx.tar.gz -C "$NGINX_DEST"
  echo "$new_hash" > "$APP_DIR/nginx.hash"
else
  echo "nginx unchanged -> skipping reload"
fi
