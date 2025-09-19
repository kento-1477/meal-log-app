# TESTPLAN — Meal‑Log App (v1.4)

## 1. RACI

| Scope                                              | R       | A         | C           | I   |
| -------------------------------------------------- | ------- | --------- | ----------- | --- |
| Unit (normalize, 10 guards, adapters, idempotency) | App Eng | Tech Lead | QA,SRE      | PM  |
| Integration (/log→dual write→diff)                 | App Eng | Tech Lead | QA,SRE      | PM  |
| Golden (old↔new DTO)                              | QA      | Tech Lead | App Eng     | PM  |
| E2E (Chat→DB→Report)                               | QA      | Tech Lead | App Eng,SRE | PM  |
| Perf/Cost                                          | SRE     | SRE Lead  | App Eng     | PM  |
| Visual regression (Dual Read)                      | QA      | Tech Lead | App Eng     | PM  |

## 2. Scope

- **Unit**: JSON Schema/limits; guards (skip/portion/set proposals/Atwater/flags); adapters; idempotency calc
- **Integration**: `/log` dual write; diff calc; shadow persistence; diff breach metrics（`meal_log_shadow_diff_breach_total` 等）
- **Golden**: 100 fixed cases; old↔new equivalence within §19 thresholds
- **E2E**: Playwright journeys（skip・unknown\_\*・set_proposals・edit/undo・delete/restore・report反映）
- **Perf**: Artillery/k6; capture `normalize_runtime_ms`, token usage, P95 endpoints
- **Visual Regression**: Dual Read screenshots diff <0.5%

## 3. Tooling & CI

- Jest + Supertest（unit/integration）
- Playwright（E2E/visual）
- Artillery or k6（perf）
- GitHub Actions:
  - PR: unit+integration+golden (<10m), E2E smoke (3 flows)
  - main: E2E full, visual regression, diff report as artifact
  - Nightly: perf+cost (1h), trend report
  - Phase gate: full suite + 2h soak

## 4. Quality Bars

- Diff thresholds per §19; alerts per §21
- Fail → auto rollback (§19.3); create issue (S0/S1), hotfix via legacy path first

## 5. Test Data

- Synthetic fixtures: long text/emoji/EN/vision-only/unknown/portion/multi-day
- Replay: anonymized prod (IDs hashed; images mocked); deterministic time 2025‑01‑15 12:00 JST

## 6. Deliverables

- JUnit + HTML report in CI; weekly QA summary to PM
- Phase change PR must attach test summary + diff charts
