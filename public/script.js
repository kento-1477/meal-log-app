// ---- NUTRI_BREAKDOWN_START renderNutritionCard ----
function renderNutritionCard({ nutrition, breakdown, logId }) {
  const chatBox = document.getElementById('chat-box');
  const card = document.createElement('div');
  card.className = 'message bot-message nutri-card'; // bot-messageクラスを追加
  card.dataset.logId = logId;

  const h = document.createElement('div');
  h.className = 'nutri-header';
  h.textContent = `🍱 ${nutrition?.dish || '食事'} ｜ 信頼度 ${Math.round((nutrition?.confidence ?? 0) * 100)}%`;

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

function addMessage(text, sender, imageUrl = null, save = true) {
  const chatBox = document.getElementById('chat-box');
  if (typeof text === 'object' && text.nodeType === 1) {
    // Check if text is a DOM element
    chatBox.appendChild(text);
  } else {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', `${sender}-message`);

    if (text) {
      const textNode = document.createElement('p');
      textNode.innerHTML = text; // innerHTML to reflect <br>
      messageElement.appendChild(textNode);
    }

    if (imageUrl) {
      const imageNode = document.createElement('img');
      imageNode.src = imageUrl;
      messageElement.appendChild(imageNode);
    }
    chatBox.appendChild(messageElement);
  }

  chatBox.scrollTop = chatBox.scrollHeight; // Auto-scroll

  if (save && typeof text === 'string') {
    // Only save string messages
    saveChatHistory({ text, sender, imageUrl });
  }
}

// ---- NUTRI_BREAKDOWN_END renderNutritionCard ----
