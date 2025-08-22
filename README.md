# ️ Meal‑Log App

Next‑gen food tracking app that lets users log meals by simply chatting or sending a photo. The backend analyses the image/text, estimates calories & PFC (Protein/Fat/Carbs), and stores the record in PostgreSQL so users can view daily/weekly reports.

---

## ✨ Key Features

| Category              | Details                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| **Chat Logging**      | `/log` endpoint accepts text or image uploads → AI (Gemini) estimates nutrition → reply sent back |
| **Image → Nutrition** | `services/nutrition/providers/geminiProvider.js` uses Gemini API to estimate PFC from text.       |
| **AI Advice**         | Gemini generates personalised tips shown on dashboard                                             |
| **Reminders / Cron**  | Scheduled coaching messages (gentle/intense) avoiding duplicates                                  |
| **Auth**              | Passport‑local sessions stored in PG `connect-pg-simple`                                          |
| **CI / CD**           | GitHub Actions runs lint＋tests; branch protection blocks un‑green PRs                            |
| **Infra**             | Node 22 · Express · Multer · PostgreSQL · (Render.com deploy)                                     |

---

## API Design & Data Contracts

### Data Source of Truth

When handling nutrition data, it's important to understand the source of truth:

- **Database Columns (`calories`, `protein_g`, etc.):** These columns in the `meal_logs` table are considered the **source of truth** for core nutritional values. They are used for official reporting, dashboard calculations, and any other critical feature.
- **`ai_raw` JSON Column:** This column stores the complete, raw JSON response from the AI nutrition analysis, including the calculated breakdown of items. Its primary purposes are:
  1.  **History & Debugging:** To keep a record of what the AI returned for a given request.
  2.  **Recalculation:** To provide the necessary data for the `/log/choose-slot` endpoint, which allows users to adjust meal components and recalculate nutrition without calling the AI again.

In summary: The individual columns are the authority for core data, while `ai_raw` is a historical record and a payload for secondary operations.

---

## ️ Directory Structure (after refactor)

```
meal-log-app/
├─ .github/workflows/ci.yml      # GitHub Actions
├─ src/
│  ├─ routes/
│  │   ├─ chat.js               # /log, /api/meal-data …
│  │   ├─ reminder.js           # cron endpoints
│  │   └─ auth.js
│  ├─ services/
│  │   ├─ nutrition/            # Nutrition analysis provider
│  │   │  ├─ providers/geminiProvider.js
│  │   │  └─ index.js
│  │   └─ mealLog.js            # DB layer
│  ├─ models/                   # ORMapper definitions
│  └─ server.js                 # app initialiser
├─ migrations/                  # Knex migration files
├─ public/                      # static front‑end
└─ README.md                    # ← this file
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

## CI / Branch Protection (WHAT WE ARE DOING NOW)

1. `.github/workflows/ci.yml` runs on **push & PR**, executing:

   ```yaml
   - npm ci
   - npm test # echo until tests are written
   ```

2. GitHub Settings → Branches → **Add classic branch protection rule** for `main`:
   - ✅ Require pull request before merging
   - ✅ Require status checks to pass → **`ci-test / test`**

3. Effect: PR stays un‑mergeable until CI is green.

> **Next milestone**: write real Jest + Supertest tests for `/log`.

---

## ️ Roadmap

- [x] Basic CI pipeline ✅
- [x] Branch protection rules ✅
- [ ] Split `server.js` into routes/services
- [ ] Implement Knex migrations & seeding
- [ ] Finish `services/pfc.js` (image model)
- [ ] Dashboard charts & goal tracking
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
