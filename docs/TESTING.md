# Testing Matrix

## Script overview

- `npm run test:unit`
  - Runs Jest with `RUN_DB_TESTS` disabled, so any suite wrapped by `describeIfDb` is skipped.
  - Use this fast path for everyday development when you do not need a real database.
- `npm run test:db:prep`
  - Invokes `knex` to rollback all test migrations, re-apply them, and run seeds in the `.env.test` environment.
  - Ensures a clean and up-to-date schema before executing DB-backed tests.
- `npm run test:db`
  - Executes Jest with `RUN_DB_TESTS=1`, enabling the DB integration suites (logs, reminders, shadow, server, idempotency, etc.).
  - Assumes `npm run test:db:prep` has been run first.
- `npm run test:all`
  - Convenience combo: runs `test:unit`, then `test:db:prep`, then `test:db`.

`npm test` is aliased to `npm run test:unit` so the default remains quick.

## Local workflow

1. Run `npm run test:unit` frequently while iterating.
2. When touching migrations, seeds, or Postgres-backed services—or before merging—run `npm run test:db:prep` followed by `npm run test:db` to catch schema/data issues early.

## CI workflow

- Add two jobs:
  1. **unit** – execute `npm run test:unit`.
  2. **db** – provision Postgres, run `npm run test:db:prep`, then `npm run test:db`.
- Require both jobs to succeed before merging; the DB lane prevents “passes locally, fails with real DB” regressions.

## Optional developer safeguards

- Consider a pre-push hook or lint rule that flags migrations/seeds/service changes when `npm run test:db:prep && npm run test:db` has not been executed.
- `tests/jest.setup.js` only enables `describeIfDb` suites when `RUN_DB_TESTS=1`, so forgetting the DB pass means those suites silently skip.

## Pre-push reminder (optional)

Integrate a simple git hook to avoid forgetting the DB pass:

```
git diff --cached --name-only | grep -E '^(migrations|seeds|services/.+|server.js)' >/dev/null && {
  echo "⚠️  DB-impacting change detected. Run 'npm run test:db:prep && npm run test:db' before pushing." && exit 1
} || exit 0
```

Drop this snippet into `.husky/pre-push` or your preferred hook runner.
