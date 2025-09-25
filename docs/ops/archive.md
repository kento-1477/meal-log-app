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

## 失敗時の対応

- コマンドが失敗した場合は3回まで自動リトライ。
- `aws s3 cp` で 403 が発生したら IAM ロールを確認。
- 連続失敗時は PagerDuty へエスカレーションし、手動でバックアップを取得。
