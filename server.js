

require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const axios = require('axios');
const session = require('express-session');
const bcrypt = require('bcrypt');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const { Pool } = require('pg');


const app = express();
const port = 3000;

// --- Google Gemini API設定 ---
const API_KEY = process.env.GOOGLE_API_KEY;
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;

// --- 基本設定 ---
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));
app.use(express.json()); // JSONボディをパースするために必要
app.use(express.urlencoded({ extended: true })); // for form data

// --- セッション & 認証設定 ---
app.use(session({
    secret: process.env.SESSION_SECRET || 'a-secret-key-that-is-long-and-secret', // .envにSESSION_SECRETを設定することを推奨
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // HTTPSでない場合はfalse
}));

app.use(passport.initialize());
app.use(passport.session());

// --- PostgreSQL接続設定 ---
const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'meal_log_db',
    password: process.env.DB_PASSWORD || 'your_password', // ここは必ず実際のパスワードに置き換えてください
    port: process.env.DB_PORT || 5432,
});

// --- Passport.js設定 ---
passport.use(new LocalStrategy(
    { usernameField: 'email' },
    async (email, password, done) => {
        try {
            const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
            const user = result.rows[0];

            if (!user) {
                return done(null, false, { message: 'そのメールアドレスのユーザーは存在しません。' });
            }

            const isValidPassword = await bcrypt.compare(password, user.password_hash);

            if (!isValidPassword) {
                return done(null, false, { message: 'パスワードが正しくありません。' });
            }

            return done(null, user);
        } catch (err) {
            return done(err);
        }
    }
));

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
        cb(null, `${file.fieldname}-${Date.now()}${path.extname(file.originalname)}`);
    }
});
const upload = multer({ storage: storage });

// --- CSVファイル設定 ---
const CSV_HEADERS_IDS = [
    {id: 'timestamp', title: '日時'},
    {id: 'mealName', title: '料理名'},
    {id: 'protein', title: 'タンパク質(g)'},
    {id: 'fat', title: '脂質(g)'},
    {id: 'carbs', title: '炭水化物(g)'},
    {id: 'calories', title: 'カロリー(kcal)'},
    {id: 'imagePath', title: '画像パス'},
    {id: 'memo', title: 'メモ'}
];

const CSV_HEADERS_TITLES = CSV_HEADERS_IDS.map(h => h.title);
const EXPECTED_CSV_HEADER_LINE = CSV_HEADERS_IDS.map(h => `"${h.title}"`).join(',');

const csvPath = './data/meal_log.csv';
const csvWriter = createCsvWriter({
    path: csvPath,
    header: CSV_HEADERS_IDS,
    append: true,
    alwaysQuote: true,
});

// CSVヘッダーがなければ書き込む
async function ensureCsvHeader() {
    if (!fs.existsSync(csvPath) || fs.readFileSync(csvPath, 'utf8').trim().split('\n')[0] !== EXPECTED_CSV_HEADER_LINE) {
        const headerWriter = createCsvWriter({ path: csvPath, header: CSV_HEADERS_IDS });
        await headerWriter.writeRecords([]);
    }
}

// アプリ起動時にヘッダーを保証
ensureCsvHeader();

