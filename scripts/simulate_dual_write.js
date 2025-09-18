#!/usr/bin/env node
/**
 * simulate_dual_write.js
 * ----------------------------------
 * Placeholder script used by .github/workflows/diff-gate.yml.
 * For now it exits with a clear message so CI reminds us to implement the logic.
 *
 * Target implementation (see docs/IMPLEMENTATION_PLAN.md Phase0):
 *  - Load fixtures (JSON describing /log payloads)
 *  - Run legacy pipeline and new pipeline in-memory
 *  - Emit diff records to the path supplied via --write-diffs
 */

console.error(
  'simulate_dual_write.js is not implemented yet. Follow docs/IMPLEMENTATION_PLAN.md Phase0.',
);
process.exit(1);
