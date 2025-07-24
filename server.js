require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const axios = require('axios');
const session = require('express-session');
const bcrypt = require('bcrypt');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const {
  getMealLogs,
  addMealLog,
  updateMealLog,
  deleteMealLog,
  hasUserSetGoals,
  pool,
} = require('./services/meals');

const app = express();
const PORT = process.env.PORT || 3000;

// --- PostgreSQL接続設定 ---

// --- Google Gemini API設定 ---
// 環境変数からAPIキーを読み込みます。読み込めない場合は空文字になり、エラーを防ぎます。
const API_KEY = process.env.GEMINI_API_KEY?.trim() || '';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;

// --- 基本設定 ---

app.use('/uploads', express.static('uploads'));
app.use(express.json()); // JSONボディをパースするために必要
app.use(express.urlencoded({ extended: true })); // for form data

// --- セッションとPassportの初期化 ---
// 注意: secretは本番環境では.envファイルなどから読み込むべきです
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'a-secret-key-that-is-not-so-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }, // HTTPSでない場合はfalse
  }),
);
app.use(passport.initialize());
app.use(passport.session());

// --- Passport.js設定 ---
passport.use(
  new LocalStrategy(
    { usernameField: 'email' },
    async (email, password, done) => {
      try {
        const result = await pool.query(
          'SELECT * FROM users WHERE email = $1',
          [email],
        );
        const user = result.rows[0];

        if (!user) {
          return done(null, false, {
            message: 'そのメールアドレスのユーザーは存在しません。',
          });
        }

        const isValidPassword = await bcrypt.compare(
          password,
          user.password_hash,
        );

        if (!isValidPassword) {
          return done(null, false, {
            message: 'パスワードが正しくありません。',
          });
        }

        return done(null, user);
      } catch (err) {
        return done(err);
      }
    },
  ),
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    const user = result.rows[0];
    done(null, user);
  } catch (err) {
    done(err);
  }
});

// --- 画像アップロード設定 ---
const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req, file, cb) => {
    cb(
      null,
      `${file.fieldname}-${Date.now()}${path.extname(file.originalname)}`,
    );
  },
});
const upload = multer({ storage: storage });

// --- PostgreSQLデータ操作関数 ---