// --- AIへの指示書（プロンプト）---
const PROMPTS = {
    intent: `あなたの役割: インテント分類器。次の入力例を参考にして\n- 入力:「豚汁とおにぎり半分食べた」 ⇒ {"intent":"log_meal"}\n- 入力:「/report week」               ⇒ {"intent":"analyze_data"}\n- 入力:「今日めちゃ暑いね」          ⇒ {"intent":"chitchat"}\nルール: 上記3種のどれか1つだけ JSON で返す。説明・コードブロック禁止。`,
    nutrition: `あなたは管理栄養士。ユーザーから提供された食品や料理の栄養を分析してください。\n次を出力:\n1. mealName (料理名)\n2. amount (可食部g)  ← LLM に分量を決めさせる\n3. protein (タンパク質g)\n4. fat (脂質g)\n5. carbs (炭水化物g)\n6. calories (カロリーkcal)\n形式: {"mealName":"", "amount": , "protein": , "fat": , "carbs": , "calories": }\n例: {"mealName":"カレーライス","amount":300,"protein":20,"fat":25,"carbs":80,"calories":650}\n\n注意: food_codeは不要です。分析が不可能な場合は、全ての値をnullにしたJSONを返してください。`,
    chitchat: `あなたはフレンドリーな会話パートナーです。ユーザーのメッセージに対して、自然で楽しい会話を続けてください。ただし、食事の記録や栄養に関する話題になったら、「食事の記録ですね！詳しく教えてください。」のように、自然に食事記録モードに誘導してください。また、ユーザーが「/report」や「/analyze」のようなコマンドについて尋ねたら、データ分析機能があることを伝えてください。食事っぽい単語が来たら「食事の記録ですね！詳しく教えてください。」のように、自然に食事記録モードに誘導してください。`,
    analysis_summary: `あなたはユーザーの食事記録を分析し、分かりやすくフィードバックする栄養士です。以下のCSVデータとユーザーの要求に基づいて、簡潔で励みになるフィードバックを日本語で生成してください。JSON形式ではなく、直接自然言語で回答してください。\n\nユーザーの要求: {USER_REQUEST}\n\nCSVデータ:\n{CSV_DATA}\n\nフィードバック:`,
    edit_data: `あなたはユーザーの食事記録を編集するアシスタントです。ユーザーの指示と提供された過去の食事記録データから、編集対象の記録を特定するための「検索条件」（料理名、日付、時間帯など）と、変更したい項目（料理名、タンパク質、脂質、炭水化物、カロリー、メモ）とその新しい値をJSON形式で抽出してください。\n\n指示:\n- 「検索条件」は、ユーザーの入力から記録を特定するために役立つ情報（例: mealName, date (YYYY/MM/DD), timeOfDay (朝食, 昼食, 夕食, 間食)）を抽出してください。\n- 変更したい項目とその新しい値のみをJSONに含めてください。\n- JSON形式で{"searchCriteria":{"mealName":"新しい料理名","date":"YYYY/MM/DD","timeOfDay":"朝食"},"changes":{"protein":新しい値,...}}のように返してください。\n- 余計な説明やMarkdownのコードブロックは不要です。\n\n過去の食事記録データ:\n{CSV_DATA}`,
    delete_data: `あなたはユーザーの食事記録を削除するアシスタントです。ユーザーの指示と提供された過去の食事記録データから、削除対象の記録を特定するための「検索条件」（料理名、日付、時間帯など）をJSON形式で抽出してください。\n\n指示:\n- 「検索条件」は、ユーザーの入力から記録を特定するために役立つ情報（例: mealName, date (YYYY/MM/DD), timeOfDay (朝食, 昼食, 夕食, 間食)）を抽出してください。\n- JSON形式で{"searchCriteria":{"mealName":"料理名","date":"YYYY/MM/DD","timeOfDay":"朝食"}}のように返してください。\n- 余計な説明やMarkdownのコードブロックは不要です。\n\n過去の食事記録データ:\n{CSV_DATA}`
};

