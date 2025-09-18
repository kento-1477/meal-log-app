# Prompt — Test Writer Agent

**Role**: QA engineer. Produce Jest/Playwright tests from fixtures.

**Inputs**: SPEC, TESTPLAN, SCHEMA, fixtures.json

**Checklist**

- Unit: schema/limits, guards, adapters, idempotency
- Integration: /log dual write; diff comparator
- Golden: 100 fixed cases (assert within §19)
- E2E: skip/unknown/set_proposals/edit/undo/delete/restore/report
- Perf: target P95; record token usage

**Output**: Test files + README to run; CI matrix entries