// --- AIへの指示書（プロンプト）---
const PROMPTS = {
  intent: `あなたの役割: インテント分類器。次の入力例を参考にして\n- 入力:「豚汁とおにぎり半分食べた」 ⇒ {"intent":"log_meal"}\n- 入力:「/report week」               ⇒ {"intent":"analyze_data"}\n- 入力:「今日めちゃ暑いね」          ⇒ {"intent":"chitchat"}\nルール: 上記3種のどれか1つだけ JSON で返す。説明・コードブロック禁止。`,
  nutrition: `あなたは管理栄養士。ユーザーから提供された食品や料理の栄養を分析してください。\n次を出力:\n1. mealName (料理名)\n2. amount (可食部g)  ← LLM に分量を決めさせる\n3. protein (タンパク質g)\n4. fat (脂質g)\n5. carbs (炭水化物g)\n6. calories (カロリーkcal)\n形式: {"mealName":"", "amount": , "protein": , "fat": , "carbs": , "calories": }\n例: {"mealName":"カレーライス","amount":300,"protein":20,"fat":25,"carbs":80,"calories":650}\n\n注意: food_codeは不要です。分析が不可能な場合は、全ての値をnullにしたJSONを返してください。`,
  chitchat: `あなたはフレンドリーな会話パートナーです。ユーザーのメッセージに対して、自然で楽しい会話を続けてください。ただし、食事の記録や栄養に関する話題になったら、「食事の記録ですね！詳しく教えてください。」のように、自然に食事記録モードに誘導してください。また、ユーザーが「/report」や「/analyze」のようなコマンドについて尋ねたら、データ分析機能があることを伝えてください。食事っぽい単語が来たら「食事の記録ですね！詳しく教えてください。」のように、自然に食事記録モードに誘導してください。`,
  analysis_summary: `あなたはユーザーの食事記録を分析し、分かりやすくフィードバックする栄養士です。以下のCSVデータとユーザーの要求に基づいて、簡潔で励みになるフィードバックを日本語で生成してください。JSON形式ではなく、直接自然言語で回答してください。\n\nユーザーの要求: {USER_REQUEST}\n\nCSVデータ:\n{CSV_DATA}\n\nフィードバック:`,
  edit_data: `あなたはユーザーの食事記録を編集するアシスタントです。ユーザーの指示と提供された過去の食事記録データから、編集対象の記録を特定するための「検索条件」（料理名、日付、時間帯など）と、変更したい項目（料理名、タンパク質、脂質、炭水化物、カロリー、メモ）とその新しい値をJSON形式で抽出してください。\n\n指示:\n- 「検索条件」は、ユーザーの入力から記録を特定するために役立つ情報（例: mealName, date (YYYY/MM/DD), timeOfDay (朝食, 昼食, 夕食, 間食)）を抽出してください。\n- 変更したい項目とその新しい値のみをJSONに含めてください。\n- JSON形式で{"searchCriteria":{"mealName":"新しい料理名","date":"YYYY/MM/DD","timeOfDay":"朝食"},"changes":{"protein":新しい値,...}}のように返してください。\n- 余計な説明やMarkdownのコードブロックは不要です。\n\n過去の食事記録データ:\n{CSV_DATA}`,
  delete_data: `あなたはユーザーの食事記録を削除するアシスタントです。ユーザーの指示と提供された過去の食事記録データから、削除対象の記録を特定するための「検索条件」（料理名、日付、時間帯など）をJSON形式で抽出してください。\n\n指示:\n- 「検索条件」は、ユーザーの入力から記録を特定するために役立つ情報（例: mealName, date (YYYY/MM/DD), timeOfDay (朝食, 昼食, 夕食, 間食)）を抽出してください。\n- JSON形式で{"searchCriteria":{"mealName":"料理名","date":"YYYY/MM/DD","timeOfDay":"朝食"}}のように返してください。\n- 余計な説明やMarkdownのコードブロックは不要です。\n\n過去の食事記録データ:\n{CSV_DATA}`,
};

// --- 待機関数 ---
async function callGemini(
  prompt,
  userText = '',
  imageFile = null,
  retries = 3,
) {
  // APIキーが設定されていない場合は、エラーメッセージを出して早期に処理を終了します。
  if (!API_KEY) {
    console.error(
      'Gemini APIキーが設定されていません。.envファイルを確認してください。',
    );
    return null;
  }

  const userParts = [];

  // プロンプトとユーザーテキストを結合
  let combinedText = prompt;
  if (userText) {
    combinedText += `\n\nユーザー入力: ${userText}`;
  }
  userParts.push({ text: combinedText });

  if (imageFile) {
    const imgBuf = fs.readFileSync(imageFile.path);
    userParts.push({
      inline_data: {
        mime_type: imageFile.mimetype,
        // ★★★ ここを修正しました ★★★
        data: imgBuf.toString('base64'),
      },
    });
  }

  for (let i = 0; i < retries; i++) {
    try {
      console.log(
        `Sending request to Gemini API (Attempt ${i + 1}/${retries})...`,
      );
      if (i > 0) {
        const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
        console.log(`Waiting for ${delay / 1000} seconds before retrying...`);
        await new Promise((resolve) => setTimeout(resolve, delay)); // sleep関数の代わりに直接記述
      }

      const response = await axios.post(API_URL, {
        contents: [{ role: 'user', parts: userParts }],
      });

      // レスポンスの存在チェックを追加
      const rawText = response.data?.candidates?.[0]?.content?.parts
        ?.map((p) => p.text)
        .join('');
      if (!rawText) {
        console.log('Valid response text not found, retrying...');
        continue;
      }

      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return jsonMatch[0];
      } else {
        console.log('No JSON found in response. Returning raw text:', rawText);
        return rawText;
      }
    } catch (err) {
      console.error(
        'Gemini API error',
        err.response?.data?.error || err.message,
      ); // エラー詳細を表示
      if (
        err.response &&
        (err.response.status === 429 || err.response.status === 503)
      ) {
        console.warn(
          'Retrying due to API rate limit or service unavailability...',
        );
        continue;
      } else {
        return null;
      }
    }
  }

  console.error('Gemini API: Max retries exceeded.');
  return null;
}