// --- 待機関数 ---
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// --- AI呼び出し関数 (rewritten with retry) ---
async function callGemini(prompt, userText = '', imageFile = null, retries = 3) {
  const userParts = [];

  // プロンプトとユーザーテキストを結合して一つのテキストパートにする
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
        data: imgBuf.toString('base64')
      }
    });
  }

  for (let i = 0; i < retries; i++) {
    try {
      console.log(`Sending request to Gemini API (Attempt ${i + 1}/${retries})...`);
      // 最初の試行以外は待機
      if (i > 0) {
        const delay = Math.pow(2, i) * 1000 + Math.random() * 1000; // 指数バックオフ + ランダムジッター
        console.log(`Waiting for ${delay / 1000} seconds before retrying...`);
        await sleep(delay);
      }

      const response = await axios.post(API_URL, { contents: [{ role: 'user', parts: userParts }] });
      const rawText = response.data.candidates[0].content.parts.map(p => p.text).join('');

      // JSONを抽出する試み
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
          return jsonMatch[0]; // JSONが見つかった場合はJSON文字列を返す
      } else {
          // JSONが見つからない場合は生のテキストを返す
          console.log('No JSON found in response. Returning raw text:', rawText);
          return rawText;
      }
    } catch (err) {
      console.error('Gemini API error', err.response?.data || err.message);
      // 429 (Too Many Requests) または 503 (Service Unavailable) の場合はリトライ
      if (err.response && (err.response.status === 429 || err.response.status === 503)) {
        console.warn('Retrying due to API rate limit or service unavailability...');
        continue; // ループを続行してリトライ
      } else {
        // その他のエラーの場合はリトライせず終了
        return null;
      }
    }
  }
  console.error('Gemini API: Max retries exceeded.');
  return null; // 最大リトライ回数を超えた場合
}

// --- CSVデータ読み込み関数 (手動パース) ---
async function readCsvData() {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(csvPath)) {
            console.log('CSV file does not exist. Returning empty array.');
            return resolve([]);
        }

        const fileContent = fs.readFileSync(csvPath, 'utf8');
        const lines = fileContent.trim().split('\n');

        if (lines.length <= 1) { // ヘッダー行のみ、または空の場合
            console.log('CSV file has only header or is empty.');
            return resolve([]);
        }

        // ヘッダー行をパース
        const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '')); // クォーテーションを除去
        const results = [];

        // データ行をパース
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line === '') continue; // 空行をスキップ

            const values = line.split(',').map(v => v.replace(/^"|"$/g, '')); // クォーテーションを除去
            const row = {};
            headers.forEach((header, index) => {
                row[header] = values[index] || '';
            });
            results.push(row);
            console.log('CSV row data (after manual parsing):', row);
        }

        console.log('CSV read complete. Total rows:', results.length);
        resolve(results);
    });
}

// --- CSVデータ書き込み関数 (更新用) ---
async function writeCsvData(data) {
    const writer = createCsvWriter({
        path: csvPath,
        header: CSV_HEADERS_IDS,
        append: false, // 上書きモード
        alwaysQuote: true,
    });
    await writer.writeRecords(data);
}

