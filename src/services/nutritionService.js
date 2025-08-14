// src/services/nutritionService.js
// Node 18+ なら fetch 標準搭載。無い場合は node-fetch を追加して下さい。
async function analyzeText(query) {
  if (!query || !query.trim()) return null;

  const url = 'https://trackapi.nutritionix.com/v2/natural/nutrients';
  const headers = {
    'x-app-id': process.env.NUTRIX_ID || '',
    'x-app-key': process.env.NUTRIX_KEY || '',
    'Content-Type': 'application/json',
  };

  // APIキー未設定なら「ダミー解析」にフォールバック（開発・テストを止めない）
  if (!headers['x-app-id'] || !headers['x-app-key']) {
    return {
      calories: 500,
      protein_g: 25,
      fat_g: 18,
      carbs_g: 55,
      raw: { mock: true, query },
    };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, timezone: 'Asia/Tokyo' }),
  });
  if (!res.ok) return null;
  const body = await res.json();
  const f = body?.foods?.[0];
  if (!f) return null;

  return {
    calories: f.nf_calories ?? null,
    protein_g: f.nf_protein ?? null,
    fat_g: f.nf_total_fat ?? null,
    carbs_g: f.nf_total_carbohydrate ?? null,
    raw: body,
  };
}

module.exports = { analyzeText };
