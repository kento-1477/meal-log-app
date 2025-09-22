const {
  adaptShadowToLegacy,
} = require('../services/nutrition/adapters/dtoAdapter');

const cases = require('../fixtures/dual_read/cases.json');

describe('adaptShadowToLegacy', () => {
  cases.forEach(({ name, shadow, expected }) => {
    it(`transforms shadow DTO: ${name}`, () => {
      const result = adaptShadowToLegacy(shadow);
      expect(result).toEqual(expected);
      const items = result.breakdown.items;
      expect(Array.isArray(items)).toBe(true);
      items.forEach((item) => {
        expect(typeof item.item_id).toBe('string');
        expect(item.item_id).toHaveLength(22);
        expect(item.item_id).toMatch(/^[A-Za-z0-9_-]{22}$/);
      });
    });
  });

  it('throws when shadowDto is not an object', () => {
    expect(() => adaptShadowToLegacy(null)).toThrow(TypeError);
    expect(() => adaptShadowToLegacy(undefined)).toThrow(TypeError);
    expect(() => adaptShadowToLegacy('invalid')).toThrow(TypeError);
  });
});
