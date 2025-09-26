const fs = require('fs');
const readline = require('readline');
const { parseServingSize } = require('./parseServing');
const { normalizeQuery } = require('../search/normalize');

function extractName(product) {
  if (!product) return null;
  if (typeof product.product_name === 'string' && product.product_name.trim()) {
    return product.product_name.trim();
  }
  const translations = product.product_name_translations;
  if (translations) {
    if (translations.ja) return translations.ja;
    if (translations.en) return translations.en;
  }
  if (Array.isArray(product.generic_name_translations)) {
    return product.generic_name_translations[0];
  }
  return null;
}

function extractBrand(product) {
  if (!product) return null;
  if (typeof product.brands === 'string') {
    return product.brands.split(',')[0].trim();
  }
  return null;
}

function matchesLang(product, filterLangs) {
  if (!filterLangs || filterLangs.length === 0) return true;
  const lang = product.lang || product.language || null;
  const langs = new Set(
    []
      .concat(product.languages_tags || [])
      .map((l) => String(l).split(':').pop())
      .filter(Boolean),
  );
  if (lang) langs.add(lang);
  return filterLangs.some((target) => langs.has(target));
}

function matchesCountry(product, filterCountries) {
  if (!filterCountries || filterCountries.length === 0) return true;
  const countries = new Set(
    []
      .concat(product.countries_tags || [])
      .map((c) => String(c).split(':').pop())
      .filter(Boolean),
  );
  return filterCountries.some((target) => countries.has(target));
}

function extractNutriments(n) {
  if (!n) return {};
  const kcal100 =
    Number(n['energy-kcal_100g'] ?? n.energy_kcal_100g ?? n['energy_100g']) ||
    0;
  const protein100 = Number(n.proteins_100g ?? n['proteins_100g']) || 0;
  const fat100 = Number(n.fat_100g ?? n['fat_100g']) || 0;
  const carbs100 = Number(n.carbohydrates_100g ?? n['carbohydrates_100g']) || 0;

  const kcalServ =
    Number(
      n['energy-kcal_serving'] ?? n.energy_kcal_serving ?? n['energy_serving'],
    ) || null;
  const proteinServ =
    Number(n.proteins_serving ?? n['proteins_serving']) || null;
  const fatServ = Number(n.fat_serving ?? n['fat_serving']) || null;
  const carbsServ =
    Number(n.carbohydrates_serving ?? n['carbohydrates_serving']) || null;

  return {
    kcal100,
    protein100,
    fat100,
    carbs100,
    kcalServ,
    proteinServ,
    fatServ,
    carbsServ,
  };
}

async function ingestOffSnapshot(
  pool,
  {
    snapshotPath,
    revision,
    filterLangs = (process.env.OFF_LANGS || 'ja,en')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    filterCountries = (process.env.OFF_COUNTRY_TAG || 'jp')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    logger = console,
    chunkSize = Number(process.env.OFF_CHUNK_SIZE || 500),
  } = {},
) {
  if (!snapshotPath) {
    throw new Error('snapshotPath is required for OFF ingestion');
  }

  const stream = fs.createReadStream(snapshotPath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  const client = await pool.connect();
  const stageTable = 'off_products_stage';
  const revisionTag = revision || new Date().toISOString();

  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TEMP TABLE ${stageTable} (LIKE off_products INCLUDING DEFAULTS INCLUDING CONSTRAINTS)
    `);

    const insertSQL = `
      INSERT INTO ${stageTable}
        (code, name, name_normalized, brand, lang, countries_tags, serving_size, serving_qty_g,
         kcal_100g, p_100g, f_100g, c_100g, kcal_serv, p_serv, f_serv, c_serv,
         source, rev)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      ON CONFLICT (code) DO UPDATE SET
        name = EXCLUDED.name,
        name_normalized = EXCLUDED.name_normalized,
        brand = EXCLUDED.brand,
        lang = EXCLUDED.lang,
        countries_tags = EXCLUDED.countries_tags,
        serving_size = EXCLUDED.serving_size,
        serving_qty_g = EXCLUDED.serving_qty_g,
        kcal_100g = EXCLUDED.kcal_100g,
        p_100g = EXCLUDED.p_100g,
        f_100g = EXCLUDED.f_100g,
        c_100g = EXCLUDED.c_100g,
        kcal_serv = EXCLUDED.kcal_serv,
        p_serv = EXCLUDED.p_serv,
        f_serv = EXCLUDED.f_serv,
        c_serv = EXCLUDED.c_serv,
        source = EXCLUDED.source,
        rev = EXCLUDED.rev,
        updated_at = now()
    `;

    let buffered = [];
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let product;
      try {
        product = JSON.parse(trimmed);
      } catch (error) {
        logger.warn?.('offSnapshot.parse_error', { message: error?.message });
        continue;
      }

      if (!product.code) continue;
      if (!matchesLang(product, filterLangs)) continue;
      if (!matchesCountry(product, filterCountries)) continue;

      const name = extractName(product);
      if (!name) continue;
      const brand = extractBrand(product);
      const serving = parseServingSize(
        product.serving_size || product.serving_quantity,
      );
      const nutriments = extractNutriments(product.nutriments || {});
      const countries = product.countries_tags || [];
      const lang = product.lang || filterLangs[0] || null;

      const row = [
        product.code,
        name,
        normalizeQuery(name),
        brand,
        lang,
        countries,
        serving.text || null,
        serving.grams,
        nutriments.kcal100,
        nutriments.protein100,
        nutriments.fat100,
        nutriments.carbs100,
        nutriments.kcalServ,
        nutriments.proteinServ,
        nutriments.fatServ,
        nutriments.carbsServ,
        'off',
        revisionTag,
      ];

      buffered.push(row);

      if (buffered.length >= chunkSize) {
        const statements = buffered.map((values) =>
          client.query(insertSQL, values),
        );
        await Promise.all(statements);
        buffered = [];
      }
    }

    if (buffered.length) {
      const statements = buffered.map((values) =>
        client.query(insertSQL, values),
      );
      await Promise.all(statements);
    }

    await client.query('ANALYZE ' + stageTable);
    await client.query('TRUNCATE off_products');
    await client.query(
      `INSERT INTO off_products (code, name, name_normalized, brand, lang, countries_tags, serving_size, serving_qty_g,
        kcal_100g, p_100g, f_100g, c_100g, kcal_serv, p_serv, f_serv, c_serv, source, rev)
       SELECT code, name, name_normalized, brand, lang, countries_tags, serving_size, serving_qty_g,
        kcal_100g, p_100g, f_100g, c_100g, kcal_serv, p_serv, f_serv, c_serv, source, rev
       FROM ${stageTable}`,
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error?.('offSnapshot.ingest_error', { message: error?.message });
    throw error;
  } finally {
    await client.release();
    rl.close();
  }
}

module.exports = { ingestOffSnapshot };