// --- ルーティング ---
app.post('/log', isAuthenticated, upload.single('image'), async (req, res) => {
  const userInput = req.body.text;
  const imageFile = req.file;
  let reply = 'エラーが発生しました。もう一度お試しください。';

  // 1. 受付係AIが意図を判断
  const intentResponseRaw = await callGemini(
    PROMPTS.intent,
    userInput,
    imageFile,
  );
  let intent = 'chitchat'; // デフォルトは雑談
  if (intentResponseRaw) {
    try {
      const intentJson = JSON.parse(intentResponseRaw);
      intent = intentJson.intent;
    } catch (e) {
      console.error(
        'Could not parse intent JSON. Raw response:',
        intentResponseRaw,
        e,
      );
      // JSONパースに失敗した場合、rawResponseをそのまま雑談として扱う
      intent = 'chitchat';
      reply = intentResponseRaw; // AIの生の応答をそのまま返す
      res.json({ reply });
      return;
    }
  } else {
    reply =
      'AIサービスが一時的に利用できません。しばらくしてからもう一度お試しください。';
    res.json({ reply });
    return;
  }

  // 2. 司令塔が専門家を呼び出す
  if (intent === 'log_meal') {
    const nutritionResponseRaw = await callGemini(
      PROMPTS.nutrition,
      userInput,
      imageFile,
    );
    if (nutritionResponseRaw) {
      try {
        const analysis = JSON.parse(nutritionResponseRaw);
        if (analysis && analysis.mealName !== '分析不能') {
          const record = {
            timestamp: new Date().toLocaleString('ja-JP'),
            mealName: analysis.mealName || '',
            protein: analysis.protein,
            fat: analysis.fat,
            carbs: analysis.carbs,
            calories: analysis.calories,
            imagePath: imageFile ? imageFile.path : '',
            memo: userInput,
          };
          await addMealLog(req.user.id, record);
          reply = `「${analysis.mealName}」ですね！\n推定カロリー: ${analysis.calories} kcal\nP: ${analysis.protein}g, F: ${analysis.fat}g, C: ${analysis.carbs}g\nとして記録しました。`;
        } else {
          reply =
            '栄養分析ができませんでした。もう少し詳しく教えていただけますか？';
        }
      } catch (e) {
        console.error(
          'Could not parse nutrition data JSON. Raw response:',
          nutritionResponseRaw,
          e,
        );
        reply =
          '栄養分析に失敗しました。もう一度試してみてください。\n（例: 「ハンバーグ」や「カレーの写真」のように具体的に教えてください。）';
      }
    } else {
      reply =
        'AIサービスが一時的に利用できません。しばらくしてからもう一度お試しください。';
    }
  } else if (intent === 'analyze_data') {
    const allData = await getMealLogs(req.user.id);
    const csvString = allData
      .map((row) => Object.values(row).join(','))
      .join('\n');

    const analysisPrompt = PROMPTS.analysis_summary
      .replace('{USER_REQUEST}', userInput)
      .replace('{CSV_DATA}', csvString || 'データがありません。');

    // ここでcallGeminiが返すのは自然言語のテキストなので、そのままreplyとして使う
    reply =
      (await callGemini(analysisPrompt, null, null)) ||
      'データ分析に失敗しました。';
  } else if (intent === 'edit_data') {
    const allData = await getMealLogs(req.user.id);
    const csvString = allData
      .map((row) => Object.values(row).join(','))
      .join('\n');
    const editInstructionRaw = await callGemini(
      PROMPTS.edit_data.replace(
        '{CSV_DATA}',
        csvString || 'データがありません。',
      ),
      userInput,
      imageFile,
    );
    if (editInstructionRaw) {
      try {
        const editInstruction = JSON.parse(editInstructionRaw);
        const searchCriteria = editInstruction.searchCriteria;
        const changes = editInstruction.changes;

        if (searchCriteria && Object.keys(searchCriteria).length > 0) {
          let matchedRecords = allData.filter((record) => {
            let match = true;
            if (
              searchCriteria.mealName &&
              record['料理名'] !== searchCriteria.mealName
            )
              match = false;
            // 日付の比較 (YYYY/MM/DD形式で比較)
            if (searchCriteria.date) {
              const recordDate = record['日時'].split(' ')[0];
              if (recordDate !== searchCriteria.date) match = false;
            }
            // 時間帯の比較 (簡易的)
            if (searchCriteria.timeOfDay) {
              const recordHour = parseInt(
                record['日時'].split(' ')[1].split(':')[0],
              );
              if (
                searchCriteria.timeOfDay === '朝食' &&
                (recordHour < 6 || recordHour >= 11)
              )
                match = false;
              if (
                searchCriteria.timeOfDay === '昼食' &&
                (recordHour < 11 || recordHour >= 17)
              )
                match = false;
              if (
                searchCriteria.timeOfDay === '夕食' &&
                (recordHour < 17 || recordHour >= 23)
              )
                match = false;
              if (
                searchCriteria.timeOfDay === '間食' &&
                (recordHour >= 23 || recordHour < 6)
              )
                match = false; // 夜間も含む
            }
            return match;
          });

          if (matchedRecords.length === 1) {
            const timestampToEdit = matchedRecords[0]['日時'];
            allData = allData.map((record) => {
              if (record['日時'] === timestampToEdit) {
                return {
                  日時: record['日時'],
                  料理名: changes.mealName || record['料理名'],
                  'タンパク質(g)': changes.protein || record['タンパク質(g)'],
                  '脂質(g)': changes.fat || record['脂質(g)'],
                  '炭水化物(g)': changes.carbs || record['炭水化物(g)'],
                  'カロリー(kcal)':
                    changes.calories || record['カロリー(kcal)'],
                  画像パス: record['画像パス'], // 画像パスは変更しない
                  メモ: changes.memo || record['メモ'],
                };
              } else {
                return record;
              }
            });
            await writeCsvData(allData);
            reply = `記録を更新しました！\n対象日時: ${timestampToEdit}`;
          } else if (matchedRecords.length > 1) {
            reply =
              '複数の記録が見つかりました。正確な日時を教えてください。\n例: 2025/07/14 12:06:31の記録を修正';
          } else {
            reply = '指定された条件に合う記録が見つかりませんでした。';
          }
        } else {
          reply =
            'どの記録を編集すればよいか分かりませんでした。検索条件を具体的に教えてください。';
        }
      } catch (e) {
        console.error(
          'Could not parse edit instruction JSON. Raw response:',
          editInstructionRaw,
          e,
        );
        reply =
          '記録の編集指示を理解できませんでした。もう一度お試しください。';
      }
    } else {
      reply =
        'AIサービスが一時的に利用できません。しばらくしてからもう一度お試しください。';
    }
  } else if (intent === 'delete_data') {
    const allData = await getMealLogs(req.user.id);
    const csvString = allData
      .map((row) => Object.values(row).join(','))
      .join('\n');
    const deleteInstructionRaw = await callGemini(
      PROMPTS.delete_data.replace(
        '{CSV_DATA}',
        csvString || 'データがありません。',
      ),
      userInput,
      imageFile,
    );
    if (deleteInstructionRaw) {
      try {
        const deleteInstruction = JSON.parse(deleteInstructionRaw);
        const searchCriteria = deleteInstruction.searchCriteria;

        if (searchCriteria && Object.keys(searchCriteria).length > 0) {
          let matchedRecords = allData.filter((record) => {
            let match = true;
            if (
              searchCriteria.mealName &&
              record['料理名'] !== searchCriteria.mealName
            )
              match = false;
            // 日付の比較 (YYYY/MM/DD形式で比較)
            if (searchCriteria.date) {
              const recordDate = record['日時'].split(' ')[0];
              if (recordDate !== searchCriteria.date) match = false;
            }
            // 時間帯の比較 (簡易的)
            if (searchCriteria.timeOfDay) {
              const recordHour = parseInt(
                record['日時'].split(' ')[1].split(':')[0],
              );
              if (
                searchCriteria.timeOfDay === '朝食' &&
                (recordHour < 6 || recordHour >= 11)
              )
                match = false;
              if (
                searchCriteria.timeOfDay === '昼食' &&
                (recordHour < 11 || recordHour >= 17)
              )
                match = false;
              if (
                searchCriteria.timeOfDay === '夕食' &&
                (recordHour < 17 || recordHour >= 23)
              )
                match = false;
              if (
                searchCriteria.timeOfDay === '間食' &&
                (recordHour >= 23 || recordHour < 6)
              )
                match = false; // 夜間も含む
            }
            return match;
          });

          if (matchedRecords.length === 1) {
            const timestampToDelete = matchedRecords[0]['日時'];
            const initialLength = allData.length;
            allData = allData.filter(
              (record) => record['日時'] !== timestampToDelete,
            );
            if (allData.length < initialLength) {
              await writeCsvData(allData);
              reply = `記録を削除しました！\n対象日時: ${timestampToDelete}`;
            } else {
              reply = `指定された日時の記録が見つかりませんでした: ${timestampToDelete}`;
            }
          } else if (matchedRecords.length > 1) {
            reply =
              '複数の記録が見つかりました。正確な日時を教えてください。\n例: 2025/07/14 12:06:31の記録を削除';
          } else {
            reply = '指定された条件に合う記録が見つかりませんでした。';
          }
        } else {
          reply =
            'どの記録を削除すればよいか分かりませんでした。検索条件を具体的に教えてください。';
        }
      } catch (e) {
        console.error(
          'Could not parse delete instruction JSON. Raw response:',
          deleteInstructionRaw,
          e,
        );
        reply =
          '記録の削除指示を理解できませんでした。もう一度お試しください。';
      }
    } else {
      reply =
        'AIサービスが一時的に利用できません。しばらくしてからもう一度お試しください。';
    }
  } else {
    // intent === 'chitchat'
    reply =
      (await callGemini(PROMPTS.chitchat, userInput, imageFile)) ||
      'ごめんなさい、うまく聞き取れませんでした。';
  }

  res.json({ reply });
});

