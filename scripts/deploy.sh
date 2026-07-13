#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/opt/momentkaph_be
APP_NAME=BE
NGINX_DEST=/etc/nginx/

staging=$(mktemp -d "$APP_DIR/.dist.new.XXXXXX")
tar -xzf /tmp/BE.tar.gz -C "$staging"

