const archetypesData = require('../../src/data/archetypes.json');

function buildSlots(items = [], archetypeId = null) {
  const slots = {};

  if (archetypeId) {
    const archetype = archetypesData.archetypes.find(
      (a) => a.id === archetypeId,
    );
    if (archetype && archetype.portions) {
      const portionKeys = Object.keys(archetype.portions);
      if (portionKeys.length > 1) {
        // Only create a slot if there are multiple options
        slots.portion_size = {
          key: 'portion_size',
          question: '量を選んでください',
          options: portionKeys,
          selected: archetype.defaults.portion || portionKeys[0],
          unit: '', // Unit is implied by the portion (e.g., 'regular')
        };
      }
    }
  }

  return slots;
}

function applySlot(items, { key, value }, archetypeId = null) {
  const out = items.map((x) => ({ ...x })); // Create a shallow copy

  if (key === 'portion_size' && archetypeId) {
    const archetype = archetypesData.archetypes.find(
      (a) => a.id === archetypeId,
    );
    if (archetype && archetype.portions && archetype.portions[value]) {
      const selectedPortionItems = archetype.portions[value];
      const updatedItemCodes = new Set();

      // Update existing items and mark them as confirmed
      for (const item of out) {
        if (selectedPortionItems[item.code]) {
          item.qty_g = selectedPortionItems[item.code];
          item.pending = false;
          updatedItemCodes.add(item.code);
        }
      }

      // Add new items from the selected portion that were not originally present
      for (const code in selectedPortionItems) {
        if (!updatedItemCodes.has(code)) {
          out.push({
            code: code,
            qty_g: selectedPortionItems[code],
            pending: false, // Newly added items are confirmed by portion selection
            include: true, // Ensure it's included
            name: code, // Placeholder, will be resolved by nameResolver
          });
        }
      }
    }
  } else if (key === 'rice_size') {
    // Keep old logic for now, will remove later
    const idx = out.findIndex((i) => i.code === 'rice_cooked');
    if (idx >= 0) {
      out[idx].qty_g = Number(value);
      out[idx].pending = false; // Mark as confirmed
    }
  } else if (key === 'pork_cut') {
    // Keep old logic for now, will remove later
    const v = String(value).trim().toLowerCase();
    const isFillet = ['ヒレ', 'ﾋﾚ', 'ﾌｨﾚ', 'フィレ', 'fillet', 'filet'].some(
      (s) => s.toLowerCase() === v,
    );
    const target = isFillet ? 'pork_fillet_cutlet' : 'pork_loin_cutlet';

    const idx = out.findIndex((it) => (it.code || '').startsWith('pork_'));
    if (idx >= 0) {
      out[idx].code = target;
      out[idx].pending = false; // Mark as confirmed
    }
    // This else block was misplaced and caused a syntax error.
    // Its logic also seems to depend on 'target' which is only defined within this 'pork_cut' block.
    // If pork item doesn't exist, add it as confirmed
    // out.push({ code: target, qty_g: 120, include: true, pending: false });
  }
  return out;
}

module.exports = { buildSlots, applySlot };