// --- 新しいAPIエンドポイントの追加 ---
app.get('/api/goals', isAuthenticated, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT target_calories, target_protein, target_fat, target_carbs FROM user_goals WHERE user_id = $1',
      [req.user.id],
    );
    if (result.rows.length > 0) {
      res.json(result.rows[0]);
    } else {
      res.status(404).json({ error: '目標設定が見つかりません。' });
    }
  } catch (error) {
    console.error('Error fetching user goals:', error);
    res.status(500).json({ error: '目標設定の取得に失敗しました。' });
  }
});

app.get('/api/meal-data', isAuthenticated, async (req, res) => {
  try {
    const { start, end } = req.query;
    const data = await getMealLogs(req.user.id, start, end);
    res.json(data);
  } catch (error) {
    console.error('Error retrieving meal data from PostgreSQL:', error);
    res.status(500).json({ error: '食事データの取得に失敗しました。' });
  }
});

// --- データ更新APIエンドポイントの追加 ---
app.put('/api/meal-data', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: '認証が必要です。' });
  }
  const { id, ...updates } = req.body; // レコードIDと更新内容
  try {
    const result = await updateMealLog(req.user.id, id, updates);
    if (result.rowCount > 0) {
      res.status(200).json({ message: '記録が正常に更新されました。' });
    } else {
      res.status(404).json({
        error: '指定された記録が見つからないか、更新する権限がありません。',
      });
    }
  } catch (error) {
    console.error('Error updating meal record in PostgreSQL:', error);
    res.status(500).json({ error: '記録の更新に失敗しました。' });
  }
});

