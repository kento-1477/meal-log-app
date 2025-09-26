# 栄養分析・再設計 実装チェックリスト

フェーズ別・機能別に実装状況を整理しています。`- ✅` は完了、`☐` は未完了または着手中です。

## フェーズ1: AI丸投げ + ガードレール

- ✅ `NutritionProvider` 経由の呼び出しに一本化し、`ai | hybrid | dict` の切り替えを環境変数で制御
- ✅ `aiProvider` 実装（リトライ / サーキットブレーカー / dictフォールバック / 構造化ログ）
- ✅ ガードレール `schema → sanitize → reconcile → zeroFloor` の実装とバージョン管理
- ✅ 低カロリー例外付き zero-floor・互換メタ (`source_kind` / `fallback_level`) の復元
- ✅ guardrail ユニットテスト追加 (`__tests__/guardrails.unit.test.js`)
- ✅ README / SPEC / CHANGELOG の更新（新パイプライン、環境変数、運用メモ）

## フェーズ2: キャッシュ + コスト可視化

- ✅ シングルフライト対応の in-memory キャッシュ (`services/nutrition/cache/index.js`)
- ☐ キャッシュ/コスト系メトリクス（0kcal率・整合違反率・キャッシュHIT率など）の Prometheus 連携強化
- ☐ ダッシュボード/アラートの新指標反映

## フェーズ3: DB優先 + AI補完（OFF活用）

- ✅ OFF スナップショット ingest スケルトン（ステージ→スワップ、サービング正規化、正規化クエリ）
- ☐ OFF 取り込みジョブ（定期実行）の実装・運用 Runbook 整備
- ✅ OFF 検索API `/api/foods/search`（正規化検索、候補3件、バースト防止）
- ☐ UI 側で候補表示・選択 UI／メトリクス (`dbHit`, `candidateCount`, `topConfidence`) 反映
- ☐ `hybridProvider` 本実装（DBヒット優先 + AI補完ロジック、信頼度キャリブレーション）
- ☐ DB優先モードのE2E/回帰テスト整備

## OFF 取り込み仕様

- ✅ `off_products` テーブル/インデックス（Knex migration `202509250001_create_off_catalog.js`）
- ✅ `pg_trgm` 拡張を権限に応じて作成/スキップ
- ✅ サービングサイズ正規化 (`parseServing.js`)、名称正規化 (`normalize.js`)
- ☐ スナップショット UPSERT ジョブの CI/CD 連携（本番投入手順）

## テスト戦略

- ✅ ユニットテスト（ガードレール）
- ☐ AIモックを使った統合テストの再整備（旧メタ期待とのすり合わせ）
- ☐ DB統合テストでの OFF 検索検証
- ☐ `/log` 経由 E2E（候補提示 → 選択 → 保存）

## 可観測性

- ☐ 新パイプライン固有のメトリクス送出（zeroFloor回数・サーキットブレーカー発火・AIコスト推計）
- ☐ ダッシュボード／SLO（0kcal率<0.5% など）の設定

## ロールアウト手順

- ✅ PR1: プロバイダ化 + ガードレール + ENV 整備
- ☐ PR2: テスト/CI 2系統 + AIモック整備
- ✅ PR3: OFF ingest/search 基盤の追加
- ☐ PR4: 候補提示 UI & メトリクス連携
- ☐ PR5: ハイブリッド切替（`NUTRITION_PROVIDER=hybrid` 段階適用）

## 補足

- ✅ 旧資料の `docs/archive/` 退避
- ✅ CI を Node 22 / `NUTRITION_PROVIDER=dict` で実行するよう更新
- ☐ 本番向け OFF ingest の Runbook & 権限確認
