# Phase1 → Phase2 Handoff (Dual Write to Dual Read)

## 1. Current State Snapshot (2025-09-20)

- **Branch**: `refactor/nutrition-mvp-slim` (CI green)
- **Dual write**: `DUAL_WRITE_V2` flag **disabled** (shadow-only). Shadow diffs persist to `meal_logs_v2_shadow` + `diffs`.
- **Observability assets**:
  - Grafana dashboard `observability/grafana/shadow-diff-dashboard.json`
  - Prometheus rules `observability/prometheus/shadow-diff-{alerts,recording-rules}.yml`
  - Baseline helper scripts `scripts/prometheus/pull_shadow_metrics.sh`, `scripts/prometheus/compute_shadow_thresholds.py`
- **CI coverage**:
  - `npm test` (includes `/metrics` smoke + shadow/idempotency/integration suites)
  - `npm run test:golem` (fixtures/dual write diff gate)
  - `promtool check rules` / JSON formatting for observability assets
- **Docs updated**: SPEC §29.4, RUNBOOK §6/§8, Implementation Plan Phase1/Phase2, TESTPLAN observability lint + Golem automation, ops/shadow_baseline.md

## 2. Objectives for Incoming Engineer

1. **Operationalize shadow diff baselines** → collect real metrics, recompute alert thresholds, update Prometheus rules.
2. **Decide on `DUAL_WRITE_V2` cutover** → ensure dashboards/alerts are stable, execute RUNBOOK go/no-go.
3. **Prepare & execute Phase2 (Dual Read / Visual Regression)** → implement DTO adapter, add visual tests, update RUNBOOK.

## 3. Prerequisites & Environment

| Item              | Details                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------ |
| Prometheus access | Set `PROM_URL`. Ensure recording rules from `observability/prometheus/shadow-diff-recording-rules.yml` are loaded. |
| Grafana           | Import dashboard JSON; validate datasource UID binding.                                                            |
| Test DB           | Docker Compose (`.env.db-test`, `docker-compose.override.yml`) for local `npm test`.                               |
| Flags             | Use Feature service or `.env` to toggle `NORMALIZE_V2_SHADOW`, `DUAL_WRITE_V2`, `DUAL_READ_V2`.                    |
| Docs              | Refer to SPEC §29.\*, RUNBOOK §6/§8, TESTPLAN “Integration/Golem Automation”, ops/shadow_baseline.md.              |

## 4. Task Breakdown

### 4.1 Shadow Diff Baseline & Threshold Recalibration

1. **Weekly data pull (Stage/Prod)**
   ```bash
   export PROM_URL="https://prom.example.com"
   export PROM_QUERY_RANGE_START="now-7d"
   export PROM_QUERY_RANGE_END="now"
   export PROM_QUERY_STEP="15m"
   export PROM_ENV_PATTERN="prod"
   export OUTPUT_JSON="shadow_metrics_$(date +%Y%m%d).json"
   scripts/prometheus/pull_shadow_metrics.sh
   python scripts/prometheus/compute_shadow_thresholds.py "$OUTPUT_JSON" \
     > baseline_summary_$(date +%Y%m%d).csv
   ```
2. **Archive artefacts**: store JSON/CSV (e.g. S3 `shadow-baselines/`). Track median/p95/recommended in a spreadsheet.
3. **After ≥3 data points**:
   - Calculate new thresholds per field (`median + 1.5 * IQR` or adjusted per business rule).

- Update `observability/prometheus/shadow-diff-alerts.yml` (remove “TODO recalibrate” comments).
- `promtool check rules observability/prometheus/*.yml`
- Update `docs/CHANGELOG.md`, RUNBOOK §6 with final values.
- _Status 2025-09-20_: シミュレーションデータを `observability/baselines_demo/20250920/` に保存し、IQR 計算手順を確認。実データ（2〜4週）取得後に改めて閾値を更新する。

### 4.2 `DUAL_WRITE_V2` Go/No-Go

1. Confirm dashboards + alerts are green using updated thresholds.
2. Follow RUNBOOK §6/§8:
   - Stage roll-out (if applicable).
   - Enable `DUAL_WRITE_V2` gradually (10%→50%→100%).
   - Monitor `/metrics`, Grafana, alert noise.
3. **Rollback**: disable flag on breach; RUNBOOK §3 covers recovery.
4. Update Implementation Plan Phase1 once flag stays enabled in prod.

### 4.3 Phase2 (Dual Read & Visual Regression)

| Subtask           | Details                                                                                                                                                                                                                                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DTO adapter       | Build `services/nutrition/adapters/dtoAdapter.js`; mapping table should live in SPEC §29.1. Create golden fixtures (`fixtures/dual_read/…`) for regression tests. _Status 2025-09-20_: Adapter + fixtures landed, Jest golden `__tests__/dtoAdapter.test.js`.                                                                   |
| Feature flag plan | Implement `DUAL_READ_V2` gating + percentage rollout logic (similar to Phase1).                                                                                                                                                                                                                                                 |
| Visual regression | Playwright harness scaffolding (`playwright.config.js`, `tests/visual/dashboard.spec.js`) is ready; install `@playwright/test` locally then run `npm run test:visual -- --update-snapshots` (`PLAYWRIGHT_BASE_URL=<env>` optional) to capture baselines. CI integration will follow once dependencies/browsers are provisioned. |
| RUNBOOK updates   | Add Dual Read rollout steps, visual-diff failure protocol (notifications, fallback).                                                                                                                                                                                                                                            |
| Telemetry         | Ensure Prometheus metrics/logs distinguish read-path diffs; update dashboards if needed.                                                                                                                                                                                                                                        |

## 5. Validation & Observability Checklist

- `/metrics` smoke: `npm test -- --runTestsByPath __tests__/metrics.smoke.test.js`
- Golem diff gate: `npm run test:golem`
- Prometheus rules: `/tmp/prometheus-2.53.0.darwin-arm64/promtool check rules observability/prometheus/*.yml`
- Grafana panels: histogram_quantile template (`histogram_quantile(0.95, sum by (le, env, field)(rate(metric_bucket[window])))`).
- Alertmanager integration tested after threshold updates.

## 6. Key References

- SPEC §16–§21, §29.x — Phase gates, diff thresholds, DTO/visual requirements
- RUNBOOK §6–§8 — Metric config, baseline procedure, Dual Read rollout
- Implementation Plan Phase1/Phase2 — task list with status
- TESTPLAN “Integration/Golem Automation” — CI coverage expectations
- ops/shadow_baseline.md — weekly pull instructions

## 7. Open Questions / Decisions Needed

- Final target thresholds after baseline (`median + 1.5*IQR` vs business-adjusted values)
- Ownership of Grafana/Alert updates (SRE or App team?)
- Visual regression tolerance adjustments once real data is available
- Timeline for Phase2 rollout (e.g., after 2 weeks of stable dual write)

Deliverables for the incoming engineer:

- Prometheus alert thresholds documented; recalibration pending real data
- Go/No-Go proposal on `DUAL_WRITE_V2` (`docs/ops/dual_write_v2_decision.md`)
- DTO golden fixtures `fixtures/dual_read/cases.json` + adapter test `__tests__/dtoAdapter.test.js`
- Visual regression harness scaffold (`npm run test:visual`, `tests/visual/…`)
- Initial DTO adapter + visual regression infrastructure merge-ready
- Revised RUNBOOK sections for dual read and visual regression
