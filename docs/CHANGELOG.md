# CHANGELOG (Spec)

## Unreleased — Provider Refactor

- Added `nutrition` provider switch (`NUTRITION_PROVIDER`, default `dict`) with `services/nutrition/providers/dictProvider.js` wrapping the legacy pipeline.
- `services/nutrition/index.js` now delegates through `getProvider()` so future AI/Hybrid providers can plug in without touching callers.
- Repository cleanup: ignore `uploads/` & `server.log`, drop checked-in samples, move historical docs under `docs/archive/`.
- Guardrails (`schema→sanitize→reconcile→zeroFloor`) exposed via `createGuardrailRunner`; zero-floor now respects low-calorie exemptions and records guardrail versions for cache invalidation.
- AI provider adds circuit breaker + retries + dict fallback; cache keys hash locale, normalized text, `AI_MODEL`, `MODEL_VERSION`, `PROMPT_VERSION`, `GUARDRAIL_VERSION`.
- Introduced OFF catalog ingestion (`services/catalog/ingest/offSnapshot.js`), search normalisation, and `/api/foods/search` internal endpoint with burst guard.

## Unreleased — Observability Labels

- Shadow diff Prometheus metrics now carry default labels (`env`, `shadow_version`, `ai_provider`) via `register.setDefaultLabels()`. Update dashboards/alerts to aggregate with `env` (e.g., `sum by (le, env, field)`), and rely on the new `meal_log_app_build_info` Gauge for `app_version`×`model` metadata.
- Added `observability/` assets (Grafana dashboard, alert/recording rules) and `scripts/prometheus/pull_shadow_metrics.sh` for baseline export → use to recalibrate alert thresholds. Added `scripts/prometheus/compute_shadow_thresholds.py` to compute median/p90/p95/IQR and suggest new thresholds. Added baseline collection runbook (`docs/ops/shadow_baseline.md`).
- 2025-09-20: Added a simulated shadow-diff baseline example (`observability/baselines_demo/20250920/`) to document the IQR workflow. Production thresholds remain at the legacy defaults (80 kcal / 15 g / 18%) until real Prometheus data (2–4 weeks) is collected and reviewed.
- Added shadow→legacy DTO adapter (`services/nutrition/adapters/dtoAdapter.js`), golden fixtures (`fixtures/dual_read/cases.json`), and `__tests__/dtoAdapter.test.js`. Introduced Playwright visual regression harness scaffolding (`tests/visual/`, `playwright.config.js`); CI integration remains TODO pending dependency install.
- Added Golem automation (`scripts/run_golem_checks.js`, `npm run test:golem`) and wired into CI. Added `/metrics` smoke test (`__tests__/metrics.smoke.test.js`).

## v1.4 — Test & ItemID

- Added TESTPLAN (RACI/CI/gates); item_id = UUIDv7 (API base64url); audit+7d quick-restore

## v1.3 — Thresholds & Ops

- Fixed numeric diff thresholds; auto rollback runbook; shadow retention automation; UI flows for unknown/set

## v1.2 — Compatibility

- Dual write/read plan; additive migrations; safe Never‑Zero; reuse archetypeMatcher; SoT=server

## v1.1 — Safety Nets

- JSON Schema + limits; idempotency; dict/schema versions; Atwater clip (flag); KPI/60 tests
