# ops/ingest_requests_cleanup.md — IdempotencyキャッシュのTTL

## 概要

`ingest_requests` は Idempotency-Key の応答キャッシュです。無期限に残す必要はなく、90日を越えたレコードは削除します。

## 実行スケジュール

- 毎日 02:45 JST に実行。
- 失敗した場合は PagerDuty 告知 → 手動再実行。

## コマンド例

```bash
PG_URL_RO="postgres://..." psql "$PG_URL_RO" -c "
  DELETE FROM ingest_requests
   WHERE created_at < now() - interval '90 days';
"
```

## 注意

- `created_at` にインデックスがあるため、削除は O(log n) で走ります。
- ジョブ完了後に削除件数をメトリクスへ記録し、異常値を監視してください。