// --- データ削除APIエンドポイントの追加 ---
app.delete('/api/meal-data', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: '認証が必要です。' });
  }
  const { id } = req.body; // 削除対象のレコードID
  try {
    const result = await deleteMealLog(req.user.id, id);
    if (result.rowCount > 0) {
      res.status(200).json({ message: '記録が正常に削除されました。' });
    } else {
      res.status(404).json({
        error: '指定された記録が見つからないか、削除する権限がありません。',
      });
    }
  } catch (error) {
    console.error('Error deleting meal record from PostgreSQL:', error);
    res.status(500).json({ error: '記録の削除に失敗しました。' });
  }
});

// --- ページルーティングと保護 ---

function isAuthenticated(req, res, next) {
  // ★ テスト環境は無条件パス
  if (process.env.NODE_ENV === 'test') {
    req.user = { id: 1 }; // ★ダミーユーザー
    return next();
  }
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  return res.status(401).json({ error: '認証が必要です' });
}

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html')); // 常にチャット画面へ
});

app.get('/dashboard', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/goal-setting', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'goal-setting.html'));
});

// --- 静的ファイルの提供 ---
app.use(express.static('public'));

// --- 目標計算APIエンドポイント ---
app.post('/api/calculate-goals', (req, res) => {
  const { gender, age, height_cm, weight_kg, activity_level } = req.body;

  // 入力値のバリデーション
  if (!gender || !age || !height_cm || !weight_kg || !activity_level) {
    return res.status(400).json({ error: 'すべての項目を入力してください。' });
  }

  let bmr;
  if (gender === 'male') {
    bmr = 88.362 + 13.397 * weight_kg + 4.799 * height_cm - 5.677 * age;
  } else if (gender === 'female') {
    bmr = 447.593 + 9.247 * weight_kg + 3.098 * height_cm - 4.33 * age;
  } else {
    return res
      .status(400)
      .json({ error: '性別は male または female を指定してください。' });
  }

  const activityMultipliers = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
  };

  const multiplier = activityMultipliers[activity_level];
  if (!multiplier) {
    return res
      .status(400)
      .json({ error: '活動レベルの値が正しくありません。' });
  }

  const tdee = Math.round(bmr * multiplier);
  const protein = Math.round((tdee * 0.2) / 4);
  const fat = Math.round((tdee * 0.2) / 9);
  const carbs = Math.round((tdee * 0.6) / 4);

  res.json({
    recommended_calories: tdee,
    recommended_protein: protein,
    recommended_fat: fat,
    recommended_carbs: carbs,
  });
});

