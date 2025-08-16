// src/services/nutrition/providers/geminiProvider.js
const axios = require('axios');
const { applyPortionCorrection } = require('../portion');
const { validateAndNormalize } = require('../../../utils/validateNutrition');

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
出力: {"calories":850,"protein_g":27,"fat_g":32,"carbs_g":105,"confidence":0.75,"items":[{"name":"ご飯(並)","calories":250,"protein_g":5,"fat_g":1,"carbs_g":55},{"name":"トンカツ(ロース)","calories":500,"protein_g":22,"fat_g":28,"carbs_g":15},{"name":"卵・タレ","calories":100,"protein_g":0,"fat_g":3,"carbs_g":35}]}`;

const REPAIR_INSTRUCTION = `直前の出力は無効です。以下の制約を厳守して、JSONのみを1行で出力し直してください：
- 有効なJSON / 小数1桁 / 範囲: calories 0–3000, protein/fat 0–300, carbs 0–500
- NaN/null/負値/追加テキスト/改行は禁止
- itemsは主要構成要素のみ最大3件`;

async function callGeminiApi(text, instruction = null) {
  const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const key = process.env.GEMINI_API_KEY || '';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
  const prompt = instruction
    ? `${PROMPT_V2}\n\n${instruction}\n\n入力: ${text}`
    : `${PROMPT_V2}\n\n入力: ${text}`;
  const body = { contents: [{ parts: [{ text: prompt }] }] };
  const maxRetries = 3;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const resp = await axios.post(endpoint, body, { timeout: 10000 });
      return resp.data.candidates[0].content.parts[0].text;
    } catch (err) {
      const status = err?.response?.status || 0;
      const retriable = status === 429 || (status >= 500 && status <= 599);
      if (i === maxRetries - 1 || !retriable) throw err;
      const ms = 300 * Math.pow(2, i); // 300ms, 600ms, 1200ms
      await new Promise((r) => setTimeout(r, ms));
    }
  }
}

async function analyzeText({ text }) {
  if (process.env.NODE_ENV === 'test' || process.env.GEMINI_MOCK === '1') {
    const t = (text || '').trim();
    if (t.includes('ラーメンライス'))
      return {
        calories: 850,
        protein_g: 26,
        fat_g: 26,
        carbs_g: 120,
        confidence: 0.63,
        items: [
          {
            name: 'ラーメン',
            calories: 600,
            protein_g: 18,
            fat_g: 18,
            carbs_g: 80,
          },
          {
            name: 'ライス(並)',
            calories: 250,
            protein_g: 8,
            fat_g: 8,
            carbs_g: 40,
          },
        ],
      };
    if (t.includes('カツ丼'))
      return {
        calories: 850,
        protein_g: 27,
        fat_g: 32,
        carbs_g: 105,
        confidence: 0.75,
        items: [
          {
            name: 'ご飯(並)',
            calories: 250,
            protein_g: 5,
            fat_g: 1,
            carbs_g: 55,
          },
          {
            name: 'トンカツ(ロース)',
            calories: 500,
            protein_g: 22,
            fat_g: 28,
            carbs_g: 15,
          },
          {
            name: '卵・タレ',
            calories: 100,
            protein_g: 0,
            fat_g: 3,
            carbs_g: 35,
          },
        ],
      };
    return {
      calories: 500,
      protein_g: 20,
      fat_g: 15,
      carbs_g: 60,
      confidence: 0.5,
      items: [],
    };
  }

  const { textWithoutModifiers } = applyPortionCorrection(text, {
    calories: 0,
    protein_g: 0,
    fat_g: 0,
    carbs_g: 0,
  });

  try {
    let responseText = await callGeminiApi(textWithoutModifiers);
    let nutrition = JSON.parse(responseText);

    // 最低限のスキーマ妥当性チェック（数値/範囲/NaN）
    const invalid =
      typeof nutrition !== 'object' ||
      nutrition === null ||
      ['calories', 'protein_g', 'fat_g', 'carbs_g', 'confidence'].some(
        (k) => typeof nutrition[k] !== 'number' || Number.isNaN(nutrition[k]),
      ) ||
      nutrition.calories < 0 ||
      nutrition.calories > 3000 ||
      nutrition.protein_g < 0 ||
      nutrition.protein_g > 300 ||
      nutrition.fat_g < 0 ||
      nutrition.fat_g > 300 ||
      nutrition.carbs_g < 0 ||
      nutrition.carbs_g > 500 ||
      nutrition.confidence < 0 ||
      nutrition.confidence > 1;

    if (invalid) {
      responseText = await callGeminiApi(
        textWithoutModifiers,
        REPAIR_INSTRUCTION,
      );
      nutrition = JSON.parse(responseText);
    }

    const { correctedNutrition } = applyPortionCorrection(text, nutrition); // 取得後に倍率適用
    return validateAndNormalize(correctedNutrition);
  } catch (_error) {
    console.warn('Gemini API call failed, falling back.', _error);
    // Fallback heuristics
    if (text.includes('ラーメン'))
      return {
        calories: 600,
        protein_g: 18,
        fat_g: 18,
        carbs_g: 80,
        confidence: 0.2,
        items: [],
      };
    if (text.includes('牛丼'))
      return {
        calories: 700,
        protein_g: 25,
        fat_g: 20,
        carbs_g: 100,
        confidence: 0.2,
        items: [],
      };
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

module.exports = { analyzeText };
