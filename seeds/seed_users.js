exports.seed = async function (knex) {
  await knex.transaction(async (trx) => {
    // 既存データを削除
    await trx('users').del();

    // ダミーユーザーを作成
    await trx('users')
      .insert(
        [
          {
            id:
              process.env.TEST_USER_ID ||
              '00000000-0000-0000-0000-000000000001',
            username: 'testuser',
            email: 'test@example.com',
            password_hash: 'dummy_hashed_password', // 実際はbcryptでハッシュ化
          },
        ],
        ['id'],
      )
      .onConflict('id')
      .merge();
  });
};
