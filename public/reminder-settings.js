// [PATCH-REMINDERS-APPLIED v1]
document.addEventListener('DOMContentLoaded', () => {
  // 常に Cookie を送る fetch ラッパ
  const withCreds = (url, options = {}) => {
    const init = { credentials: 'include', ...options };
    // options.headers があるならそのまま維持
    return fetch(url, init);
  };
  const reminderList = document.getElementById('reminder-list');
  const addReminderBtn = document.getElementById('add-reminder-btn');
  const saveSettingsBtn = document.getElementById('save-settings-btn');
  const reminderCardTemplate = document.getElementById(
    'reminder-card-template',
  );

  let reminders = [];

  // リマインダーをサーバーから読み込む
  const loadReminders = async () => {
    try {
      const response = await withCreds('/api/reminders/reminder-settings');
      if (!response.ok) {
        throw new Error('リマインダーの読み込みに失敗しました。');
      }
      const data = await response.json();
      reminders = (data || []).map((r) => ({
        id: r.id,
        name: r.reminder_name,
        time: r.notification_time,
        days: r.days_of_week,
        is_enabled: r.is_enabled,
        message: r.message || '',
      }));
      renderReminders();
    } catch (error) {
      console.error('Error loading reminders:', error);
      alert('リマインダーの読み込みに失敗しました。');
    }
  };

  // リマインダーを描画する
  const renderReminders = () => {
    reminderList.innerHTML = '';
    reminders.forEach((reminder) => {
      const card = createReminderCard(reminder);
      reminderList.appendChild(card);
    });
  };

  // リマインダーカードを作成する
  const createReminderCard = (reminder) => {
    const card = reminderCardTemplate.content.cloneNode(true);
    const reminderNameInput = card.querySelector('.reminder-name');
    const reminderEnabledToggle = card.querySelector('.reminder-enabled');
    const reminderTimeInput = card.querySelector('.reminder-time');
    const reminderDaysContainer = card.querySelector('.reminder-days');
    const reminderMessageTextarea = card.querySelector('.reminder-message');
    const deleteBtn = card.querySelector('.delete-reminder-btn');

    reminderNameInput.value = reminder.name;
    reminderEnabledToggle.checked = reminder.is_enabled;
    reminderTimeInput.value = reminder.time;
    reminderMessageTextarea.value = reminder.message;

    // 曜日のチェックボックスを生成
    ['月', '火', '水', '木', '金', '土', '日'].forEach((day) => {
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = day;
      checkbox.checked = reminder.days.includes(day);
      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(day));
      reminderDaysContainer.appendChild(label);
    });

    // 削除ボタンのイベントリスナー
    deleteBtn.addEventListener('click', async () => {
      if (!confirm('このリマインダーを削除しますか？')) return;
      try {
        const response = await withCreds(
          `/api/reminders/reminder-settings/${reminder.id}`,
          {
            method: 'DELETE',
          },
        );
        if (!response.ok) throw new Error('削除に失敗しました。');
        alert('リマインダーを削除しました。');
        loadReminders();
      } catch (error) {
        console.error('Error deleting reminder:', error);
        alert('リマインダーの削除に失敗しました。');
      }
    });

    return card;
  };

  // 新しいリマインダーを追加
  addReminderBtn.addEventListener('click', () => {
    const newReminder = {
      id: null, // 新しいリマインダー
      name: '',
      time: '09:00',
      days: [],
      is_enabled: true,
      message: '',
    };
    reminders.push(newReminder);
    renderReminders();
  });

  // 設定を保存
  saveSettingsBtn.addEventListener('click', async () => {
    try {
      // リマインダー設定の保存（UPSERT 的）
      const updatedReminders = reminders.map((r) => ({
        id: r.id,
        reminder_name: r.name,
        notification_time: r.time,
        days_of_week: r.days,
        is_enabled: r.is_enabled,
        message: r.message,
      }));

      await Promise.all(
        updatedReminders.map((r) =>
          withCreds('/api/reminders/reminder-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(r),
          }),
        ),
      );

      // コーチングレベルの保存（存在すれば best-effort）
      const levelEl = document.querySelector(
        'input[name="coaching-level"]:checked',
      );
      if (levelEl) {
        try {
          await withCreds('/api/reminders/coaching-level', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ coaching_level: levelEl.value }),
          });
        } catch (_e) {
          console.warn(
            'coaching-level 保存はスキップ（API未実装/エラー）:',
            _e?.message || _e,
          );
        }
      }

      alert('設定を保存しました！');
      loadReminders(); // 再読み込み
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('設定の保存に失敗しました。');
    }
  });

  // コーチングレベルを読み込む
  const loadCoachingLevel = async () => {
    try {
      const response = await fetch('/api/reminders/coaching-level', {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch coaching level');
      const data = await response.json();
      if (data.coaching_level === 'intense') {
        document.getElementById('intense').checked = true;
      } else {
        document.getElementById('gentle').checked = true;
      }
    } catch (error) {
      console.error('Error loading coaching level:', error);
    }
  };

  // 初期化
  loadReminders();
  loadCoachingLevel();
});