// --- ルーティング ---
app.post('/log', upload.single('image'), async (req, res) => {
    const userInput = req.body.text;
    const imageFile = req.file;
    let reply = 'エラーが発生しました。もう一度お試しください。';

    // 1. 受付係AIが意図を判断
    const intentResponseRaw = await callGemini(PROMPTS.intent, userInput, imageFile);
    let intent = 'chitchat'; // デフォルトは雑談
    if (intentResponseRaw) {
        try {
            const intentJson = JSON.parse(intentResponseRaw);
            intent = intentJson.intent;
        } catch (e) {
            console.error('Could not parse intent JSON. Raw response:', intentResponseRaw, e);
            // JSONパースに失敗した場合、rawResponseをそのまま雑談として扱う
            intent = 'chitchat'; 
            reply = intentResponseRaw; // AIの生の応答をそのまま返す
            res.json({ reply });
            return;
        }
    } else {
        reply = 'AIサービスが一時的に利用できません。しばらくしてからもう一度お試しください。';
        res.json({ reply });
        return;
    }

    // 2. 司令塔が専門家を呼び出す
    if (intent === 'log_meal') {
        const nutritionResponseRaw = await callGemini(PROMPTS.nutrition, userInput, imageFile);
        if (nutritionResponseRaw) {
            try {
                const analysis = JSON.parse(nutritionResponseRaw);
                if (analysis && analysis.mealName !== '分析不能') {
                    const record = {
                        timestamp: new Date().toLocaleString('ja-JP'),
                        mealName: analysis.mealName || '',
                        protein: analysis.protein || '',
                        fat: analysis.fat || '',
                        carbs: analysis.carbs || '',
                        calories: analysis.calories || '',
                        imagePath: imageFile ? imageFile.path : '',
                        memo: userInput
                    };
                    await csvWriter.writeRecords([record]);
                    reply = `「${analysis.mealName}」ですね！\n推定カロリー: ${analysis.calories} kcal\nP: ${analysis.protein}g, F: ${analysis.fat}g, C: ${analysis.carbs}g\nとして記録しました。`;
                } else {
                    reply = '栄養分析ができませんでした。もう少し詳しく教えていただけますか？';
                }
            } catch (e) {
                console.error('Could not parse nutrition data JSON. Raw response:', nutritionResponseRaw, e);
                reply = '栄養分析に失敗しました。もう一度試してみてください。\n（例: 「ハンバーグ」や「カレーの写真」のように具体的に教えてください。）';
            }
        } else {
            reply = 'AIサービスが一時的に利用できません。しばらくしてからもう一度お試しください。';
        }
    } else if (intent === 'analyze_data') {
        const allData = await readCsvData();
        const csvString = allData.map(row => Object.values(row).join(',')).join('\n');
        
        const analysisPrompt = PROMPTS.analysis_summary
                                .replace('{USER_REQUEST}', userInput)
                                .replace('{CSV_DATA}', csvString || 'データがありません。');
        
        // ここでcallGeminiが返すのは自然言語のテキストなので、そのままreplyとして使う
        reply = await callGemini(analysisPrompt, null, null) || 'データ分析に失敗しました。';

    } else if (intent === 'edit_data') {
        const allData = await readCsvData();
        const csvString = allData.map(row => Object.values(row).join(',')).join('\n');
        const editInstructionRaw = await callGemini(PROMPTS.edit_data.replace('{CSV_DATA}', csvString || 'データがありません。'), userInput, imageFile);
        if (editInstructionRaw) {
            try {
                const editInstruction = JSON.parse(editInstructionRaw);
                const searchCriteria = editInstruction.searchCriteria;
                const changes = editInstruction.changes;

                if (searchCriteria && Object.keys(searchCriteria).length > 0) {
                    let matchedRecords = allData.filter(record => {
                        let match = true;
                        if (searchCriteria.mealName && record['料理名'] !== searchCriteria.mealName) match = false;
                        // 日付の比較 (YYYY/MM/DD形式で比較)
                        if (searchCriteria.date) {
                            const recordDate = record['日時'].split(' ')[0];
                            if (recordDate !== searchCriteria.date) match = false;
                        }
                        // 時間帯の比較 (簡易的)
                        if (searchCriteria.timeOfDay) {
                            const recordHour = parseInt(record['日時'].split(' ')[1].split(':')[0]);
                            if (searchCriteria.timeOfDay === '朝食' && (recordHour < 6 || recordHour >= 11)) match = false;
                            if (searchCriteria.timeOfDay === '昼食' && (recordHour < 11 || recordHour >= 17)) match = false;
                            if (searchCriteria.timeOfDay === '夕食' && (recordHour < 17 || recordHour >= 23)) match = false;
                            if (searchCriteria.timeOfDay === '間食' && (recordHour >= 23 || recordHour < 6)) match = false; // 夜間も含む
                        }
                        return match;
                    });

                    if (matchedRecords.length === 1) {
                        const timestampToEdit = matchedRecords[0]['日時'];
                        allData = allData.map(record => {
                            if (record['日時'] === timestampToEdit) {
                                return {
                                    '日時': record['日時'],
                                    '料理名': changes.mealName || record['料理名'],
                                    'タンパク質(g)': changes.protein || record['タンパク質(g)'],
                                    '脂質(g)': changes.fat || record['脂質(g)'],
                                    '炭水化物(g)': changes.carbs || record['炭水化物(g)'],
                                    'カロリー(kcal)': changes.calories || record['カロリー(kcal)'],
                                    '画像パス': record['画像パス'], // 画像パスは変更しない
                                    'メモ': changes.memo || record['メモ']
                                };
                            } else {
                                return record;
                            }
                        });
                        await writeCsvData(allData);
                        reply = `記録を更新しました！\n対象日時: ${timestampToEdit}`; 
                    } else if (matchedRecords.length > 1) {
                        reply = '複数の記録が見つかりました。正確な日時を教えてください。\n例: 2025/07/14 12:06:31の記録を修正';
                    } else {
                        reply = '指定された条件に合う記録が見つかりませんでした。';
                    }
                } else {
                    reply = 'どの記録を編集すればよいか分かりませんでした。検索条件を具体的に教えてください。';
                }
            } catch (e) {
                console.error('Could not parse edit instruction JSON. Raw response:', editInstructionRaw, e);
                reply = '記録の編集指示を理解できませんでした。もう一度お試しください。';
            }
        } else {
            reply = 'AIサービスが一時的に利用できません。しばらくしてからもう一度お試しください。';
        }
    } else if (intent === 'delete_data') {
        const allData = await readCsvData();
        const csvString = allData.map(row => Object.values(row).join(',')).join('\n');
        const deleteInstructionRaw = await callGemini(PROMPTS.delete_data.replace('{CSV_DATA}', csvString || 'データがありません。'), userInput, imageFile);
        if (deleteInstructionRaw) {
            try {
                const deleteInstruction = JSON.parse(deleteInstructionRaw);
                const searchCriteria = deleteInstruction.searchCriteria;

                if (searchCriteria && Object.keys(searchCriteria).length > 0) {
                    let matchedRecords = allData.filter(record => {
                        let match = true;
                        if (searchCriteria.mealName && record['料理名'] !== searchCriteria.mealName) match = false;
                        // 日付の比較 (YYYY/MM/DD形式で比較)
                        if (searchCriteria.date) {
                            const recordDate = record['日時'].split(' ')[0];
                            if (recordDate !== searchCriteria.date) match = false;
                        }
                        // 時間帯の比較 (簡易的)
                        if (searchCriteria.timeOfDay) {
                            const recordHour = parseInt(record['日時'].split(' ')[1].split(':')[0]);
                            if (searchCriteria.timeOfDay === '朝食' && (recordHour < 6 || recordHour >= 11)) match = false;
                            if (searchCriteria.timeOfDay === '昼食' && (recordHour < 11 || recordHour >= 17)) match = false;
                            if (searchCriteria.timeOfDay === '夕食' && (recordHour < 17 || recordHour >= 23)) match = false;
                            if (searchCriteria.timeOfDay === '間食' && (recordHour >= 23 || recordHour < 6)) match = false; // 夜間も含む
                        }
                        return match;
                    });

                    if (matchedRecords.length === 1) {
                        const timestampToDelete = matchedRecords[0]['日時'];
                        const initialLength = allData.length;
                        allData = allData.filter(record => record['日時'] !== timestampToDelete);
                        if (allData.length < initialLength) {
                            await writeCsvData(allData);
                            reply = `記録を削除しました！\n対象日時: ${timestampToDelete}`; 
                        } else {
                            reply = `指定された日時の記録が見つかりませんでした: ${timestampToDelete}`; 
                        }
                    } else if (matchedRecords.length > 1) {
                        reply = '複数の記録が見つかりました。正確な日時を教えてください。\n例: 2025/07/14 12:06:31の記録を削除';
                    } else {
                        reply = '指定された条件に合う記録が見つかりませんでした。';
                    }
                } else {
                    reply = 'どの記録を削除すればよいか分かりませんでした。検索条件を具体的に教えてください。';
                }
            } catch (e) {
                console.error('Could not parse delete instruction JSON. Raw response:', deleteInstructionRaw, e);
                reply = '記録の削除指示を理解できませんでした。もう一度お試しください。';
            }
        } else {
            reply = 'AIサービスが一時的に利用できません。しばらくしてからもう一度お試しください。';
        }
    } else { // intent === 'chitchat'
        reply = await callGemini(PROMPTS.chitchat, userInput, imageFile) || 'ごめんなさい、うまく聞き取れませんでした。';
    }

    res.json({ reply });
});

