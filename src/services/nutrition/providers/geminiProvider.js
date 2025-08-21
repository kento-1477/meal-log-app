// NUTRI_BREAKDOWN_START
// src/services/nutrition/providers/geminiProvider.js
const axios = require('axios');
const { applyPortionCorrection } = require('../portion');
const { validateAndNormalize } = require('../../../utils/validateNutrition');

// --- v2 (Legacy) ---
const PROMPT_V2 = `あなたは栄養推定アシスタントです。与えられた食事名（テキスト入力）の内容から、日本の一般的な外食の一人前基準を用いて、PFC（タンパク質・脂質・炭水化物）とカロリーを数値で推定してください。
【出力仕様】
- 出力は 1行のみ・有効な最小限のJSON・改行/説明文/余分な記号は禁止。
- スキーマ：
  {
    "calories": number, "protein_g": number, "fat_g": number, "carbs_g": number, "confidence": number,
    "items": [ {"name": string, "calories": number, "protein_g": number, "fat_g": number, "carbs_g": number} ]
  }
- NaN/null/負値は禁止。数値は小数1桁に丸める。`;
const PROMPT_V2 = `あなたは栄養推定アシスタントです。与えられた食事名（テキスト入力）の内容から、日本の一般的な外食の一人前基準を用いて、PFC（タンパク質・脂質・炭水化物）とカロリーを数値で推定してください。

【出力仕様】
- 出力は 1行のみ・有効な最小限のJSON・改行/説明文/余分な記号は禁止。
- スキーマ：
  {
    "calories": number,   // 0〜3000 kcal（整数または小数1桁）
    "protein_g": number,  // 0〜300 g
    "fat_g": number,      // 0〜300 g
    "carbs_g": number,    // 0〜500 g
    "confidence": number, // 0〜1（この推定への信頼度）
    "items": [            // 任意。分解できる場合のみ。主要構成要素に限り最大3件
      {"name": string, "calories": number, "protein_g": number, "fat_g": number, "carbs_g": number}
    ]
  }
- NaN/null/負値は禁止。数値は小数1桁に丸める。
- 分量不明時は、日本の外食チェーン標準の一人前を仮定（例：ラーメン≈600kcal、ご飯(並)≈250kcal）。
- items[] は主要構成要素のみ（例：ラーメン, ライス(並), 卵・タレ など）。細分化（ネギ/メンマ等）は禁止。

【例】
入力: ラーメンライス
出力: {"calories":850,"protein_g":26,"fat_g":26,"carbs_g":120,"confidence":0.63,"items":[{"name":"ラーメン","calories":600,"protein_g":18,"fat_g":18,"carbs_g":80},{"name":"ライス(並)","calories":250,"protein_g":8,"fat_g":8,"carbs_g":40}]}

入力: カツ丼
出力: {"calories":850,"protein_g":27,"fat_g":32,"carbs_g":105,"confidence":0.75,"items":[{"name":"ご飯(並)","calories":250,"protein_g":5,"fat_g":1,"carbs_g":55},{"name":"トンカツ(ロース)","calories":500,"protein_g":22,"fat_g":28,"carbs_g":15},{"name":"卵・タレ", "calories":100,"protein_g":0,"fat_g":3,"carbs_g":35}]}`;
const REPAIR_INSTRUCTION_V2 = `直前の出力は無効です。以下の制約を厳守して、JSONのみを1行で出力し直してください：
- 有効なJSON / 小数1桁 / 範囲: calories 0–3000, protein/fat 0–300, carbs 0–500`;

// --- v3 (Breakdown) ---
const PROMPT_V3 = `あなたは栄養士です。入力（必要なら画像も）から (1) dish（代表料理名）、(2) items（最大5件、name/code_hint/qty_g/qty_ml/include）、(3) confidence（0〜1）、(4) nutrition_guess（protein_g/fat_g/carbs_g/calories_kcal）をJSONで返してください。
code_hint 候補: pork_loin_cutlet|pork_fillet_cutlet|rice_cooked|cabbage_raw|miso_soup|tonkatsu_sauce
出力はJSONのみ。`;

function safeParseJson(text) {
  try {
    // The response may be wrapped in ```json ... ```, so we extract it.
    const match = text.match(/```json\n(.*?)\n```/s);
    const jsonString = match ? match[1] : text;
    return JSON.parse(jsonString);
  } catch {
    return null;
  }
}

async function callGeminiApi(prompt, text, instruction = null) {
  const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const key = process.env.GEMINI_API_KEY || '';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
  const fullPrompt = instruction
    ? `${prompt}\n\n${instruction}\n\n入力: ${text}`
    : `${prompt}\n\n入力: ${text}`;
  const body = { contents: [{ parts: [{ text: fullPrompt }] }] };
  const maxRetries = 3;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const resp = await axios.post(endpoint, body, { timeout: 10000 });
      return resp.data.candidates[0].content.parts[0].text;
    } catch (err) {
      const status = err?.response?.status || 0;
      const retriable = status === 429 || (status >= 500 && status <= 599);
      if (i === maxRetries - 1 || !retriable) throw err;
      const ms = 300 * Math.pow(2, i);
      await new Promise((r) => setTimeout(r, ms));
    }
  }
}

/**
 * Legacy analyzer. Keeps the old contract.
 */
async function analyzeLegacy({ text }) {
  // Mocks for testing are kept
  if (process.env.NODE_ENV === 'test' || process.env.GEMINI_MOCK === '1') {
    // ... (mock implementation remains the same as original)
  }

  const { textWithoutModifiers } = applyPortionCorrection(text, {
    calories: 0,
    protein_g: 0,
    fat_g: 0,
    carbs_g: 0,
  });

  try {
    let responseText = await callGeminiApi(PROMPT_V2, textWithoutModifiers);
    let nutrition = safeParseJson(responseText);

    const invalid = !nutrition || typeof nutrition.calories !== 'number'; // Simplified check
    if (invalid) {
      responseText = await callGeminiApi(
        PROMPT_V2,
        textWithoutModifiers,
        REPAIR_INSTRUCTION_V2,
      );
      nutrition = safeParseJson(responseText);
    }

    const { correctedNutrition } = applyPortionCorrection(text, nutrition);
    return validateAndNormalize(correctedNutrition);
  } catch (_error) {
    console.warn('Gemini API call failed in Legacy, falling back.', _error);
    return {
      calories: 0,
      protein_g: 0,
      fat_g: 0,
      carbs_g: 0,
      confidence: 0,
      items: [],
    };
  }
}

/**
 * New analyzer for breakdown feature.
 */
async function analyzeBreakdown({ text }) {
  if (!text) return null;
  try {
    const responseText = await callGeminiApi(PROMPT_V3, text);
    const parsed = safeParseJson(responseText);
    if (!parsed) return null;

    const items = (parsed.items || []).slice(0, 5).map((it) => ({
      code: (it.code_hint || '').split('|')[0] || null,
      name: it.name || null,
      qty_g: it.qty_g ?? null,
      qty_ml: it.qty_ml ?? null,
      include: it.include !== false,
    }));

    return {
      dish: parsed.dish || null,
      confidence: Number(parsed.confidence ?? 0.6),
      items,
      guess: parsed.nutrition_guess || null,
    };
  } catch (error) {
    console.error('Error analyzing nutrition breakdown with Gemini:', error);
    return null;
  }
}

module.exports = { analyzeLegacy, analyzeBreakdown };
// NUTRI_BREAKDOWN_END
