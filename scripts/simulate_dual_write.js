#!/usr/bin/env node
/**
 * simulate_dual_write.js
 * ----------------------------------
 * Reads fixture JSON (array) describing legacy and candidate totals, computes diffs,
 * and optionally writes them to a file. This is a lightweight approximation used by diff-gate CI.
 *
 * Expected fixture format (array of objects):
 * [
 *   {
 *     "id": "record-1",
 *     "legacy": { "calories": 600, "protein_g": 20, "fat_g": 18, "carbs_g": 70 },
 *     "candidate": { "calories": 620, "protein_g": 22, "fat_g": 19, "carbs_g": 72 },
 *     "meta": { "date": "2025-09-17", "phase": "P0" }
 *   }
 * ]
 */

const fs = require('fs');
const path = require('path');

function usage(msg) {
  if (msg) console.error(msg);
  console.error(
    'Usage: node scripts/simulate_dual_write.js <fixture.json> [--write-diffs <out.json>]',
  );
  process.exit(1);
}

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.length === 0) usage();
  const fixturePath = args[0];
  let writePath = null;
  for (let i = 1; i < args.length; i += 1) {
    const flag = args[i];
    if (flag === '--write-diffs') {
      writePath = args[i + 1];
      i += 1;
    } else {
      usage(`Unknown argument: ${flag}`);
    }
  }
  if (!writePath) {
    writePath = path.resolve(process.cwd(), 'tmp', 'diffs.json');
  }
  return { fixturePath, writePath };
}

function loadFixture(filePath) {
  const resolved = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolved)) {
    usage(`Fixture not found: ${resolved}`);
  }
  const raw = fs.readFileSync(resolved, 'utf8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    usage(`Failed to parse fixture JSON: ${err.message}`);
  }
  if (!Array.isArray(data)) {
    usage('Fixture must be an array of entries.');
  }
  return data;
}

function toTotals(obj = {}) {
  return {
    calories: Number(obj.calories ?? 0),
    protein_g: Number(obj.protein_g ?? 0),
    fat_g: Number(obj.fat_g ?? 0),
    carbs_g: Number(obj.carbs_g ?? 0),
  };
}

function buildDiff(entry, index) {
  if (!entry || typeof entry !== 'object') {
    throw new Error(`Entry at index ${index} is not an object`);
  }
  if (!entry.legacy || !entry.candidate) {
    throw new Error(
      `Entry at index ${index} must contain legacy and candidate objects`,
    );
  }

  const legacy = toTotals(entry.legacy);
  const candidate = toTotals(entry.candidate);
  const diff = {
    dkcal: Math.round(candidate.calories - legacy.calories),
    dp: candidate.protein_g - legacy.protein_g,
    df: candidate.fat_g - legacy.fat_g,
    dc: candidate.carbs_g - legacy.carbs_g,
  };

  const rel = (delta, base) => {
    if (!Number.isFinite(base) || base === 0) return null;
    return delta / base;
  };

  return {
    id: entry.id || `record-${index + 1}`,
    phase: entry.meta?.phase || 'P0',
    user_id: entry.meta?.user_id || null,
    log_id: entry.meta?.log_id || null,
    date: entry.meta?.date || null,
    legacy,
    candidate,
    diff: {
      ...diff,
      rel_p: rel(diff.dp, legacy.protein_g),
      rel_f: rel(diff.df, legacy.fat_g),
      rel_c: rel(diff.dc, legacy.carbs_g),
    },
  };
}

function main() {
  const { fixturePath, writePath } = parseArgs();
  const entries = loadFixture(fixturePath);
  const results = entries.map(buildDiff);

  const outDir = path.dirname(writePath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  fs.writeFileSync(writePath, JSON.stringify({ records: results }, null, 2));
  console.log(`Simulated diffs written to ${writePath}`);
}

main();
