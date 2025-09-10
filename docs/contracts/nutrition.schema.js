/**
 * @typedef {object} AnalyzedItem
 * Represents a single food item within a dish, as analyzed by the nutrition service.
 *
 * @property {string | null} code - The canonical food ID from the dictionary (e.g., 'rice_cooked'). Null if the item is not recognized.
 * @property {string} name - The display name of the food item (e.g., 'ご飯').
 * @property {number | null} qty_g - The quantity of the item in grams.
 * @property {boolean} [include=true] - Legacy flag to include the item in calculations. Superseded by the `pending` flag.
 * @property {boolean} [pending=false] - If true, this item is an unconfirmed suggestion and should not be included in the final nutrition calculation until confirmed by the user.
 * @property {number} [confidence=1] - The confidence score for the identification of this specific item, from 0 to 1.
 */

/**
 * @typedef {object} NutritionAnalysisResponse
 * The structured response from the nutrition analysis endpoint.
 *
 * @property {string} dish - The name of the overall dish as understood by the service.
 * @property {number} confidence - The overall confidence score for the entire analysis, from 0 to 1. This is 0 if any item is pending.
 * @property {AnalyzedItem[]} items - The list of food items identified in the dish.
 */

// This file is for documentation purposes and does not export any runtime code.
module.exports = {};
