const { parse } = require('./schema');
const { sanitize } = require('./sanitize');
const { reconcile } = require('./reconcile');
const { zeroFloor } = require('./zeroFloor');

const DEFAULT_GUARDRAIL_VERSION =
  process.env.GUARDRAIL_VERSION || '2025-09-25-a';

function createGuardrailRunner({ version } = {}) {
  const guardrailVersion = version || DEFAULT_GUARDRAIL_VERSION;

  function run(raw, context = {}) {
    const parsed = parse(raw);
    const sanitized = sanitize(parsed, context);
    const reconciled = reconcile(sanitized, context);
    const floored = zeroFloor(reconciled, {
      ...context,
      minKcal: context.minKcal,
      maxKcal: context.maxKcal,
    });

    const warnings = Array.from(new Set(floored.warnings || []));
    return {
      ...floored,
      warnings,
      meta: {
        ...(floored.meta || {}),
        guardrail_version: guardrailVersion,
      },
    };
  }

  return { run, version: guardrailVersion };
}

module.exports = {
  createGuardrailRunner,
  GUARDRAIL_VERSION: DEFAULT_GUARDRAIL_VERSION,
};
