# ️ Meal‑Log App

Next‑gen food tracking app that lets users log meals by simply chatting or sending a photo. The backend analyses the image/text, estimates calories & PFC (Protein/Fat/Carbs), and stores the record in PostgreSQL so users can view daily/weekly reports.

---

## ✨ Key Features

| Category              | Details                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| **Chat Logging**      | `/log` endpoint accepts text or image uploads → AI (Gemini) estimates nutrition → reply sent back |
| **Image → Nutrition** | `services/pfc.js` (planned) runs vision model + food‑db lookup                                    |
| **AI Advice**         | Gemini generates personalised tips shown on dashboard                                             |
| **Reminders / Cron**  | Scheduled coaching messages (gentle/intense) avoiding duplicates                                  |
| **Auth**              | Passport‑local sessions stored in PG `connect-pg-simple`                                          |
| **CI / CD**           | GitHub Actions runs lint＋tests; branch protection blocks un‑green PRs                            |
| **Infra**             | Node 22 · Express · Multer · PostgreSQL · (Render.com deploy)                                     |

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
│  │   ├─ pfc.js                # image→PFC estimation
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

# 2. create .env
DATABASE_URL=postgres://localhost:5432/meal_log_db
SESSION_SECRET=dev-secret

# 3. run DB & migrations (Knex)
$ docker compose up -d db
$ npm run migrate:latest

# 4. start dev server
$ npm run dev    # nodemon
```

Visit [http://localhost:3000](http://localhost:3000)

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
