# SPEC — Meal‑Log App (v1.4 Hub)

## 1. Purpose / Scope

- Solve: reliable, low‑friction meal logging with AI assist while **never breaking existing UX**.
- Non-Goals: micronutrient accuracy at medical precision; offline-first.

## 2. Success & Safety Criteria (KPI/SLO)

- P95 `/logs/import` ≤ 5s (AI待ち除くと ≤ 400ms)
- Diff SLO (§19): record/day P95 within thresholds; auto rollback if violated (§19.3)
- Generic ratio: ≤35% (initial) → ≤15% at 90 days
- AI parse fail ≤3% (warn 5%, page 10%)

## 3. System Overview

```
Client Chat → POST /log ──┬─ Legacy pipeline (store as-is)
                          └─ New pipeline (normalize→10 guards→calc→shadow)
                                 │ dual write / dual read
                                 └─ Diff monitor → Alerts / Rollback
```

## 4. Data Model (excerpt)

- `meal_logs`: +`slot,event,totals JSONB NULL,meta JSONB,is_deleted`
- `ingest_requests(id, user_id, request_key unique)`
- `audit_logs(before,after,action)`
- `items[].item_id` = UUIDv7 (API: base64url 22 chars)

## 5. Decisions (link to ADR)

- ADR-0001: Atwater policy = legacy finalizeTotals by default; simple-scale behind flag
- ADR-0002: Never‑Zero = **safe** (user-consent generic; skip detection)
- ADR-0003: Migration = Phase0→3, dual write/read, auto rollback

## 6. Phase & Gate (Go/No-Go)

- Phase gates per §16 & §25 in main spec (P95/diff/alerts). See RUNBOOK for operations.

## 7. Feature Flags

- `NORMALIZE_V2_SHADOW`, `DUAL_WRITE_V2`, `DUAL_READ_V2`, `ATWATER_SIMPLE_SCALE`, `NEVER_ZERO_MODE`, `SET_PROPOSAL_UI`

## 8. Links

- TESTPLAN.md（RACI/CI/fixtures）
- RUNBOOK.md（Phase/rollback/alerts）
- API/SCHEMA.md（JSON Schema）
- GLOSSARY.md

---

## 29. 仕様補遺（v1.5：指摘解消の詳細）

> 指摘 1〜6 に対応する実装指針・スキーマ更新・運用自動化を追加。これにより実装者・QA・SREの行動が一意になります。

### 29.1 item_id 仕様のコード反映とAdapter方針

- **フォーマット**：`base64url`（RFC 4648 §5, **paddingなし**）固定 **22文字**、正規表現 `^[A-Za-z0-9_-]{22}$`。
- **内部表現**：DBは `uuid` 型（UUIDv7）。API入出力は **16byte UUID を base64url に符号化**して返す。
- **ユーティリティ**：

```ts
// encode/decode
function uuidToB64(u: UUID): string {
  return base64url.encode(uuidToBytes(u));
}
function b64ToUuid(s: string): UUID {
  return bytesToUuid(base64url.decode(s));
}
```

- **Adapter層**：`services/nutrition/index.js` の既存ロジック（`computeFromItems` 等）は **ID非依存のまま温存**。新パイプラインの保存直前に `assignItemIds(items)` を挿入してIDを付与。旧パスから読む場合は DTO Adapter が `item_id` を**必ず**付与して返す（IDが無い既存行は移行時に一括採番 or 返却時オンザフライ）。
- **API Schema反映**：`/docs/api/SCHEMA.md` を更新（`minLength:22 / maxLength:22 / pattern`）。

### 29.2 Idempotency キーの実装先と仕様

- **対象API**：`POST /log`（外部）・`POST /logs/import`（内部/private）。
- **受け渡し**：優先は **HTTPヘッダ `Idempotency-Key`**。なければ Body の `idempotency_key` を許可。両方無ければサーバが **`auto:<sha256>`** を生成。
- **生成規約**：

```ts
const key = sha256hex(
  [
    userId,
    canonicalizeJSON(req.body), // stable sort keys / remove whitespace
    imagesDigest(req.images), // sha256 of each file, joined
  ].join('\n'),
); // 64 hex
```

- **保存**：`ingest_requests(user_id, request_key)` に **UNIQUE**。衝突時は**再計算・再保存を行わず**、当時のレスポンスを返却。
- **排他制御**：`pg_advisory_xact_lock` でキー単位ロック→`ingest_requests` を同一TXで読込／更新し、二重INSERTを防止。
- **/log 改修計画**：legacy処理後に**内部で**`/logs/import` を呼ばず、**同プロセス関数**として新パイプラインを実行（ネットワーク往復を避ける）。その際に上記 `request_key` を計算・保存。

### 29.3 Diff 監視の計算・保存

- **記録粒度**：レコード単位（log）と日単位（user×date）の2層。
- **テーブル**：

```sql
CREATE TABLE IF NOT EXISTS diffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ts TIMESTAMP DEFAULT now(),
  phase TEXT,                 -- P0/P1/P2
  user_id UUID NOT NULL,
  log_id UUID,                -- レコード粒度。日粒度はNULL
  date DATE,                  -- 日粒度で使用
  dkcal INTEGER, dp REAL, df REAL, dc REAL,  -- 差分（new-old）
  rel_p REAL, rel_f REAL, rel_c REAL,        -- 相対差（%）
  level TEXT,                 -- record/day
  details JSONB               -- flags, reasons
);
CREATE INDEX IF NOT EXISTS idx_diffs_user_date ON diffs(user_id, date);
```

