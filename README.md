# ️ Meal‑Log App

Next‑gen food tracking app that lets users log meals by simply chatting or sending a photo. The backend analyses the image/text, applies deterministic guards, estimates calories & PFC (Protein/Fat/Carbs), and stores the record in PostgreSQL so users can view daily/weekly reports without breaking existing UX.

---

## 📚 Documentation Hub

- [仕様 (SPEC.md)](docs/SPEC.md) — AI正規化・10ガード・Phase切替の全体像
- [テスト計画 (TESTPLAN.md)](docs/TESTPLAN.md) — RACI / CI マトリクス / フィクスチャ一覧
- [運用手順 (RUNBOOK.md)](docs/RUNBOOK.md) — Phase0〜3・ロールバック・アラート対応
- [API スキーマ](docs/api/SCHEMA.md) — `item_id` 22文字 base64url などのJSON Schema
- [ADR](docs/adr) — Atwater方針 / Never‑Zero / Dual Migration の意思決定記録
- [オペレーションメモ](docs/ops/archive.md) — Shadowテーブルのアーカイブ実行手順

---

## ✨ Key Features

| Category              | Details                                                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Chat Logging**      | `/log` endpoint accepts text or image uploads → AI正規化 → 10ガード → nutrition計算（dual write）                       |
| **Image → Nutrition** | `services/nutrition/providers/geminiProvider.js` uses Gemini API to propose items; deterministic fallbacks keep UX safe |
| **AI Advice**         | Gemini generates personalised tips shown on dashboard                                                                   |
| **Reminders / Cron**  | Scheduled coaching messages (gentle/intense) avoiding duplicates                                                        |
| **Auth**              | Passport‑local sessions stored in PG `connect-pg-simple`                                                                |
| **CI / CD**           | GitHub Actions runs lint＋tests＋diff gate; branch protection blocks un‑green PRs                                       |
| **Infra**             | Node 22 · Express · Multer · PostgreSQL · (Render.com deploy)                                                           |

---

## API Design & Data Contracts

### /log ingestion flow (Legacy互換 + 新パイプライン)

1. クライアントは `POST /log` にテキスト/画像を送信（必要に応じて `Idempotency-Key` ヘッダを付与）。
2. サーバーは既存レガシーパイプラインを保持しつつ、Feature Flag に応じて **AI正規化 → 10ガード → nutrition計算** の新経路を並走。
3. 新経路の結果は `meal_logs_v2_shadow` へ書き込み、差分は `diffs` テーブルで監視。
4. Phase2 以降は Dual Read アダプタが新DTOを旧形式に変換してレスポンス。

### Data Source of Truth

- **`meal_logs` カラム (`calories`, `protein_g`, など)**: 公式レポート・ダッシュボード向けの主権データ。Phase3以降もここが真実。
- **`ai_raw` JSON**: レガシー互換用のAIレスポンス保持。slot再計算やデバッグ用途で参照。
- **`meta` JSON**: `dict_version`・`schema_version`・`flags`・`set_proposals` など、今回の正規化で必要な付帯情報。
- **`diffs` テーブル**: Dual write中の新旧差分を保管。SLO逸脱の自動ロールバック判定に使用。

### Idempotency

- クライアントは `Idempotency-Key`（または Body の `idempotency_key`）を送ることで二重記録を防止。
- サーバーは `ingest_requests(user_id, request_key)` に保存し、再送時は当時のレスポンスを返却。
- キー未指定の場合は `userId + payload + 画像ハッシュ` をsha256化した `auto:<hex>` を生成。

---

## ️ Directory Structure (key folders)

```
meal-log-app/
├─ docs/                        # ← 新仕様・テスト・RUNBOOK/ADR/Schema/prompts
├─ services/
│  ├─ nutrition/               # AI正規化・computeロジック
│  ├─ meals.js                 # meal_logs CRUD（slotState含む）
│  └─ reminders/               # reminder services
├─ migrations/                 # Knex migrations（加法的変更＋shadow/diffs）
├─ scripts/                    # CI/ops向けスクリプト（例: simulate_dual_write）
├─ server.js                   # Express entry（/log, slot API, healthz）
├─ public/                     # static front-end assets
└─ README.md
```

---

## Local Setup

```bash
# 1. clone & install
$ git clone https://github.com/<user>/meal-log-app.git
$ cd meal-log-app && npm ci

# 2. create .env.development
#    (for local development, points to your local PostgreSQL)
#    .env.development
#    NODE_ENV=development
#    DATABASE_URL=postgresql://user:password@localhost:5432/your_db_name?sslmode=disable
#    SESSION_SECRET=dev-secret

# 3. run DB & migrations (Knex)
#    Start your local Docker PostgreSQL (if using docker-compose.yml)
$ docker compose up -d db
#    Run migrations for development environment
$ npm run migrate:dev

# 4. start dev server
$ npm run dev    # nodemon
```

