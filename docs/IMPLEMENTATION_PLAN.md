# IMPLEMENTATION_PLAN — Solo Roadmap

> 最新仕様・テスト・運用方針は `/docs/SPEC.md`, `/docs/TESTPLAN.md`, `/docs/RUNBOOK.md` を参照してください。本書は個人開発での着手順序をタスク化したものです。

- [x] **DB準備** (2025-09-17): `202509170001_add_shadow_and_diffs.js` を追加。`meal_logs` カラム拡張 + `ingest_requests` / `meal_logs_v2_shadow` / `diffs` を加法的に作成。
- [x] **Idempotency保存** (2025-09-17): `/log` で Idempotency-Key を解決・`ingest_requests` を確保し、既存ログがある場合は再応答する Idempotent ヒット処理を追加。
- [ ] **Shadow計算**: 新パイプライン（AI正規化→10ガード→算出）をサーバ内部で動かし、`meal_logs_v2_shadow` へ書き込み
- [ ] **Diff算出**: 新旧結果の差分を計算して `diffs` テーブルに記録、ログ出力にも残す
- [x] **CI整備(初期)** (2025-09-18): `scripts/simulate_dual_write.js`・`scripts/check_diffs.js` を実装し、`diff-gate` ワークフローをサンプルfixture付きで有効化
- [ ] **Shadow計算**: 新パイプライン（AI正規化→10ガード→算出）をサーバ内部で動かし、`meal_logs_v2_shadow` へ書き込み
- [ ] **Diff算出**: 新旧結果の差分を計算して `diffs` テーブルに記録、ログ出力にも残す
- [ ] **CI整備(初期)**: `scripts/simulate_dual_write.js`・`scripts/check_diffs.js` を実装し、`diff-gate` ワークフローを有効化

## Phase 1 — Dual Write & Monitoring

- [ ] Shadow結果が安定したら Feature Flag `DUAL_WRITE_V2` を有効化（RUNBOOK 手順）
- [ ] Grafana/Log CLI で `diffs` のP95を可視化
- [ ] `docs/TESTPLAN.md` の Integration/Golem ケースを自動化し、CIで常時実行

## Phase 2 — Dual Read & Visual Regression

- [ ] DTO Adapter（新→旧）を実装し、`DUAL_READ_V2` フラグで有効化
- [ ] Playwright Visual Regression テストを追加し、許容差の測定→調整
- [ ] 既存クライアント表示が変わらないことをスクリーンショットで確認

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
