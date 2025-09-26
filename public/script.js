const ZERO_TOTALS = { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 };

function extractTotals(analysis = {}) {
  if (analysis && analysis.totals) {
    const t = analysis.totals;
    return {
      kcal: Number(t.kcal ?? t.calories ?? 0),
      protein_g: Number(t.protein_g ?? 0),
      fat_g: Number(t.fat_g ?? 0),
      carbs_g: Number(t.carbs_g ?? 0),
    };
  }
  if (analysis && analysis.nutrition) {
    const n = analysis.nutrition;
    return {
      kcal: Number(n.calories ?? 0),
      protein_g: Number(n.protein_g ?? 0),
      fat_g: Number(n.fat_g ?? 0),
      carbs_g: Number(n.carbs_g ?? 0),
    };
  }
  return { ...ZERO_TOTALS };
}

function extractBreakdown(analysis = {}) {
  const raw =
    analysis && analysis.breakdown && typeof analysis.breakdown === 'object'
      ? analysis.breakdown
      : {};
  const items = Array.isArray(raw.items)
    ? raw.items
    : Array.isArray(analysis.items)
      ? analysis.items
      : [];
  const warnings = Array.isArray(raw.warnings)
    ? raw.warnings
    : Array.isArray(analysis.warnings)
      ? analysis.warnings
      : [];
  return { ...raw, items, warnings };
}

function normalizeAnalysisForUI(analysis = {}) {
  const totals = extractTotals(analysis);
  const breakdown = extractBreakdown(analysis);
  const dish = analysis?.dish || '食事';
  const confidence =
    analysis?.confidence ??
    analysis?.meta?.confidence ??
    analysis?.base_confidence ??
    null;
  return {
    ...analysis,
    dish,
    confidence,
    totals,
    breakdown,
    nutrition: {
      calories: totals.kcal,
      protein_g: totals.protein_g,
      fat_g: totals.fat_g,
      carbs_g: totals.carbs_g,
    },
  };
}

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

      const normalized = normalizeAnalysisForUI(data ?? {});
      if (window.NUTRI_BREAKDOWN_UI ?? true) {
        const card = renderNutritionCard({
          analysis: normalized,
          totals: normalized.totals,
          breakdown: normalized.breakdown,
          logId: normalized.logId ?? data?.logId ?? null,
        });
        addMessage(card, 'bot', null, false);
      } else {
        const totals = normalized.totals;
        const macro = (value) => {
          const num = Number(value);
          if (!Number.isFinite(num)) return 0;
          return Number.isInteger(num) ? num : Number(num.toFixed(1));
        };
        const kcalText = (() => {
          const num = Number(totals.kcal);
          return Number.isFinite(num) ? Math.round(num) : 0;
        })();
        addMessage(
          `🍱 推定: P ${macro(totals.protein_g)}g / F ${macro(totals.fat_g)}g / C ${macro(totals.carbs_g)}g / ${kcalText}kcal`,
          'bot',
        );
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
function renderNutritionCard({ analysis, totals, breakdown, logId }) {
  const card = document.createElement('div');
  card.className = 'message bot-message nutri-card'; // bot-messageクラスを追加
  card.dataset.logId = logId;

  const safeTotals = totals ?? ZERO_TOTALS;
  const safeBreakdown =
    breakdown && typeof breakdown === 'object' ? breakdown : {};
  const items = Array.isArray(safeBreakdown.items) ? safeBreakdown.items : [];
  const isUncertain = items.length === 0 || items.some((it) => it.pending);
  const dish = analysis?.dish || '食事';
  const confidenceRaw =
    analysis?.confidence ??
    analysis?.meta?.confidence ??
    analysis?.base_confidence ??
    null;
  const confidencePct =
    confidenceRaw !== null && Number.isFinite(Number(confidenceRaw))
      ? Math.round(Number(confidenceRaw) * 100)
      : null;

  const h = document.createElement('div');
  h.className = 'nutri-header';
  h.textContent = isUncertain
    ? `🍱 ${dish} ｜ ⚠️ 要確認`
    : confidencePct !== null
      ? `🍱 ${dish} ｜ 信頼度 ${confidencePct}%`
      : `🍱 ${dish}`;

  const macroText = (value, decimals = 1) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return '0';
    if (decimals === 0) return Math.round(num).toString();
    const rounded = Number(num.toFixed(decimals));
    return Number.isInteger(rounded)
      ? rounded.toString()
      : rounded.toFixed(decimals);
  };

  const core = document.createElement('div');
  core.className = 'nutri-core';
  core.textContent = `P ${macroText(safeTotals.protein_g)}g / F ${macroText(
    safeTotals.fat_g,
  )}g / C ${macroText(safeTotals.carbs_g)}g / ${macroText(
    safeTotals.kcal,
    0,
  )}kcal`;

  card.appendChild(h);
  card.appendChild(core);

  if (items.length > 0) {
    const ul = document.createElement('ul');
    ul.className = 'nutri-items';
    items.slice(0, 5).forEach((it) => {
      const li = document.createElement('li');
      const label = it.name || it.code || '項目';
      const grams = it.qty_g ?? it.grams ?? it.quantity_g ?? null;
      let text = grams != null ? `${label} ${grams}g` : `${label}`;
      if (it.pending) {
        li.classList.add('pending-item');
        text += ' (未確定)';
      }
      li.textContent = text;
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

          // Handle 409 Conflict
          if (resp.status === 409) {
            alert('他の端末で更新されました。最新の状態を取得します。');
            const refetchResp = await fetch(`/api/log/${logId}`);
            const refetchData = await refetchResp.json();
            if (refetchData?.ok && refetchData.item?.ai_raw) {
              const aiRaw = refetchData.item.ai_raw || {};
              const normalizedRefetch = normalizeAnalysisForUI({
                ...aiRaw,
                logId: refetchData.item?.id ?? null,
                dish: aiRaw.dish || refetchData.item?.food_item,
              });
              const newCard = renderNutritionCard({
                analysis: normalizedRefetch,
                totals: normalizedRefetch.totals,
                breakdown: normalizedRefetch.breakdown,
                logId: normalizedRefetch.logId ?? logId,
              });
              currentCard.replaceWith(newCard);
            } else {
              currentCard.querySelector('.nutri-core').textContent = oldCore; // Rollback on refetch failure
            }
            return;
          }

          const data = await resp.json();
          if (data?.ok) {
            const normalizedResp = normalizeAnalysisForUI(data);
            const newCard = renderNutritionCard({
              analysis: normalizedResp,
              totals: normalizedResp.totals,
              breakdown: normalizedResp.breakdown,
              logId: normalizedResp.logId ?? logId,
            });
            currentCard.replaceWith(newCard);
          } else {
            currentCard.querySelector('.nutri-core').textContent = oldCore; // Rollback
            alert(`更新に失敗しました: ${data?.message || '不明なエラー'}`);
          }
        } catch (e) {
          console.error(e);
          currentCard.querySelector('.nutri-core').textContent = oldCore; // Rollback
          alert('通信エラーが発生しました。');
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