Visit [http://localhost:3000](http://localhost:3000)

---

## Database Configuration & Deployment

This project uses environment variables to manage database connections across different environments (development, test, production).

- **`.env.development`**: For local development. Points to your local PostgreSQL instance.
- **`.env.test`**: For local and CI testing. Points to a dedicated test PostgreSQL instance (e.g., via Docker Compose).
- **`.env.production`**: For production deployment. Contains sensitive production database URLs.

**Key Environment Variables:**

- `DATABASE_URL`: The primary connection string for the application (e.g., Neon's Pooled connection).
- `DATABASE_URL_DIRECT`: A direct connection string for database maintenance tasks like migrations (e.g., Neon's Direct connection).
- `DB_SSL`: Set to `true` to enable SSL for the database connection. Our implementation requires `DB_SSL=true` for production.
- `DB_SSL_VERIFY`: Set to `true` to enable strict SSL certificate verification. Default is `false` (rejectUnauthorized).

**Running Migrations & Seeds:**

Use the following `npm` scripts, which automatically load the correct `.env` file and handle `DATABASE_URL` injection:

- `npm run migrate:dev`: Run migrations for development.
- `npm run seed:dev`: Run seeds for development.
- `npm run migrate:test`: Run migrations for testing.
- `npm run migrate:prod`: Run migrations for production (uses `DATABASE_URL_DIRECT`).
- `npm run seed:prod`: Run seeds for production (guarded against accidental execution).
- `npm run psql:prod -- -c '...'`: Run `psql` commands against the production database (uses `DATABASE_URL_DIRECT`).

**Deployment Health Check (`/healthz`):**

After deployment, you can check the application's health and database connectivity by accessing the `/healthz` endpoint:

```bash
curl http://your-app-url/healthz
```

- Returns `200 OK` if the application is running and can connect to the database.
- Returns `500 db_ng` if the application is running but cannot connect to the database. - **Troubleshooting `500 db_ng`:** - **Environment Variable Mismatch:** Check if `DATABASE_URL` (or `DATABASE_URL_DIRECT` for `psql` commands) is correctly set and points to the intended database. - **SSL Configuration:** Verify `DB_SSL` and `DB_SSL_VERIFY` settings match the database's requirements. - **Database Reachability:** Ensure the database host is reachable from the application's environment (e.g., network firewalls). - **Database Credentials/Permissions:** Confirm the user/password has correct access rights.

---

## CI / Branch Protection

CIは `ci.yml`（lint / unit / integration / golden / smoke）と、PR専用の `diff-gate.yml`（差分しきい値チェック）で構成されています。

1. `.github/workflows/ci.yml`
   - `npm ci`
   - `npm run lint`
   - `npm test`
   - `npm run test:integration`
   - `npm run test:e2e:smoke`

2. `.github/workflows/diff-gate.yml`
   - fixturesを用いた dual write シミュレーション
   - `scripts/check_diffs.js` で §19 閾値を超えたら PR を fail

3. Branch protection（`main`）
   - ✅ Require pull request before merging
   - ✅ Require status checks → `ci / build`, `ci / tests`, `diff-gate`

> **運用TIP**: Phaseごとの flag 切替は RUNBOOK を参照し、CIのステータスが揃ってから実施してください。

### 個人開発での進め方

- ロードマップの各項目は `/docs/IMPLEMENTATION_PLAN.md` に具体化しています。タスクを順に着手し、完了したら該当チェックボックスを更新してください。
- CIや差分チェックが未整備の段階では、`docs/TESTPLAN.md` の該当セクションに従って手動検証を実施し、結果を記録しておくと後続フェーズで自動化しやすくなります。

---

## ️ Roadmap

- [x] Basic CI pipeline & branch protection
- [x] SPEC/TESTPLAN/RUNBOOK/ADR を `/docs` に統合
- [ ] Phase0：Shadow compute + `diffs` ログ + Idempotency 保存
- [ ] Phase1：Dual write と差分監視ダッシュボード
- [ ] Phase2：Dual read（visual regression整備）
- [ ] Phase3：新パイプラインへスイッチ & Shadowアーカイブ自動化
- [ ] Staging / Production deploy on Render

---

## Contributing Workflow (for humans & Gemini CLI)

1. `git switch -c feat/<topic>`
2. Code or instruct **Gemini CLI** to code.
3. `npm run lint && npm test` locally.
4. `git push -u origin feat/<topic>` → open PR.
5. CI green + review → _Squash & merge_.

---

## License

MIT

## Local Test (Docker 5433)

```bash
docker-compose down -v
docker-compose up -d test_db
for i in {1..60}; do docker-compose exec -T test_db pg_isready -U test_user -d test_meal_log_db && break; sleep 1; done

# Migrations & Tests
npm run migrate:latest
PGHOST=127.0.0.1 PGPORT=5433 PGUSER=test_user PGPASSWORD=test_password PGDATABASE=test_meal_log_db \
npm test -- --runInBand

ENV keys

TEST_DATABASE_URL=postgres://test_user:test_password@127.0.0.1:5433/test_meal_log_db

# Nutrition Provider
NUTRITION_PROVIDER=gemini
GEMINI_MODEL=gemini-1.5-flash
GEMINI_API_KEY=your_key_here
GEMINI_MOCK=0

Nutritionix（任意 / 未設定時はダミー解析）

NUTRIX_ID=your_app_id

NUTRIX_KEY=your_app_key
```

```

```

```

```