// --- 目標設定保存APIエンドポイント ---
app.post('/api/save-goals', isAuthenticated, async (req, res) => {
  const userId = req.user.id;
  const {
    gender,
    age,
    height_cm,
    weight_kg,
    activity_level,
    target_calories,
    target_protein,
    target_fat,
    target_carbs,
  } = req.body;

  try {
    // user_profiles テーブルへの保存（UPSERT）
    const profileQuery = `
      INSERT INTO user_profiles (user_id, gender, age, height_cm, weight_kg, activity_level)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (user_id) DO UPDATE SET
          gender = EXCLUDED.gender,
          age = EXCLUDED.age,
          height_cm = EXCLUDED.height_cm,
          weight_kg = EXCLUDED.weight_kg,
          activity_level = EXCLUDED.activity_level;
    `;
    await pool.query(profileQuery, [
      userId,
      gender,
      age,
      height_cm,
      weight_kg,
      activity_level,
    ]);

    // user_goals テーブルへの保存（UPSERT）
    const goalsQuery = `
      INSERT INTO user_goals (user_id, target_calories, target_protein, target_fat, target_carbs)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id) DO UPDATE SET
          target_calories = EXCLUDED.target_calories,
          target_protein = EXCLUDED.target_protein,
          target_fat = EXCLUDED.target_fat,
          target_carbs = EXCLUDED.target_carbs,
          updated_at = CURRENT_TIMESTAMP;
    `;
    await pool.query(goalsQuery, [
      userId,
      target_calories,
      target_protein,
      target_fat,
      target_carbs,
    ]);

    res.status(200).json({ message: '目標設定が正常に保存されました。' });
  } catch (error) {
    console.error('Error saving goals:', error);
    res.status(500).json({ error: '目標設定の保存中にエラーが発生しました。' });
  }
});

