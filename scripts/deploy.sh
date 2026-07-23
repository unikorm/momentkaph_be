#!/usr/bin/env bash
set -euxo pipefail

APP_DIR=/opt/momentkaph_be
APP_NAME=momentkaph_be
NGINX_DEST=/etc/nginx
NGINX_PREV=/etc/nginx/.prev

# ---- BE: swap dist, keep previous for rollback, atomic replace ----
staging=$(mktemp -d "$APP_DIR/.dist.new.XXXXXX")
tar -xzf /tmp/BE.tar.gz -C "$staging"

rm -rf "$APP_DIR/dist.prev"
[ -d "$APP_DIR/dist" ] && mv "$APP_DIR/dist" "$APP_DIR/dist.prev"
mv "$staging" "$APP_DIR/dist"

pm2 reload "$APP_NAME" --update-env 2>/dev/null \
  || pm2 start "$APP_DIR/ecosystem.config.cjs"
pm2 save


# ---- nginx: only reload if the hash changed ----
new_hash=$(cat /tmp/nginx.hash)
cur_hash=$(cat "$APP_DIR/nginx.hash" 2>/dev/null || true)
if [ "$new_hash" != "$cur_hash" ]; then
  staging=$(mktemp -d /etc/nginx/.new.XXXXXX)
  trap 'rm -rf "$staging"' EXIT
  chmod 755 "$staging"
  tar -xzf /tmp/nginx.tar.gz -C "$staging"
  # fail before touching anything live if the tarball is malformed
  [ -f "$staging/nginx.conf" ] || { echo "tarball missing nginx.conf" >&2; exit 1; }
  [ -d "$staging/conf.d" ]     || { echo "tarball missing conf.d" >&2; exit 1; }
  # back up current
  rm -rf "$NGINX_PREV"
  mkdir -p "$NGINX_PREV"
  mv "$NGINX_DEST/nginx.conf" "$NGINX_PREV/nginx.conf"
  mv "$NGINX_DEST/conf.d"     "$NGINX_PREV/conf.d"
  # install new
  mv "$staging/nginx.conf" "$NGINX_DEST/nginx.conf"
  mv "$staging/conf.d"     "$NGINX_DEST/conf.d"
  rollback() {
    rm -rf "$NGINX_DEST/conf.d" "$NGINX_DEST/nginx.conf"
    cp -a "$NGINX_PREV/nginx.conf" "$NGINX_DEST/nginx.conf"
    cp -a "$NGINX_PREV/conf.d"     "$NGINX_DEST/conf.d"
    nginx -t || echo "WARNING: restored config also fails, manual intervention needed" >&2
  }
  if ! nginx -t; then
    rollback
    echo "new nginx config invalid -> rolled back, not reloaded" >&2
    exit 1
  fi
  if ! systemctl reload nginx; then
    rollback
    echo "reload failed -> rolled back (workers still on old config)" >&2
    exit 1
  fi
  echo "$new_hash" > "$APP_DIR/nginx.hash"
else
  echo "nginx unchanged -> skipping reload"
fi

rm -f /tmp/BE.tar.gz /tmp/nginx.tar.gz /tmp/nginx.hash /tmp/deploy.sh
