# Shadow Metrics Baseline Collection

## Objective

Collect 2–4 weeks of Prometheus histogram/breach data for the shadow pipeline, compute robust statistics, and recalibrate alert thresholds before enabling `DUAL_WRITE_V2`.

## Prerequisites

- Prometheus exposes `meal_log_shadow_*` metrics with labels (`env`, `field`, `shadow_version`, …).
- Recording rules from `observability/prometheus/shadow-diff-recording-rules.yml` are loaded.
- Grafana dashboard `observability/grafana/shadow-diff-dashboard.json` is imported for monitoring.

### 必要な環境変数

- `PROM_URL`: PrometheusサーバーのURL
- `METRIC_ENV`: 対象環境 (e.g., `prod`)
- `PROM_QUERY_RANGE_START`: データ取得開始時刻 (RFC3339 format, e.g., `2025-09-21T00:00:00Z`)
- `PROM_QUERY_RANGE_END`: データ取得終了時刻 (RFC3339 format, e.g., `2025-09-22T00:00:00Z`)
- `PROM_QUERY_STEP`: データ取得間隔 (e.g., `15m`)

## Weekly Procedure

1. Set environment variables (example):
   ```bash
   export PROM_URL="https://prometheus.example.com"
   export PROM_QUERY_RANGE_START="now-7d"
   export PROM_QUERY_RANGE_END="now"
   export PROM_QUERY_STEP="15m"
   export PROM_ENV_PATTERN="prod"
   export OUTPUT_JSON="shadow_metrics_$(date +%Y%m%d).json"
   ```
2. Pull metrics:
   ```bash
   scripts/prometheus/pull_shadow_metrics.sh
   ```
3. Compute statistics and suggested thresholds:
   ```bash
   python scripts/prometheus/compute_shadow_thresholds.py "$OUTPUT_JSON" \
     > baseline_summary_$(date +%Y%m%d).csv
   ```
4. Store the JSON/CSV artefacts (e.g., S3 `shadow-baselines/`).
5. Track median/p95 and recommended thresholds over consecutive weeks. Aim for 2–4 data points before recalibration.

## Recalibration Checklist

- Aggregate results and select new alert thresholds (e.g., `median + 1.5 * IQR`).
- Update `observability/prometheus/shadow-diff-alerts.yml` and remove "TODO recalibrate" comments.
- Document the change in `docs/CHANGELOG.md` and notify on-call rotation.
- Verify Grafana/Alert behavior post-change (RUNBOOK §6, §7).

## Demo Baseline (2025-09-20)

- 実データ収集手順（デモ環境）: PROM_URL=<your-prom> METRIC_ENV=prod npm run metrics:baseline
- Artefacts: `observability/baselines_demo/20250920/shadow_metrics_20250920.json` (simulated export), `observability/baselines_demo/20250920/baseline_summary_20250920.csv` (IQR statistics).
- Recommended thresholds derived from this demo: 55 kcal (`dkcal`), 12 g (`dp|df|dc`), 0.12 ratio (`rel_p|rel_f|rel_c`). **Do not apply to production** — collect real Prometheus data first.
- Alerts remain on legacy thresholds until a real baseline PR is approved (`observability/prometheus/shadow-diff-alerts.yml`).
- NOTE: このディレクトリは手順を説明するためのダミーデータです。本番値は S3 等の外部ストレージに保管し、リポジトリにはメタデータのみを残してください。
