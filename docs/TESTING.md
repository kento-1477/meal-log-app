# Testing Matrix

## Script overview

- `npm run test:unit`
  - Runs PostgreSQL migrations against the test DB and executes Jest with `SKIP_DB=1`.
  - All suites wrapped by `describeIfDb` are skipped; use this fast path for day-to-day feedback.
- `npm run test:db`
  - Same migration prep, but forces `RUN_DB_TESTS=1`. DB-backed integration suites (logs, reminders, shadow, server, idempotency) run in full.
  - Intended for changes that touch migrations, seeds, services with DB access, or pre-release verification.

`npm test` is aliased to `npm run test:unit` to keep the default quick.

## Local workflow

1. Run `npm run test:unit` frequently while iterating.
2. When changing anything that persists data (migrations, seeds, services/\*, server.js) or before merging, run `npm run test:db` locally to catch FK/migration issues early.

## CI workflow

- Add two jobs:
  1. **unit** – execute `npm run test:unit`.
  2. **db** – spin up Postgres (e.g., docker service) and execute `npm run test:db`.
- Require both jobs to pass before merging; the db lane protects against “passes in unit mode, fails with real DB” regressions.

## Optional developer safeguards

- Consider a pre-push hook or lint rule that flags when migrations/seeds/services are touched without running `npm run test:db`.
- If `RUN_DB_TESTS` is set, the guard in `tests/jest.setup.js` automatically re-enables DB suites; otherwise they stay skipped via `describeIfDb`.

## Pre-push reminder (optional)

Integrate a simple git hook to avoid forgetting the DB pass:

    git diff --cached --name-only | grep -E '^(migrations|seeds|services/.+|server.js)' >/dev/null && {
      echo "⚠️  DB-impacting change detected. Run 'npm run test:db' before pushing." && exit 1
    } || exit 0

Drop this snippet into `.husky/pre-push` or your preferred hook runner.
