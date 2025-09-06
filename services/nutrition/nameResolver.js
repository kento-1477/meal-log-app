const nameMap = require('../../src/data/food_names.json');

/**
 * Resolves display names for a list of food items.
 * If an item's name is the same as its code, it attempts to replace it
 * with a user-friendly Japanese name from the map.
 * @param {Array<object>} items - The array of food items.
 * @returns {Array<object>} The array of food items with resolved names.
 */
function resolveNames(items = []) {
  if (!items || items.length === 0) {
    return [];
  }

  return items.map((item) => {
    // Only resolve if the name is currently just the code
    if (item.name === item.code && nameMap[item.code]) {
      return {
        ...item,
        name: nameMap[item.code],
      };
    }
    return item;
  });
}

module.exports = { resolveNames };