- **生成ポイント**：Dual Write 完了後に**同期的に**差分算出→`diffs` へINSERT。日粒度も同一トランザクション内で即時Upsertし、将来的な高負荷時はバッファ/バッチ化を検討する。
- **SLO判定**：Grafanaは `diffs` を直接読むか、ETLで時系列に送る。RUNBOOKの `SELECT ... FROM diffs` はこのテーブルを参照。
- **集計ルール**：
  - 日付の確定は `DIFF_TZ_OFFSET_MINUTES`（分単位、既定値0=UTC）で指定したタイムゾーンの**ローカル日付**に丸めてから `DATE` として保存する。JSTなら `540` を指定。
  - 日次スナップショットは `dkcal` を整数、`dp/df/dc` を小数第2位で丸めて保持する。
  - しきい値計算は Node の `diffThresholds` を単一のソースとし、SQL側では独自計算をしない。
  - 構造化ログに含める `idempotency_key` はハッシュ値（先頭16桁）を記録し、生値は出力しない。
  - テーブルインデックス：`idx_diffs_level_user_date_phase`（検索最適化）と `diffs_day_unique`（`level='day'` の一意制約）。
  - Prometheusメトリクス：`meal_log_shadow_diff_abs` / `meal_log_shadow_diff_rel`（レコード粒度）、`meal_log_shadow_daily_diff_abs` / `meal_log_shadow_daily_diff_rel`（日粒度）、および `meal_log_shadow_daily_diff_breach_total` を公開し、Grafana ダッシュボードで参照する。

### 29.4 Visual Regression 閾値と測定ツール

- **ツール**：Playwright `toHaveScreenshot()` + `pixelmatch`。
- **初期閾値**：`maxDiffRatio = 0.005`（0.5%） **または** `maxPixelDiff = 120` の**小さい方**。フォント/カーソル等は `mask` と `caret: 'hide'` で安定化。
- **調整方針**：Phase2の**最初の1週間**で実測を収集し、0.2–0.5%に再設定。ベースライン更新は **Approve付きPR** のみ。

### 29.5 運用自動化：`/docs/ops/archive.md` を追加

````markdown
# ops/archive.md — Shadowアーカイブ運用

## 前提

- 環境変数：`ARCHIVE_BUCKET=s3://meal-log-shadow-archive`、`PG_URL_RO`（読み取り専用）
- 権限：EC2/ECSロール or GitHub OIDC で `s3:PutObject` 許可

## 月次ジョブ（cron 02:30 JST）

```bash
set -euo pipefail
YM=$(date -d "yesterday" +%Y%m)
psql "$PG_URL_RO" -c "COPY (SELECT * FROM meal_logs_v2_shadow WHERE to_char(created_at,'YYYYMM')='$YM') TO STDOUT" \
 | gzip -9 \
 | aws s3 cp - "$ARCHIVE_BUCKET/$YM.sql.gz" --expected-size 0 || exit 1
# 成功したら当該パーティションをdetach→drop
psql "$PG_URL_RO" -f ops/sql/drop_partition_$YM.sql
```
````

- **失敗時**：3回リトライ→PagerDuty。S3書込403はIAMを確認。

````

### 29.6 CIのDiff Gate（PR自動判定）
- **ワークフロー**：`.github/workflows/diff-gate.yml`
```yaml
name: diff-gate
on: [pull_request]
jobs:
  simulate-and-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run build
      - name: Seed fixtures & simulate dual write
        run: node scripts/simulate_dual_write.js fixtures/100_cases.json --write-diffs tmp/diffs.json
      - name: Check thresholds (Spec §19)
        run: node scripts/check_diffs.js tmp/diffs.json --fail-on-breach
````

- **Gate条件**：§19のレコード/日P95を**超えたらPRをFail**。E2E smokeが通ってもこのジョブが赤なら**レビュー不可**。

### 29.7 ingest_requests のTTL

- `created_at` にインデックスを張り、90日より古いレコードを夜間ジョブで削除。
- `docs/ops/ingest_requests_cleanup.md` に手順を記載し、RUNBOOK §5 にスケジュールを明記。

---

## 変更点一覧（v1.4 → v1.5）

1. `/docs/api/SCHEMA.md` を更新：`item_id` の**22文字base64url**固定と正規表現を明記。
2. `item_id` の **Adapter方針** をSPECに追記（旧ロジック非改変・保存直前採番・返却時保証）。
3. **Idempotency** の受け渡し/生成/保存仕様を具体化し、`/log` 内部改修計画を明記。
4. **diffs テーブル** を新設（計算ポイント・集計・SLO連携を定義）。
5. **Visual Regression** の閾値・安定化手法と調整プロセスを明記。
6. **ops/archive.md** を追加（S3運用・失敗時リトライ・IAM要件）。
7. **CI diff-gate** のワークフロー例を追加（PR自動判定の実装指針）。
