# DUAL_WRITE_V2 Go/No-Go Proposal — Pending Real Baseline (2025-09-20)

## Summary

- Shadow diff baseline **simulated** for documentation purposes; real Prometheus exports are still pending (see `observability/baselines_demo/20250920/`).
- Legacy alert thresholds (80 kcal / 15 g / 18%) remain active in production; the recalibrated proposal (55 / 12 / 0.12) will be revisited after 2–4 weeks of real data.
- Dashboards and Alertmanager impact must be validated with production metrics before enabling the flag.
- `/metrics` smoke + `npm run test:golem` remain green under `DUAL_WRITE_V2=0` (shadow-only) and sampled dual-write replay.
- **Status**: proposal only. Go-live requires completion of the prerequisites listed below.

## Evidence

| Item           | Details                                                                                                                                                                                                         |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline stats | `observability/baselines_demo/20250920/baseline_summary_20250920.csv` (simulated, documents the workflow).                                                                                                      |
| Alert config   | `observability/prometheus/shadow-diff-alerts.yml` still on legacy thresholds; recalibration PR will follow real data capture.                                                                                   |
| Grafana        | `observability/grafana/shadow-diff-dashboard.json` (panel: `Daily kcal diff P95`, `Daily macro diff P95`, `Daily relative diff P95`). Requires validation with production metrics once baselines are refreshed. |
| Metrics smoke  | `npm test -- --runTestsByPath __tests__/metrics.smoke.test.js`.                                                                                                                                                 |
| Diff gate      | `npm run test:golem` (fixtures/dual write diff gate).                                                                                                                                                           |
| Alert dry-run  | Simulated `meal_log_shadow_daily_diff_breach_total` increments stay < threshold during replay.                                                                                                                  |

## Rollout Plan

1. **Baseline completion (blocking)**
   - Collect ≥3 real Prometheus exports via `scripts/prometheus/pull_shadow_metrics.sh` (prod and/or stg) over 2–4 weeks.
   - Compute IQR statistics with `scripts/prometheus/compute_shadow_thresholds.py`; review medians/p95 with SRE + product.
   - Produce approval PR to update `observability/prometheus/shadow-diff-alerts.yml`; include Grafana evidence.
2. **Stage rollout (tentative)**
   - Once thresholds are approved, enable `DUAL_WRITE_V2` at 10% in staging; monitor dashboards + `/metrics` for at least 2 hours.
3. **Production rollout (conditional)**
   - Ramp 10% → 50% → 100% only after staging stability and on-call alignment. Share Grafana snapshots at each step.
4. **Post-Deployment**
   - Archive real baseline artefacts to S3 (`shadow-baselines/<YYYYMMDD>/`).
   - If breach alerts fire (legacy thresholds or new ones), disable the flag and execute RUNBOOK §3 rollback.

## Follow-ups

- Confirm Alertmanager notification routing with SRE (owner TBD from Open Questions list).
- Automate baseline archival to S3 bucket (`shadow-baselines/`) via weekly job once real data starts flowing.
- Prepare Dual Read adapter and visual regression (see `docs/ops/phase2_handoff.md`).
