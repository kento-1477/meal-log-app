# RUNBOOK — Ops & Migration (v1.4)

## 1. Phases

- **P0 Measure**: Legacy only; shadow compute+write to `meal_logs_v2_shadow`; no user impact
- **P1 Dual Write**: Legacy save + shadow save; read = legacy; monitor diffs
- **P2 Dual Read**: Read via adapter(new→old view); compare outputs; visual regression
- **P3 Switch**: New path only; keep shadow 90 days

## 2. Flip/Flags

- Enable: `NORMALIZE_V2_SHADOW` → `DUAL_WRITE_V2` → `DUAL_READ_V2`
- Keep: `NEVER_ZERO_MODE='safe'`, `SET_PROPOSAL_UI=true`
- Optional: `ATWATER_SIMPLE_SCALE`

## 3. Rollback

- Trigger: §19.3 any condition or NPS −3pts
- Action: step back one phase; disable flag; keep shadow; page SRE

## 4. Alerts (Pager)

- ai_parse_fail ≥10% (5m MA) / retry_success ≤50%
- Day diff P90 breach 15m
- Shadow diff breach burst >5/15m (record); daily >10/24h
- Shadow diff daily P95 >80 kcal or >15g macro (1h); rel >18%
- unknown\_\* surge +200% / 10m

> 2025-09-20 時点では実データによる再学習は未完了。`observability/baselines_demo/20250920/baseline_summary_20250920.csv` にシミュレーション例を保存し、IQR ワークフローをドキュメント化している。プロダクション閾値は legacy 値（80 kcal / 15g / 18%）のまま。`METRIC_ENV`/`SHADOW_PIPELINE_VERSION` を設定し、prometheus-recording で P50/P90/P95 を2〜4週間収集した上で正式な更新を行う。`promtool check rules observability/prometheus/shadow-diff-alerts.yml` でルール検証。短窓(15m)×長窓(6h)の二窓バーンレート導入を次フェーズで検討。

## 5. Shadow Ops

- Monthly partition; 02:30 archive to object storage; VACUUM weekly
- Nightly cleanup (02:45 JST): `ingest_requests` から `created_at < now() - interval '90 days'` の行を削除

## 6. Metric Labels & Deployment Config

- Each environment must set the following env vars before starting the API:
  - `METRIC_ENV` (`prod`/`stg`/`dev`/`local`)
  - `SHADOW_PIPELINE_VERSION` (e.g. `v2.0.0` release tag)
  - `AI_PROVIDER` or `NUTRITION_PROVIDER` (`gemini` etc.)
  - `GEMINI_MODEL`/`GENERATIVE_MODEL` when the upstream LLM changes
- Verify after deploy: `curl $APP_HOST/metrics | grep meal_log_shadow_diff_abs_bucket` and ensure the labels include the expected `env`, `shadow_version`, `ai_provider`, `model`, `app_version`.
- Grafana dashboard variable `env` uses the same values; confirm panels render when filtering to the target workspace.
- Load `observability/prometheus/shadow-diff-recording-rules.yml` to accumulate P50/P90/P95 baselines; export 2–4 week slices for IQR-based threshold updates. 週次で `scripts/prometheus/pull_shadow_metrics.sh` を実行し、`PROM_URL`/期間を指定して JSON を取得→IQR 計算し、`observability/prometheus/shadow-diff-alerts.yml` へ反映。 Threshold 計算には `scripts/prometheus/compute_shadow_thresholds.py` を利用し、推奨値 (median + 1.5\*IQR) を元にアラートを更新する。
- Baseline collection runbook: `docs/ops/shadow_baseline.md`. Weekly pulls + IQR summary must be recorded prior to `DUAL_WRITE_V2` Go decision.
- Prometheusクエリは `sum by (le, env, field)` のように `env` を必ず集約に含める（既存クエリ要修正時は CHANGELOG を参照）。

## 7. On-call Quick Commands

- Toggle flags via env/feature service
- Query diffs: `SELECT ... FROM diffs WHERE ts > now()-interval '15 min'`
- Restore log: `POST /logs/:id/restore`

## 8. Phase2 Dual Read Rollout

- Staging rollout: enable `DUAL_READ_V2` with adapter in staging. Compare legacy vs adapter outputs using Playwright+golden fixtures; rollback on mismatch.
  - Snapshot capture: `PLAYWRIGHT_BASE_URL=https://stg.meal-log.example.com npx playwright test --update-snapshots tests/visual`。
  - Golden DTO: `npm test -- --runTestsByPath __tests__/dtoAdapter.test.js`（`CI=1` で DB スキップ可）。
- Production rollout: require ≥2週の visual regression グリーン＋Diff-Gate OK。Flagは percentage rollout (e.g. 10%→50%→100%)。
- Rollback procedure: disable `DUAL_READ_V2`, invalidate adapter cache (if Any), re-run `/metrics` smoke and shadow diff checks。
- Visual Regression failure: capture diff artifacts, Slack/PagerDuty通知、RUNBOOK §3 のロールバック手順を即適用。
  - 確認手順: `playwright-report/` を開いて差分を確認し、`test-results/` の `*-diff.png` を共有。
  - 緊急対応: 旧パイプラインへ戻し (`DUAL_READ_V2=0`)、Playwright ベースラインを更新（`npx playwright test --update-snapshots`、`@playwright/test` を導入済みの場合）。