// --- 新しいAPIエンドポイントの追加 ---
app.get('/api/meal-data', async (req, res) => {
    try {
        const data = await readCsvData();
        res.json(data);
    } catch (error) {
        console.error('Error reading CSV data for API:', error);
        res.status(500).json({ error: 'Failed to retrieve meal data.' });
    }
});

// --- データ更新APIエンドポイントの追加 ---
app.put('/api/meal-data', async (req, res) => {
    const updatedRecord = req.body; // 更新されたレコードデータ
    try {
        let allData = await readCsvData();
        // タイムスタンプをキーにしてレコードを更新
        allData = allData.map(record => {
            if (record['日時'] === updatedRecord.timestamp) {
                return {
                    '日時': updatedRecord.timestamp,
                    '料理名': updatedRecord.mealName,
                    'タンパク質(g)': updatedRecord.protein,
                    '脂質(g)': updatedRecord.fat,
                    '炭水化物(g)': updatedRecord.carbs,
                    'カロリー(kcal)': updatedRecord.calories,
                    '画像パス': updatedRecord.imagePath || record['画像パス'], // 画像パスは変更しない
                    'メモ': updatedRecord.memo
                };
            } else {
                return record;
            }
        });
        await writeCsvData(allData); // 更新されたデータをCSVに書き戻す
        res.status(200).json({ message: '記録が正常に更新されました。' });
    } catch (error) {
        console.error('Error updating meal record:', error);
        res.status(500).json({ error: '記録の更新に失敗しました。' });
    }
});