// --- 認証APIエンドポイント ---

// ユーザー登録
app.post('/api/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res
        .status(400)
        .json({ error: 'メールアドレスとパスワードは必須です。' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [email, hashedPassword],
    );

    res
      .status(201)
      .json({ message: 'ユーザー登録が成功しました。', user: newUser.rows[0] });
  } catch (error) {
    console.error('Registration error:', error);
    if (error.code === '23505') {
      // unique_violation
      return res
        .status(409)
        .json({ error: 'そのメールアドレスは既に使用されています。' });
    }
    res.status(500).json({ error: 'サーバーエラーが発生しました。' });
  }
});

// ログイン
app.post('/api/login', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) {
      console.error('Passport authentication error:', err);
      return res
        .status(500)
        .json({ error: '認証中にサーバーエラーが発生しました。' });
    }
    if (!user) {
      console.warn('Passport authentication failed:', info.message);
      return res
        .status(401)
        .json({ error: info.message || 'ログインに失敗しました。' });
    }
    req.logIn(user, async (err) => {
      if (err) {
        console.error('req.logIn error:', err);
        return res
          .status(500)
          .json({ error: 'ログイン処理中にエラーが発生しました。' });
      }
      // Original success logic
      const userId = req.user.id;
      const goalsSet = await hasUserSetGoals(userId);
      if (goalsSet) {
        res.json({ message: 'ログイン成功！', redirectTo: '/' });
      } else {
        res.json({ message: 'ログイン成功！', redirectTo: '/goal-setting' });
      }
    });
  })(req, res, next);
});

// ログアウト
app.post('/api/logout', (req, res, next) => {
  req.logout(function (err) {
    if (err) {
      return next(err);
    }
    res.json({ message: 'ログアウトしました。' });
  });
});

// ログイン状態の確認
app.get('/api/user', isAuthenticated, (req, res) => {
  res.json({ user: { id: req.user.id, email: req.user.email } });
});

// --- AIアドバイスAPIエンドポイント ---
app.get('/api/ai-advice', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const mealLogs = await getMealLogs(
      userId,
      today.toISOString(),
      tomorrow.toISOString(),
    );

    let csvString = 'データがありません。';
    if (mealLogs.length > 0) {
      // ヘッダー行を生成
      const headers = Object.keys(mealLogs[0]).join(',');
      // データ行を生成
      const dataRows = mealLogs
        .map((row) => Object.values(row).join(','))
        .join('\n');
      csvString = `${headers}\n${dataRows}`;
    }

    const analysisPrompt = PROMPTS.analysis_summary
      .replace('{USER_REQUEST}', '今日の食事記録についてアドバイスをください。')
      .replace('{CSV_DATA}', csvString);

    const aiAdvice = await callGemini(analysisPrompt);

    res.json({ advice: aiAdvice || '現在、アドバイスを生成できません。' });
  } catch (error) {
    console.error('Error generating AI advice:', error);
    res.status(500).json({ error: 'AIアドバイスの生成に失敗しました。' });
  }
});

