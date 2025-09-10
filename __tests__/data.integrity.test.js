const archetypes = require('../src/data/archetypes.json');
const { computeFromItems } = require('../services/nutrition/compute');

describe('Data Integrity', () => {
  it('should have nutrition coefficients (PER_G) for all food codes used in archetypes', () => {
    const allArchetypeCodes = new Set();

    archetypes.archetypes.forEach((archetype) => {
      Object.values(archetype.portions).forEach((portion) => {
        Object.keys(portion).forEach((code) => {
          allArchetypeCodes.add(code);
        });
      });
    });

    const codesWithMissingCoefficients = [];

    for (const code of allArchetypeCodes) {
      const { warnings } = computeFromItems([
        { code, qty_g: 100, pending: false },
      ]);
      if (warnings.length > 0) {
        codesWithMissingCoefficients.push(code);
      }
    }

    expect(codesWithMissingCoefficients).toEqual([]);
  });
});
