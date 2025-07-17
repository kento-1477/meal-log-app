# 1.0.0 (2025-07-16)

### Features

- Initial project setup and user authentication feature 1905184

---

**Project Information:**

- Project ID: food-ai-app-466114
- Project Name: Food Ai App

## 食事記録AIアシスタント アプリケーション概要

このアプリケーションは、ユーザーが日々の食事をチャット形式で手軽に記録し、AIによる栄養分析やデータ分析のフィードバックを受け取ることができるWebアプリです。

### I. 現状の機能 (Current Features)

現在のアプリは、以下の主要な機能を備えています。

1.  **チャットベースの直感的なUI:**
    - ユーザーはチャット形式でAIと対話しながら食事を記録できます。
    - 日本語入力時のEnterキー問題も解決済みで、スムーズな入力が可能です。
2.  **AIによる高度な食事記録:**
    - **テキストと画像の同時入力:** ユーザーは食事のテキスト説明と画像を同時にAIに送信できます。
    - **AI栄養分析:** Googleの最新AIモデル「Gemini 1.5 Flash」が、送信されたテキストと画像を解析し、料理名、タンパク質(g)、脂質(g)、炭水化物(g)、カロリー(kcal)を推定して記録します。
    - **柔軟な入力対応:** 「コーラ半分飲んだ」のような自然な表現もAIが文脈を考慮して分析を試みます。
3.  **AIとの多機能な対話:**
    - **意図判断:** AIがユーザーのメッセージの意図（食事記録、データ分析、雑談）を自動で判断し、適切な応答を返します。
    - **雑談機能:** 食事記録以外の一般的な会話にもAIが自然に応答します。
4.  **データ分析とフィードバック:**
    - `/report today` や `/analyze week` といったコマンドをチャットで入力すると、過去の食事記録データ（`meal_log.csv`）をAIが分析し、チャット形式で要約やフィードバックを提供します。
5.  **ダッシュボードでのデータ可視化:**
    - 記録されたすべての食事データは、専用のダッシュボード画面で表形式で一覧表示されます。画像もサムネイルで確認できます。
    - チャット画面とダッシュボード画面は、ボタン一つで簡単に切り替え可能です。
6.  **チャット履歴の保持:**
    - ブラウザのローカルストレージを利用し、ページを移動してもチャットの会話履歴が消えないようになっています。

### II. これからの展望 (Future Prospects)

現在のアプリは強力な基盤を築きましたが、さらなる進化の可能性を秘めています。

1.  **インターネット公開 (デプロイ):**
    - 現在のアプリはあなたのPC上でしか動作しませんが、GitHubやRenderのようなサービスを利用してインターネット上に公開することで、**スマホからいつでもどこからでもアクセス可能**になります。
2.  **栄養分析の精度向上と拡張:**
    - **食品データベース連携:** JPF管轄の「日本食品標準成分表」やUSDA FoodDataのような公的な食品データベースと連携し、AIが推定した料理名から、より正確な栄養成分値を取得・記録できるようにします。
    - **画像からの分量推定:** TensorFlowなどの画像認識モデルを導入し、写真から食事の分量をより正確に推定する機能を追加することで、栄養分析の精度を飛躍的に向上させます。
    - **専門API連携:** ClarifaiやGoogle Visionなどの専門的な画像認識APIを活用し、料理名の特定能力を強化します。
3.  **高度なデータ分析とパーソナライズ:**
    - **グラフ表示:** ダッシュボードに、日ごと、週ごと、月ごとのカロリーやPFCの推移をグラフで表示し、視覚的に食生活を把握できるようにします。
    - **目標設定と進捗管理:** ユーザーが目標カロリーやPFCを設定し、それに対する達成度をAIがフィードバックする機能を追加します。
    - **パーソナライズされたアドバイス:** 過去の記録や目標に基づいて、AIが個別の食事提案や改善アドバイスを行う「AI栄養士」としての機能を強化します。