// --- 食事スコアAPIエンドポイント ---
app.get('/api/meal-score', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const mealLogs = await getMealLogs(
      userId,
      today.toISOString(),
      tomorrow.toISOString(),
    );

    // ユーザーの目標値を取得
    const goalsResult = await pool.query(
      'SELECT target_calories, target_protein, target_fat, target_carbs FROM user_goals WHERE user_id = $1',
      [userId],
    );
    const userGoals = goalsResult.rows[0] || {
      target_calories: 2000, // デフォルト値
      target_protein: 100,
      target_fat: 60,
      target_carbs: 200,
    };

    let totalCalories = 0;
    let totalProtein = 0;
    let totalFat = 0;
    let totalCarbs = 0;

    mealLogs.forEach((meal) => {
      totalCalories += parseFloat(meal.calories) || 0;
      totalProtein += parseFloat(meal.protein) || 0;
      totalFat += parseFloat(meal.fat) || 0;
      totalCarbs += parseFloat(meal.carbs) || 0;
    });

    // スコア計算ロジック（簡易版）
    let score = 100;
    let comment = '素晴らしいバランスです！';

    // カロリーの評価
    const calorieDiff = Math.abs(totalCalories - userGoals.target_calories);
    const caloriePercentageDiff =
      (calorieDiff / userGoals.target_calories) * 100;
    if (caloriePercentageDiff > 30) {
      score -= 30;
      comment = 'カロリー摂取量が目標から大きく外れています。';
    } else if (caloriePercentageDiff > 15) {
      score -= 15;
      comment = 'カロリー摂取量が目標から少し外れています。';
    }

    // PFCバランスの評価（簡易版）
    // 目標値に対する達成度を評価
    const proteinRatio =
      userGoals.target_protein > 0
        ? totalProtein / userGoals.target_protein
        : 0;
    const fatRatio =
      userGoals.target_fat > 0 ? totalFat / userGoals.target_fat : 0;
    const carbsRatio =
      userGoals.target_carbs > 0 ? totalCarbs / userGoals.target_carbs : 0;

    // 各栄養素が目標値の80%から120%の範囲内であれば高評価
    if (proteinRatio < 0.8 || proteinRatio > 1.2) {
      score -= 10;
      comment = 'タンパク質の摂取量が目標から外れています。';
    }
    if (fatRatio < 0.8 || fatRatio > 1.2) {
      score -= 10;
      comment = '脂質の摂取量が目標から外れています。';
    }
    if (carbsRatio < 0.8 || carbsRatio > 1.2) {
      score -= 10;
      comment = '炭水化物の摂取量が目標から外れています。';
    }

    score = Math.max(0, Math.round(score)); // スコアが0未満にならないように

    // スコアに応じたコメントの調整
    if (score < 50) {
      comment = '食事のバランスを見直しましょう。';
    } else if (score < 70) {
      comment = 'もう少しバランスを意識すると良いでしょう。';
    } else if (score < 90) {
      comment = '良いバランスです！';
    } else {
      comment = '素晴らしいバランスです！';
    }

    res.json({ score, comment });
  } catch (error) {
    console.error('Error calculating meal score:', error);
    res.status(500).json({ error: '食事スコアの計算に失敗しました。' });
  }
});

// --- リマインダーAPIエンドポイント ---
app.get('/api/reminders', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const mealLogs = await getMealLogs(
      userId,
      today.toISOString(),
      tomorrow.toISOString(),
    );

    const reminders = [];
    const mealTimes = {
      breakfast: { start: 5, end: 10, message: '朝食の記録がまだです！' },
      lunch: { start: 11, end: 14, message: '昼食の記録がまだです！' },
      dinner: { start: 17, end: 21, message: '夕食の記録がまだです！' },
    };

    const currentHour = new Date().getHours();

    for (const key in mealTimes) {
      const mealTime = mealTimes[key];
      const hasLogged = mealLogs.some((log) => {
        const logHour = new Date(log.timestamp).getHours();
        return logHour >= mealTime.start && logHour < mealTime.end;
      });

      if (!hasLogged && currentHour >= mealTime.end) {
        reminders.push(mealTime.message);
      }
    }

    res.json({ reminders });
  } catch (error) {
    console.error('Error generating reminders:', error);
    res.status(500).json({ error: 'リマインダーの生成に失敗しました。' });
  }
});

// --- サーバー起動 ---
module.exports = { app, isAuthenticated };
