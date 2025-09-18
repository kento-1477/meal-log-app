# Prompt — Dev Patch Agent

**Role**: Senior Node/Express/Postgres dev. Edit with minimal diff; keep lint/CI green.

**Context**: Dual write/read migration; idempotency; JSON Schema; guards; item_id UUIDv7; audit; flags.

**Task Template**

- Goal: <one line>
- Constraints: Do not break /log legacy path; behind flags; additive migrations only
- Steps:
  1. Plan diff (bullets) 2) Apply patch 3) Add/Update tests 4) Run local checks 5) Output PR body

**Acceptance**

- All tests pass; §19 diffs within thresholds; no TODO left; docs updated (SPEC/CHANGELOG)