4.  **データ保存の堅牢化:**
    - 現在のCSVファイル保存から、SQLiteのような軽量なデータベースへの移行を検討します。これにより、データの検索、集計、並列書き込みのパフォーマンスが向上し、より複雑なデータ分析が可能になります。
5.  **ReActエージェントアーキテクチャの本格導入:**
    - エンジニアのアドバイスにあったReActエージェントアーキテクチャを本格的に導入することで、AIがより複雑なユーザー要求を推論し、複数のツールを組み合わせて解決できるようになります。これにより、アプリの堅牢性、柔軟性、拡張性がさらに向上します。
6.  **ユーザー体験の向上:**
    - ユーザー認証機能の追加（複数ユーザー対応）。
    - より直感的で洗練されたUI/UXデザインの追求。

---

## III. Appendix: これまでの変更・修正の記録 (Change/Correction Log)

これまでの開発過程で適用された主要な変更と修正の記録です。

1.  **プロジェクトの初期セットアップ (Initial Setup)**
    - **内容:** `meal-log-app`プロジェクトフォルダの作成、`public`, `uploads`, `data`フォルダの作成、`.gitignore`ファイルの作成、`package.json`の初期設定。
    - **ファイル:** `Desktop/meal-log-app/`, `.gitignore`, `package.json`
    - **コマンド:** `mkdir -p Desktop/meal-log-app/{public,uploads,data}`, `write_file`
2.  **初期ライブラリのインストール (Initial Library Install)**
    - **内容:** `express`, `multer`, `csv-writer`のインストール。
    - **ファイル:** `package.json` (更新), `node_modules/`
    - **コマンド:** `npm install`
3.  **コアWebアプリファイルの作成 (Core Web App Files)**
    - **内容:** チャットUIのHTML, CSS, JavaScriptファイルの作成、およびサーバーサイドの`server.js`の初期バージョン作成。
    - **ファイル:** `public/index.html`, `public/style.css`, `public/script.js`, `server.js`
    - **コマンド:** `write_file`
4.  **AI連携ライブラリのインストール (AI Integration Libraries)**
    - **内容:** Google Gemini APIとの通信に必要な`axios`と、APIキー管理のための`dotenv`のインストール。
    - **ファイル:** `package.json` (更新), `node_modules/`
    - **コマンド:** `npm install axios dotenv`
5.  **APIキーの設定 (.env file)**
    - **内容:** Google Gemini APIキーを安全に保存するための`.env`ファイルの作成。
    - **ファイル:** `Desktop/meal-log-app/.env`
    - **コマンド:** `write_file`
6.  **AIモデルのバージョン修正 (Gemini Model Deprecation Fix)**
    - **問題:** `Gemini 1.0 Pro Vision`モデルの廃止エラー（HTTP 503）。
    - **修正:** `server.js`内のAIモデルを`gemini-1.5-flash`に更新。
    - **ファイル:** `server.js`
    - **コマンド:** `replace`
7.  **AI応答のJSON抽出堅牢化 (Robust JSON Extraction)**
    - **問題:** AIがJSONの前後に余計なテキストを返すことで、JSONパースエラーが発生。
    - **修正:** `server.js`の`callGemini`関数内で、AIの応答からJSON部分だけを正規表現で確実に抽出するロジックを強化。
    - **ファイル:** `server.js`
    - **コマンド:** `replace`
8.  **日本語入力のEnterキー問題解決 (Japanese Input UX Fix)**
    - **問題:** 日本語変換中のEnterキーでメッセージが意図せず送信されてしまう。
    - **修正:** `public/script.js`に`isComposing`フラグを追加し、変換中のEnterを無視するように変更。
    - **ファイル:** `public/script.js`
    - **コマンド:** `write_file`
9.  **チャット履歴の保持 (Persistent Chat History)**
    - **問題:** ページ遷移やリロードでチャット履歴が消えてしまう。
    - **修正:** `public/script.js`にローカルストレージを使ったチャット履歴の保存・復元機能を追加。
    - **ファイル:** `public/script.js`
    - **コマンド:** `write_file`
