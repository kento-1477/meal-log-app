#!/usr/bin/env node
/**
 * check_diffs.js
 * ----------------------------------
 * Evaluates diff output produced by simulate_dual_write.js against Spec §19 thresholds.
 *
 * Usage: node scripts/check_diffs.js <diffs.json>
 */

const fs = require('fs');
const path = require('path');

function usage(msg) {
  if (msg) console.error(msg);
  console.error('Usage: node scripts/check_diffs.js <diffs.json>');
  process.exit(1);
}

function loadDiffs(filePath) {
  const resolved = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolved)) {
    usage(`Diff file not found: ${resolved}`);
  }
  const raw = fs.readFileSync(resolved, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (Array.isArray(parsed.records)) {
      return parsed.records;
    }
    usage('Diff JSON must be an array or { records: [] }');
  } catch (err) {
    usage(`Failed to parse diff JSON: ${err.message}`);
  }
}

function thresholds(legacy) {
  const kcal = Math.abs(Number(legacy.calories ?? 0));
  return {
    dkcal: Math.max(40, 0.08 * kcal),
    dp: 4,
    df: 5,
    dc: 6,
    rel_p: 0.12,
    rel_f: 0.12,
    rel_c: 0.12,
  };
}

function evaluate(records) {
  const failures = [];
  records.forEach((rec) => {
    const legacy = rec.legacy || {};
    const diff = rec.diff || {};
    const limit = thresholds(legacy);

    const breaches = [];
    const pushBreach = (field, value, limitValue) => {
      breaches.push({ field, value, limit: limitValue });
    };

    if (Math.abs(diff.dkcal || 0) > limit.dkcal) {
      pushBreach('dkcal', diff.dkcal, limit.dkcal);
    }
    if (Math.abs(diff.dp || 0) > limit.dp) {
      pushBreach('dp', diff.dp, limit.dp);
    }
    if (Math.abs(diff.df || 0) > limit.df) {
      pushBreach('df', diff.df, limit.df);
    }
    if (Math.abs(diff.dc || 0) > limit.dc) {
      pushBreach('dc', diff.dc, limit.dc);
    }

    if (diff.rel_p != null && Math.abs(diff.rel_p) > limit.rel_p) {
      pushBreach('rel_p', diff.rel_p, limit.rel_p);
    }
    if (diff.rel_f != null && Math.abs(diff.rel_f) > limit.rel_f) {
      pushBreach('rel_f', diff.rel_f, limit.rel_f);
    }
    if (diff.rel_c != null && Math.abs(diff.rel_c) > limit.rel_c) {
      pushBreach('rel_c', diff.rel_c, limit.rel_c);
    }

    if (breaches.length) {
      failures.push({ id: rec.id, breaches });
    }
  });
  return failures;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) usage();
  const records = loadDiffs(args[0]);
  const failures = evaluate(records);
  if (failures.length) {
    console.error('Diff threshold breaches detected:');
    failures.forEach((f) => {
      console.error(` - ${f.id}:`);
      f.breaches.forEach((b) => {
        console.error(
          `    ${b.field} value ${b.value} exceeds limit ${b.limit}`,
        );
      });
    });
    process.exit(1);
  }
  console.log('Diffs within thresholds');
}

main();
