const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

exports.seed = async function (knex) {
  await knex.transaction(async (trx) => {
    // 既存データを削除
    await trx('meal_logs').del();

    const records = [];
    const csvFilePath = path.resolve(__dirname, '../data/meal_log.csv');

    return new Promise((resolve, reject) => {
      fs.createReadStream(csvFilePath)
        .pipe(csv())
        .on('data', (row) => {
          records.push({
            user_id: 1, // seed_usersで作成されるダミーユーザーのIDを想定
            meal_type: row.meal_type,
            food_item: row.food_item,
            calories: parseFloat(row.calories) || 0,
            protein: parseFloat(row.protein) || 0,
            fat: parseFloat(row.fat) || 0,
            carbs: parseFloat(row.carbs) || 0,
            image_path: row.image_path || null,
            memo: row.memo || null,
            consumed_at: row.consumed_at
              ? new Date(row.consumed_at)
              : knex.fn.now(),
          });
        })
        .on('end', async () => {
          try {
            await trx.batchInsert('meal_logs', records, 1000);
            console.log('CSV data seeded successfully.');
            resolve();
          } catch (error) {
            console.error('Error seeding CSV data:', error);
            reject(error);
          }
        })
        .on('error', reject);
    });
  });
};
