#!/usr/bin/env bash
set -euo pipefail
if [[ -z "${PROM_URL:-}" ]]; then
  echo "ERROR: Set PROM_URL (e.g. https://prometheus.example.com)"; exit 1;
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required (e.g. brew install jq)."; exit 1;
fi

# Auth headers
auth_opts=()
if [[ -n "${PROM_TOKEN:-}" ]]; then
  auth_opts+=(-H "Authorization: Bearer ${PROM_TOKEN}")
elif [[ -n "${PROM_USER:-}" && -n "${PROM_PASS:-}" ]]; then
  auth_opts+=(-u "${PROM_USER}:${PROM_PASS}")
fi

ENV="${METRIC_ENV:-prod}"
DAY="$(date +%Y%m%d)"
OUT_DIR="observability/baselines_demo/${DAY}"
mkdir -p "${OUT_DIR}"
: "${PROM_QUERY_RANGE_START:?Set PROM_QUERY_RANGE_START (e.g. 2025-09-15T00:00:00Z)}"
: "${PROM_QUERY_RANGE_END:?Set PROM_QUERY_RANGE_END   (e.g. 2025-09-22T00:00:00Z)}"
PROM_QUERY_STEP="${PROM_QUERY_STEP:-15m}"

# 時系列のp95を直接返す式にする（あとでIQRを時系列の分布に当てる）
q_abs_kcal='histogram_quantile(0.95, sum by (le, env) (rate(meal_log_shadow_daily_diff_abs_bucket{field="dkcal", env="%s"}[1h])))'
q_abs_macros='histogram_quantile(0.95, sum by (le, field, env) (rate(meal_log_shadow_daily_diff_abs_bucket{field=~"dp|df|dc", env="%s"}[1h])))'
q_rel='histogram_quantile(0.95, sum by (le, field, env) (rate(meal_log_shadow_daily_diff_rel_bucket{field=~"rel_p|rel_f|rel_c", env="%s"}[1h])))'
printf -v abs_kcal   "${q_abs_kcal}"   "${ENV}"
printf -v abs_macros "${q_abs_macros}" "${ENV}"
printf -v rel        "${q_rel}"        "${ENV}"

# Run queries and validate
curl -sfSG --compressed "${auth_opts[@]}" "${PROM_URL}/api/v1/query_range" \
  --data-urlencode "query=${abs_kcal}" \
  --data-urlencode "start=${PROM_QUERY_RANGE_START}" \
  --data-urlencode "end=${PROM_QUERY_RANGE_END}" \
  --data-urlencode "step=${PROM_QUERY_STEP}" | tee "${OUT_DIR}/abs_kcal.json" | jq -e '.status=="success" and (.data.result|length>0)' > /dev/null

curl -sfSG --compressed "${auth_opts[@]}" "${PROM_URL}/api/v1/query_range" \
  --data-urlencode "query=${abs_macros}" \
  --data-urlencode "start=${PROM_QUERY_RANGE_START}" \
  --data-urlencode "end=${PROM_QUERY_RANGE_END}" \
  --data-urlencode "step=${PROM_QUERY_STEP}" | tee "${OUT_DIR}/abs_macros.json" | jq -e '.status=="success" and (.data.result|length>0)' > /dev/null

curl -sfSG --compressed "${auth_opts[@]}" "${PROM_URL}/api/v1/query_range" \
  --data-urlencode "query=${rel}" \
  --data-urlencode "start=${PROM_QUERY_RANGE_START}" \
  --data-urlencode "end=${PROM_QUERY_RANGE_END}" \
  --data-urlencode "step=${PROM_QUERY_STEP}" | tee "${OUT_DIR}/rel.json" | jq -e '.status=="success" and (.data.result|length>0)' > /dev/null

echo "[pull] wrote ${OUT_DIR}/(abs_kcal|abs_macros|rel).json"