10. **ダッシュボード機能の追加 (Dashboard Feature)**
    - **内容:** 食事記録データを表形式で表示するダッシュボード機能を追加。
    - **ファイル:** `public/dashboard.html`, `public/dashboard.js`, `server.js` (APIエンドポイント追加)
    - **コマンド:** `write_file`
11. **CSV読み込みライブラリのインストール (`csv-parser`)**
    - **内容:** CSVファイルを読み込むための`csv-parser`ライブラリをインストール。
    - **ファイル:** `package.json` (更新), `node_modules/`
    - **コマンド:** `npm install csv-parser`
12. **ダッシュボードデータ表示問題の修正 (Dashboard Data Display Fix - Iteration 1)**
    - **問題:** CSVにデータがあるのにダッシュボードに表示されない（JavaScriptの列名参照問題）。
    - **修正:** `public/dashboard.js`でCSVの列名をブラケット記法で正確に参照するように修正。
    - **ファイル:** `public/dashboard.js`
    - **コマンド:** `write_file`
13. **CSVヘッダー認識問題の修正 (CSV Header Recognition Fix - Iteration 2)**
    - **問題:** `csv-parser`がCSVヘッダーを`_0`, `_1`のようなインデックスで読み込んでしまう。
    - **修正:** `server.js`の`readCsvData`関数で`csv-parser`に`headers: true`と`mapHeaders`オプションを追加。
    - **ファイル:** `server.js`
    - **コマンド:** `replace`
14. **CSVヘッダー二重表示問題の修正 (CSV Double Header Fix)**
    - **問題:** ダッシュボードにヘッダーが2行表示される。
    - **修正:** `server.js`の`readCsvData`関数で`skip_lines: 1`オプションを追加し、ヘッダー行をデータとして読み込まないように指示。
    - **ファイル:** `server.js`
    - **コマンド:** `replace`
15. **CSVデータ読み込み問題の最終修正 (Final CSV Read Fix - Manual Parsing)**
    - **問題:** `csv-parser`が日本語ヘッダーのCSVを安定して読み込めないため、データが表示されない問題が再発。
    - **修正:** `server.js`の`readCsvData`関数で`csv-parser`の使用を完全にやめ、CSVファイルを「手動で」パースするロジックに置き換え。
    - **ファイル:** `server.js`
    - **コマンド:** `write_file`
16. **ナビゲーションボタンの追加 (Navigation Buttons)**
    - **内容:** チャット画面とダッシュボード画面を相互に移動するためのボタンを追加。
    - **ファイル:** `public/index.html`, `public/dashboard.html`, `public/style.css`
    - **コマンド:** `replace`, `write_file`
17. **AI意図判断プロンプトの強化 (AI Intent Prompt Enhancement)**
    - **問題:** AIが`/report`や`/analyze`コマンドを正しく「データ分析」として認識できない。
    - **修正:** `server.js`の`PROMPTS.intent`にfew-shot（具体例）を追加し、判断基準を明確化。
    - **ファイル:** `server.js`
    - **コマンド:** `replace`
18. **画像とテキストの同時送信 (Combined Image & Text Sending)**
    - **内容:** 画像を選択後、テキストを入力し、まとめて送信ボタンで送れるようにUI/UXを改善。
    - **ファイル:** `public/script.js`
    - **コマンド:** `write_file`
19. **AI APIリクエストの修正 (AI API Request Fix - `text` parameter)**
    - **問題:** 画像のみ送信時に`text`パラメータがないとGemini APIがエラーを返す。
    - **修正:** `server.js`の`callGemini`関数で、`userText`が空の場合でも空のテキストパラメータを渡すように修正。
    - **ファイル:** `server.js`
    - **コマンド:** `replace`
20. **AI APIリクエストの修正 (AI API Request Fix - `system` role)**
    - **問題:** `system`ロールがGemini 1.5 Flashでサポートされていないエラー。
    - **修正:** `server.js`の`callGemini`関数で、`system`ロールを使わず、プロンプトを`user`ロールの最初のテキストとして渡すように修正。
    - **ファイル:** `server.js`
    - **コマンド:** `replace`