// --- データ削除APIエンドポイントの追加 ---
app.delete('/api/meal-data', async (req, res) => {
    const timestampToDelete = req.body.timestamp; // 削除対象のタイムスタンプ
    try {
        let allData = await readCsvData();
        const initialLength = allData.length;
        allData = allData.filter(record => record['日時'] !== timestampToDelete);
        if (allData.length < initialLength) {
            await writeCsvData(allData);
            res.status(200).json({ message: '記録が正常に削除されました。' });
        } else {
            res.status(404).json({ error: '指定された日時の記録が見つかりませんでした。' });
        }
    } catch (error) {
        console.error('Error deleting meal record:', error);
        res.status(500).json({ error: '記録の削除に失敗しました。' });
    }
});

// --- ページルーティングと保護 ---

function isAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/login');
}

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/dashboard', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// --- 認証APIエンドポイント ---

// ユーザー登録
app.post('/api/register', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'メールアドレスとパスワードは必須です。' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await pool.query(
            'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
            [email, hashedPassword]
        );

        res.status(201).json({ message: 'ユーザー登録が成功しました。', user: newUser.rows[0] });
    } catch (error) {
        console.error('Registration error:', error);
        if (error.code === '23505') { // unique_violation
            return res.status(409).json({ error: 'そのメールアドレスは既に使用されています。' });
        }
        res.status(500).json({ error: 'サーバーエラーが発生しました。' });
    }
});

// ログイン
app.post('/api/login', passport.authenticate('local'), (req, res) => {
    res.json({ message: 'ログイン成功！', user: { id: req.user.id, email: req.user.email } });
});

// ログアウト
app.post('/api/logout', (req, res, next) => {
    req.logout(function(err) {
        if (err) { return next(err); }
        res.json({ message: 'ログアウトしました。' });
    });
});

// ログイン状態の確認
app.get('/api/user', isAuthenticated, (req, res) => {
    res.json({ user: { id: req.user.id, email: req.user.email } });
});


// --- サーバー起動 ---
app.listen(port, () => {
    console.log(`食事記録アプリが http://localhost:${port} で起動しました`);
});
