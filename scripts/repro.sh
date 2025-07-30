#!/usr/bin/env bash
set -euxo pipefail
npm ci
export TZ=UTC
export NODE_ENV=test
# ここで test DB 起動/リセットが必要なら呼ぶ（存在すれば）
[ -f package.json ] && jq -e '.scripts["db:test:up"]' package.json >/dev/null 2>&1 && npm run db:test:up || true
[ -f package.json ] && jq -e '.scripts["db:migrate"]' package.json >/dev/null 2>&1 && npm run db:migrate || true
[ -f package.json ] && jq -e '.scripts["db:seed"]' package.json >/dev/null 2>&1 && npm run db:seed || true
npm test -- --runInBand "$@"
