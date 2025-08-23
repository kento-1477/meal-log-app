/* exported addMessage */
document.addEventListener('DOMContentLoaded', () => {
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

  // チャット履歴をローカルストレージに保存する関数
  function saveChatHistory(entry) {
    try {
      // 画像が blob: のときは保存しない（復元不能だから）
      if (entry.imageUrl && String(entry.imageUrl).startsWith('blob:')) {
        entry = { ...entry, imageUrl: undefined };
      }
      const prev = JSON.parse(localStorage.getItem(CHAT_HISTORY_KEY) || '[]');
      // 期待スキーマ：{ text, sender, imageUrl, ts }
      prev.push({ ...entry, ts: Date.now() });
      localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(prev));
    } catch (_) {
      // Safariのプライベートモード等で例外になっても黙殺
    }
  }

  // メッセージをチャットボックスに表示する関数
  function addMessage(content, sender, imageUrl = null, save = true) {
    const chatBox = document.getElementById('chat-box');

    // メッセージの外枠（吹き出し）
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', `${sender}-message`);

    const isDOM = (v) =>
      v && typeof v === 'object' && (v.nodeType === 1 || v.nodeType === 11);

    if (isDOM(content)) {
      messageElement.appendChild(content); // Element or DocumentFragment
    } else if (typeof content === 'string') {
      const p = document.createElement('p');
      const parts = content.split('\n');
      parts.forEach((part, i) => {
        if (i) p.appendChild(document.createElement('br'));
        p.appendChild(document.createTextNode(part));
      });
      messageElement.appendChild(p);
    } else if (content != null) {
      const p = document.createElement('p');
      p.textContent = String(content);
      messageElement.appendChild(p);
    }

    // 画像があれば添付
    if (imageUrl) {
      const img = document.createElement('img');
      img.src = imageUrl;
      messageElement.appendChild(img);
    }

    chatBox.appendChild(messageElement);
    chatBox.scrollTop = chatBox.scrollHeight;

    // DOM要素は履歴に保存しない（XSS/循環参照を避ける）
    if (save && typeof content === 'string') {
      saveChatHistory({ text: content, sender, imageUrl });
    }
  }

  // チャット履歴をローカルストレージから読み込む関数
  function loadChatHistory() {
    const history = JSON.parse(
      localStorage.getItem(CHAT_HISTORY_KEY) || '[]',
    ).filter((e) => !e.imageUrl || !String(e.imageUrl).startsWith('blob:'));

    if (history.length) {
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

      if (
        data?.breakdown &&
        data?.nutrition &&
        (window.NUTRI_BREAKDOWN_UI ?? true)
      ) {
        const card = renderNutritionCard({
          nutrition: data.nutrition,
          breakdown: data.breakdown,
          logId: data.logId,
        });
        addMessage(card, 'bot', null, false);
      } else if (data?.nutrition && Number.isFinite(data.nutrition.calories)) {
        const n = data.nutrition;
        addMessage(
          `🍱 推定: P ${n.protein_g}g / F ${n.fat_g}g / C ${n.carbs_g}g / ${n.calories}kcal`,
          'bot',
        );
      } else {
        addMessage('✅ 記録しました', 'bot');
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

  // inline handlerや他スクリプトから呼べるように公開（これで no-unused-vars を回避）
  window.addMessage = addMessage;
});

// ---- NUTRI_BREAKDOWN_START renderNutritionCard ----
function renderNutritionCard({ nutrition, breakdown, logId }) {
  const card = document.createElement('div');
  card.className = 'message bot-message nutri-card'; // bot-messageクラスを追加
  card.dataset.logId = logId;

  const h = document.createElement('div');
  h.className = 'nutri-header';
  h.textContent = `🍱 ${nutrition?.dish || '食事'} ｜ 信頼度 ${Math.round(
    (nutrition?.confidence ?? 0) * 100,
  )}%`;

  const core = document.createElement('div');
  core.className = 'nutri-core';
  core.textContent = `P ${nutrition.protein_g}g / F ${nutrition.fat_g}g / C ${nutrition.carbs_g}g / ${nutrition.calories}kcal`;

  card.appendChild(h);
  card.appendChild(core);

  if (breakdown?.items?.length) {
    const ul = document.createElement('ul');
    ul.className = 'nutri-items';
    breakdown.items.slice(0, 5).forEach((it) => {
      const li = document.createElement('li');
      li.textContent = `${it.name || it.code} ${it.qty_g ?? ''}g`;
      ul.appendChild(li);
    });
    card.appendChild(ul);
  }

  const chipsWrap = document.createElement('div');
  chipsWrap.className = 'nutri-chips';

  function createChips(slot) {
    if (!slot) return null;
    const row = document.createElement('div');
    row.className = 'chip-row';
    const label = document.createElement('span');
    label.textContent = `❓ ${slot.question}`;
    row.appendChild(label);

    (slot.options || []).forEach((opt) => {
      const b = document.createElement('button');
      b.className = 'chip';
      b.textContent = slot.unit ? `${opt}${slot.unit}` : `${opt}`;
      if (opt === slot.selected) b.classList.add('selected');

      b.addEventListener('click', async () => {
        const currentCard = document.querySelector(
          `.nutri-card[data-log-id="${logId}"]`,
        );
        if (!currentCard) return;

        // Optimistic UI update
        const oldCore = currentCard.querySelector('.nutri-core').textContent;
        currentCard.querySelector('.nutri-core').textContent = '再計算中...';
        [...row.querySelectorAll('.chip')].forEach((el) =>
          el.classList.remove('selected'),
        );
        b.classList.add('selected');

        try {
          const resp = await fetch('/log/choose-slot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ logId, key: slot.key, value: opt }),
          });
          const data = await resp.json();
          if (data?.ok) {
            const newCard = renderNutritionCard({
              nutrition: data.nutrition,
              breakdown: data.breakdown,
              logId: data.logId,
            });
            currentCard.replaceWith(newCard);
          } else {
            currentCard.querySelector('.nutri-core').textContent = oldCore; // Rollback
          }
        } catch (e) {
          console.error(e);
          currentCard.querySelector('.nutri-core').textContent = oldCore; // Rollback
        }
      });
      row.appendChild(b);
    });
    return row;
  }

  const s = breakdown?.slots || {};
  const rRow = createChips(s.rice_size);
  const pRow = createChips(s.pork_cut);
  if (rRow) chipsWrap.appendChild(rRow);
  if (pRow) chipsWrap.appendChild(pRow);
  if (chipsWrap.children.length) card.appendChild(chipsWrap);

  if (breakdown?.warnings?.includes('kcal_reconciled')) {
    const warn = document.createElement('div');
    warn.className = 'nutri-warn';
    warn.textContent = '⚠️ kcalを整合のため調整しました';
    card.appendChild(warn);
  }

  return card;
}

// ---- NUTRI_BREAKDOWN_END renderNutritionCard ----
