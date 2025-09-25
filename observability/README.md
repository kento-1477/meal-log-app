# Observability Artifacts

This directory collects Grafana dashboards and Prometheus rules for the nutrition shadow pipeline. Metrics expose per-field labels plus deployment context via `register.setDefaultLabels()` (`env`, `shadow_version`, `ai_provider`), and build metadata is published through the `meal_log_app_build_info` gauge (`app_version`, `model`).

## Grafana

- `grafana/shadow-diff-dashboard.json`: dashboard covering record/day P95 diffs and breach counters. Import into your Grafana workspace, bind the `datasource` variable to the Prometheus data source UID, and use the `env`/`field` variables to scope series.
- Panels use the template: `histogram_quantile(0.95, sum by (le, env, field) (rate(<metric>_bucket{...}[window])))`; keep this pattern when cloning charts.
- Panels assume histogram `_bucket` metrics with `env` labels; update queries if label names change.

## Prometheus Alerts

- `prometheus/shadow-diff-alerts.yml`: alerting rules scoped to `env="prod"` for burst breaches and daily P95 thresholds. Run `promtool check rules observability/prometheus/shadow-diff-alerts.yml` before deploying and wire into Alertmanager.

## Prometheus Baselines

- `prometheus/shadow-diff-recording-rules.yml`: recording rules that capture per-environment P50/P90/P95 and breach rates every 5–15 minutes. Load alongside alerts to build a 2–4 week baseline for data-driven threshold tuning.
- `scripts/prometheus/pull_shadow_metrics.sh`: helper to export histogram quantiles/breach rates from Prometheus. Requires `PROM_URL` and optional range env vars; outputs `shadow_metrics.json` for offline IQR計算。
- `scripts/prometheus/compute_shadow_thresholds.py`: loads the exported JSON and prints env/field stats (median/p90/p95/IQR) with a suggested threshold (`median + 1.5*IQR`).
