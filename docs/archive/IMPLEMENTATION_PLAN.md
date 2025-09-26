# IMPLEMENTATION_PLAN — Solo Roadmap

> 最新仕様・テスト・運用方針は `/docs/SPEC.md`, `/docs/TESTPLAN.md`, `/docs/RUNBOOK.md` を参照してください。本書は個人開発での着手順序をタスク化したものです。

## Phase 0 — Shadow Compute & Instrumentation

- [x] **DB準備** (2025-09-17): `202509170001_add_shadow_and_diffs.js` を追加。`meal_logs` カラム拡張 + `ingest_requests` / `meal_logs_v2_shadow` / `diffs` を加法的に作成。
- [x] **Idempotency保存** (2025-09-17): `/log` で Idempotency-Key を解決・`ingest_requests` を確保し、既存ログがある場合は再応答する Idempotent ヒット処理を追加。
- [x] **Shadow計算** (2025-09-18): `/log` 内で新パイプライン候補を生成し、`meal_logs_v2_shadow` と `diffs` へ書き込み。
- [x] **CI整備(初期)** (2025-09-18): `scripts/simulate_dual_write.js`・`scripts/check_diffs.js` を実装し、`diff-gate` ワークフローをサンプルfixture付きで有効化。
- [x] **Diff算出の高度化** (2025-09-19): 日次集計・メトリクス連携・差分ログ出力を実装

## Phase 1 — Dual Write & Monitoring

- [ ] Shadow結果が安定したら Feature Flag `DUAL_WRITE_V2` を有効化（RUNBOOK 手順）
  - Decision log: `docs/ops/dual_write_v2_decision.md` (2025-09-20, Go/No-Go = proceed with staged rollout)
- [x] Grafana/Log CLI で `diffs` のP95を可視化（`meal_log_shadow_diff_abs`/`meal_log_shadow_daily_diff_abs` をダッシュボード化） (2025-09-19): `observability/grafana/shadow-diff-dashboard.json` を Grafana にインポートし、Prometheus ルール `observability/prometheus/shadow-diff-alerts.yml` を Alertmanager に連携
- [ ] Shadow diff alert/metric baselineを収集し、`observability/prometheus/shadow-diff-alerts.yml` のしきい値を再学習
  - 2025-09-20: シミュレーションデータで IQR ワークフローをドキュメント化 (`observability/baselines_demo/20250920/`)。本番導入は実データ(2–4週)収集後に実施。
- [x] CI に `promtool check rules observability/prometheus/shadow-diff-alerts.yml` を追加し、ダッシュボードJSONの整形検証を自動化 (2025-09-20): `.github/workflows/ci.yml` で json.tool + promtool を実行
- [x] /metrics スモークテストを追加し、CI で `npm run test:golem` と併せて実行 (2025-09-20): `__tests__/metrics.smoke.test.js`
- [x] `docs/TESTPLAN.md` の Integration/Golem ケースを自動化し、CIで常時実行 (2025-09-20): `npm run test:golem` を GitHub Actions へ追加

## Phase 2 — Dual Read & Visual Regression

- [ ] DTO Adapter（新→旧）を実装し、`DUAL_READ_V2` フラグで有効化
  - [x] Spec §29.1 の DTO 差分を洗い出し、adapter module を `services/nutrition/adapters` に追加（2025-09-20, `__tests__/dtoAdapter.test.js`）。
  - [ ] Feature flag rollout (staging→prod) plan + metrics for diff regression。
  - [x] Golden fixturesを`fixtures/dual_read/`に生成し、旧DTOとの比較テストを自動化（2025-09-20）。
- [ ] Playwright Visual Regression テストを追加し、許容差の測定→調整
  - [ ] Capture baseline screenshots for key journeys (log list, detail, report)。
  - [ ] Wire Playwright job into CI with threshold `<0.5%` per SPEC §29.4（ハーネスは `tests/visual/` に雛形あり）。
  - [ ] ブラウザ実行環境（Docker/CI）の準備と差分レポートの保管方法を定義。
- [ ] 既存クライアント表示が変わらないことをスクリーンショットで確認
  - TODO: Manual verification checklist + fallback plan documented in RUNBOOK。
  - TODO: Visual regression の失敗時に旧パイプラインへ戻す手順とSRE通知フローをRUNBOOKに追加。

## Phase 3 — Cutover & Ops

- [ ] RUNBOOK の Go条件（§25）を満たしたら新パイプラインへ切替
- [ ] Shadowアーカイブバッチ（`docs/ops/archive.md`）をcron化
- [ ] 90日後に旧Shadowパーティションをdropし、メトリクスを本番運用に移行

## 継続タスク

- [ ] `unknown_*` 集計と辞書更新を週次で実施
- [ ] `docs/CHANGELOG.md` をリリース単位で更新
- [ ] `docs/TESTPLAN.md` の成果（レポート）を週報に追記

---

### 状態更新方法

1. タスクを完了したらチェックボックスを `[x]` に変更し、必要に応じて日付・メモを追記。
2. 仕様や手順を変更した場合は、対応する SPEC/RUNBOOK/TESTPLAN を先に改訂し、本書で参照するリンクを更新。
3. 重要な判断は ADR を追加／更新して残すこと。
