#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/opt/momentkaph_be
APP_NAME=BE
NGINX_DEST=/etc/nginx/

# ---- app: swap dist, keep previous for rollback, atomic replace ----
rm -rf "$APP_DIR/dist.prev"
[ -d "$APP_DIR/dist" ] && mv "$APP_DIR/dist" "$APP_DIR/dist.prev"
mkdir -p "$APP_DIR/dist"
staging=$(mktemp -d "$APP_DIR/.dist.new.XXXXXX")
tar -xzf /tmp/BE.tar.gz -C "$staging"
mv "$staging"/* "$APP_DIR/dist"
rm -rf "$staging"

