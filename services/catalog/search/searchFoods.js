const { normalizeQuery } = require('./normalize');

const DEFAULT_LIMIT = Number(process.env.CANDIDATE_LIMIT || 3);
const DEFAULT_MIN_SIM = Number(process.env.CATALOG_MIN_SIM || 0.35);

function mapRow(row) {
  const totals = {
    kcal: row.kcal_serv ?? row.kcal_100g ?? 0,
    protein_g: row.p_serv ?? row.p_100g ?? 0,
    fat_g: row.f_serv ?? row.f_100g ?? 0,
    carbs_g: row.c_serv ?? row.c_100g ?? 0,
  };
  return {
    code: row.code,
    name: row.name,
    brand: row.brand,
    lang: row.lang,
    countries: row.countries_tags,
    serving_size: row.serving_size,
    serving_qty_g: row.serving_qty_g,
    totals,
    bucket: row.bucket,
    confidence: Number(row.confidence ?? 0),
    source: 'off',
    rev: row.rev,
  };
}

async function searchFoods(
  pool,
  rawQuery,
  { limit = DEFAULT_LIMIT, minSim = DEFAULT_MIN_SIM, locale = 'ja' } = {},
) {
  const normalized = normalizeQuery(rawQuery || '');
  if (!normalized) return [];

  const finalLimit = Math.max(1, limit);
  const minSimilarity = Math.max(0, Math.min(1, minSim));

  const sql = `
    WITH params AS (
      SELECT $1::text AS q,
             $2::text AS prefix,
             $3::double precision AS min_sim,
             $4::int AS limit
    ),
    matches AS (
      SELECT p.*, 'exact'::text AS bucket, 1.0::double precision AS sim
      FROM off_products p, params
      WHERE p.name_normalized = params.q

      UNION ALL

      SELECT p.*, 'prefix'::text AS bucket, 0.0::double precision AS sim
      FROM off_products p, params
      WHERE p.name_normalized LIKE params.prefix || '%'

      UNION ALL

      SELECT p.*, 'fuzzy'::text AS bucket, similarity(p.name_normalized, params.q) AS sim
      FROM off_products p, params
      WHERE similarity(p.name_normalized, params.q) >= params.min_sim
    ),
    ranked AS (
      SELECT DISTINCT ON (code)
        code, name, name_normalized, brand, lang, countries_tags, serving_size, serving_qty_g,
        kcal_100g, p_100g, f_100g, c_100g, kcal_serv, p_serv, f_serv, c_serv, source, rev,
        bucket,
        CASE bucket
          WHEN 'exact' THEN 0.95
          WHEN 'prefix' THEN 0.75
          ELSE LEAST(0.55 + sim * 0.3, 0.9)
        END AS confidence,
        sim,
        CASE bucket WHEN 'exact' THEN 0 WHEN 'prefix' THEN 1 ELSE 2 END AS bucket_order
      FROM matches
      ORDER BY code, bucket_order, confidence DESC
    )
    SELECT *
    FROM ranked
    ORDER BY bucket_order, confidence DESC
    LIMIT (SELECT limit FROM params);
  `;

  const values = [normalized, normalized, minSimilarity, finalLimit];
  const client =
    typeof pool.connect === 'function' ? await pool.connect() : pool;
  try {
    const result = await client.query(sql, values);
    return result.rows.map(mapRow);
  } finally {
    if (client && typeof client.release === 'function') {
      client.release();
    }
  }
}

module.exports = { searchFoods };
