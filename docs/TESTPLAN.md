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
  - ci-test (push/pr): `.github/workflows/ci.yml` runs `npm test --if-present` with `GEMINI_MOCK=1` so `__tests__/shadow.test.js` and `__tests__/healthz.test.js` gate dual-write metrics
  - diff-gate (PR): `.github/workflows/diff-gate.yml` executes `scripts/simulate_dual_write.js` + `scripts/check_diffs.js` with fixtures
  - Observability lint (todo): `promtool check rules observability/prometheus/shadow-diff-alerts.yml` とダッシュボード JSON フォーマット検証を CI に追加
  - Observability baselines: load `observability/prometheus/shadow-diff-recording-rules.yml` in Prometheus for P50/P90/P95 tracking
  - Metrics smoke: `__tests__/metrics.smoke.test.js` ensures `/metrics` exposes default labels + build info
  - Visual regression: Playwright harness (`tests/visual/`, `playwright.config.js`) — install `@playwright/test` locally and run `npx playwright test` with `PLAYWRIGHT_BASE_URL` when baselines are ready.

### Local Test Database Setup

- Use `.env.test` (postgres/postgres@127.0.0.1:5433) for Jest/Knex.
- Provision the Docker test DB with `.env.db-test` and `docker-compose.override.yml` (binds volume `pgdata`).
- Commands:
  ```bash
  docker compose --env-file .env.db-test down -v
  docker compose --env-file .env.db-test up -d test_db
  until docker compose --env-file .env.db-test exec -T test_db pg_isready -U postgres -d test_meal_log_db -h localhost -p 5432; do sleep 1; done
  docker compose --env-file .env.db-test exec -e PGPASSWORD=postgres -T test_db \
    psql -U postgres -d test_meal_log_db -c "SELECT current_user, current_database();"
  npm test
  ```
- Clean up with `docker compose --env-file .env.db-test down -v` after the suite.
- **Local quick pass**: `npm run test:unit` skips DB suites entirely and should be your default tight loop.
- **Local DB pass**: `npm run test:db:prep` followed by `npm run test:db` executes the integration suites. Run this whenever touching migrations, seeds, DB-backed services, or before release.
- **CI recommendation**: two jobs — quick (`npm run test:unit`) and full (provision Postgres, then `npm run test:db:prep` + `npm run test:db`). Both must pass before merging.

### Integration/Golem Automation

- Fixtures: `fixtures/ci_dual_write.json`, `fixtures/100_cases.json`, `fixtures/ci_dual_write_fail.json`.
- CI: `npm run test:golem` (runs simulate + check_diffs, ensures breach detection).
- Implementation plan updated (2025-09-20).

## 4. Quality Bars

- Diff thresholds per §19; alerts per §21
- Fail → auto rollback (§19.3); create issue (S0/S1), hotfix via legacy path first

## 5. Test Data

- Synthetic fixtures: long text/emoji/EN/vision-only/unknown/portion/multi-day
- Replay: anonymized prod (IDs hashed; images mocked); deterministic time 2025‑01‑15 12:00 JST

## 6. Deliverables

- JUnit + HTML report in CI; weekly QA summary to PM
- Phase change PR must attach test summary + diff charts
