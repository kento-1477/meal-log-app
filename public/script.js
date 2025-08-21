document.addEventListener('DOMContentLoaded', () => {
  const chatBox = document.getElementById('chat-box');
  const textInput = document.getElementById('text-input');
  const sendButton = document.getElementById('send-button');
  const imageButton = document.getElementById('image-button');
  const imageInput = document.getElementById('image-input');
  const imagePreviewContainer = document.createElement('div');
  imagePreviewContainer.id = 'image-preview-container';
  imagePreviewContainer.style.display = 'none';
  imagePreviewContainer.style.marginTop = '10px';
  imagePreviewContainer.style.textAlign = 'center';
  document
    .getElementById('input-area')
    .insertBefore(imagePreviewContainer, textInput);

  let isComposing = false; // 日本語入力中フラグ
  const CHAT_HISTORY_KEY = 'chatHistory';

  // メッセージをチャットボックスに表示する関数
  function addMessage(text, sender, imageUrl = null, save = true) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', `${sender}-message`);

    if (text) {
      const textNode = document.createElement('p');
      textNode.innerHTML = text; // innerHTMLに変更して改行<br>を反映
      messageElement.appendChild(textNode);
    }

    if (imageUrl) {
      const imageNode = document.createElement('img');
      imageNode.src = imageUrl;
      messageElement.appendChild(imageNode);
    }

    chatBox.appendChild(messageElement);
    chatBox.scrollTop = chatBox.scrollHeight; // 自動スクロール

    if (save) {
      saveChatHistory({ text, sender, imageUrl });
    }
  }

  // チャット履歴をローカルストレージに保存する関数
  function saveChatHistory(message) {
    let history = JSON.parse(localStorage.getItem(CHAT_HISTORY_KEY)) || [];
    history.push(message);
    // 履歴が長くなりすぎないように、例えば最後の50件だけ保存する
    if (history.length > 50) {
      history = history.slice(history.length - 50);
    }
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(history));
  }

  // チャット履歴をローカルストレージから読み込む関数
  function loadChatHistory() {
    const history = JSON.parse(localStorage.getItem(CHAT_HISTORY_KEY));
    if (history) {
      history.forEach((message) => {
        addMessage(message.text, message.sender, message.imageUrl, false); // 読み込み時は保存しない
      });
    } else {
      // 履歴がない場合の初期メッセージ
      addMessage(
        'こんにちは！食事の記録ですか？それとも、ただのおしゃべり？',
        'bot',
        null,
        false,
      );
    }
  }

  // ユーザーからのメッセージを送信する関数
  async function sendMessage() {
    if (isComposing) return; // 日本語入力中は送信しない

    const text = textInput.value.trim();
    const imageFile = imageInput.files[0];

    if (!text && !imageFile) return; // 何も入力されていなければ何もしない

    const formData = new FormData();
    if (text) {
      formData.append('message', text);
    }
    if (imageFile) {
      formData.append('image', imageFile);
    }

    // ユーザーのメッセージをチャットボックスに表示
    addMessage(text, 'user', imageFile ? URL.createObjectURL(imageFile) : null);

    textInput.value = '';
    imageInput.value = '';
    imagePreviewContainer.innerHTML = ''; // プレビューをクリア
    imagePreviewContainer.style.display = 'none';

    // サーバーにデータを送信
    try {
      const response = await fetch('/log', {
        method: 'POST',
        body: formData, // ← FormData。画像は name='image'、テキストは message を付与済み
        credentials: 'include',
      });

      let data;
      try {
        data = await response.json(); // ← JSONとして一度だけ読む
      } catch (e) {
        addMessage('⚠️ サーバの応答をJSONとして読めませんでした', 'bot');
        console.error('parse error', e);
        return;
      }

      if (!response.ok || data?.ok === false) {
        addMessage(`⚠️ ${data?.message || 'エラーが発生しました'}`, 'bot');
        console.warn('server said NG', data);
        return;
      }

      const n = {
        protein: Number(
          data?.nutrition?.protein_g ?? data?.nutrition?.protein ?? 0,
        ),
        fat: Number(data?.nutrition?.fat_g ?? data?.nutrition?.fat ?? 0),
        carbs: Number(data?.nutrition?.carbs_g ?? data?.nutrition?.carbs ?? 0),
        calories: Number(
          data?.nutrition?.calories ?? data?.nutrition?.calories_kcal ?? NaN,
        ),
      };
      if (Number.isFinite(n.calories)) {
        addMessage(
          `🍱 推定: P ${n.protein}g / F ${n.fat}g / C ${n.carbs}g / ${n.calories}kcal`,
          'bot',
        );
      } else {
        addMessage('✅ 記録しました', 'bot'); // 栄養が無い場合のフォールバック
      }
    } catch (error) {
      console.error('Error:', error);
      addMessage('エラーが発生しました。もう一度お試しください。', 'bot');
    }
  }

  // イベントリスナーの設定
  textInput.addEventListener('compositionstart', () => {
    isComposing = true;
  });
  textInput.addEventListener('compositionend', () => {
    isComposing = false;
  });

  sendButton.addEventListener('click', sendMessage);
  textInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !isComposing) {
      sendMessage();
    }
  });

  imageButton.addEventListener('click', () => {
    imageInput.click(); // 画像ボタンを押したらファイル選択ダイアログを開く
  });

  imageInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        imagePreviewContainer.innerHTML = `<img src="${e.target.result}" style="max-width: 100px; max-height: 100px; margin-bottom: 5px;"><br><button id="clear-image">x</button>`;
        imagePreviewContainer.style.display = 'block';
        document.getElementById('clear-image').addEventListener('click', () => {
          imageInput.value = '';
          imagePreviewContainer.innerHTML = '';
          imagePreviewContainer.style.display = 'none';
        });
      };
      reader.readAsDataURL(file);
    }
  });

  // ページ読み込み時に履歴をロード
  loadChatHistory();
});
