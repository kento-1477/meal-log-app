// src/services/nutrition/index.js
const geminiProvider = require('./providers/geminiProvider');

const providers = {
  gemini: geminiProvider,
  // nutritionix: nutritionixProvider, // Future provider
};

async function analyze({ text }) {
  const providerName = process.env.NUTRITION_PROVIDER || 'gemini';
  const provider = providers[providerName];

  if (!provider) {
    throw new Error(`Nutrition provider '${providerName}' not found.`);
  }

  return provider.analyzeText({ text });
}

module.exports = { analyze };
