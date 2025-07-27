document.addEventListener('DOMContentLoaded', async () => {
  const mealDataBody = document.getElementById('meal-data-body');
  const pfcPieChartCtx = document
    .getElementById('pfcPieChart')
    .getContext('2d');
  let pfcChartInstance = null; // Chart.jsインスタンスを保持する変数

  const startDateInput = document.getElementById('start-date');
  const endDateInput = document.getElementById('end-date');
  const filterButton = document.getElementById('filter-button');

  // 日付の初期値を設定（今日1日分）
  const today = new Date();
  const todayString = today.toISOString().split('T')[0];

  startDateInput.value = todayString;
  endDateInput.value = todayString;

  // データをロードして表示する関数
  async function loadAndDisplayData(startDate, endDate) {
    mealDataBody.innerHTML = '<tr><td colspan="6">読み込み中...</td></tr>'; // 既存のデータをクリア

    // 日付が未指定の場合は何もしない
    if (!startDate || !endDate) {
      mealDataBody.innerHTML =
        '<tr><td colspan="6">開始日と終了日を指定してください。</td></tr>';
      return;
    }

    try {
      // APIリクエストに日付範囲を含める
      const response = await fetch(
        `/api/meal-data?start=${startDate}&end=${endDate}`,
        { credentials: 'include' },
      );
      if (!response.ok) {
        if (response.status === 401) {
          window.location.href = '/login'; // 認証切れの場合はログインページへリダイレクト
          return;
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const mealData = await response.json();

      if (mealData.length === 0) {
        mealDataBody.innerHTML =
          '<tr><td colspan="6">この期間の記録はありません。</td></tr>';
        // データがない場合、KPIも0にリセット
        updateKPIs(0, 0, 0, 0, 0);
        updatePFCChart(0, 0, 0);
        return;
      }

      let totalCalories = 0;
      let totalProtein = 0;
      let totalFat = 0;
      let totalCarbs = 0;

      mealDataBody.innerHTML = ''; // データをクリア

      mealData.forEach((meal) => {
        const row = document.createElement('tr');
        const mealDate = new Date(meal.timestamp);
        // 日付と時刻を表示
        const dateTimeString = `${mealDate.toLocaleDateString('ja-JP')} ${mealDate.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`;

        row.innerHTML = `
                    <td>${dateTimeString}</td>
                    <td>${meal.mealName || ''}</td>
                    <td>${meal.protein || ''}</td>
                    <td>${meal.fat || ''}</td>
                    <td>${meal.carbs || ''}</td>
                    <td>${meal.calories || ''}</td>
                `;
        mealDataBody.appendChild(row);

        totalCalories += parseFloat(meal.calories) || 0;
        totalProtein += parseFloat(meal.protein) || 0;
        totalFat += parseFloat(meal.fat) || 0;
        totalCarbs += parseFloat(meal.carbs) || 0;
      });

      // 目標値を取得
      const goalsResponse = await fetch('/api/goals', {
        credentials: 'include',
      });
      let userGoals = {
        target_calories: 2500, // デフォルト値
        target_protein: 120,
        target_fat: 70,
        target_carbs: 250,
      };
      if (goalsResponse.ok) {
        const goalsData = await goalsResponse.json();
        userGoals = {
          target_calories:
            goalsData.target_calories || userGoals.target_calories,
          target_protein: goalsData.target_protein || userGoals.target_protein,
          target_fat: goalsData.target_fat || userGoals.target_fat,
          target_carbs: goalsData.target_carbs || userGoals.target_carbs,
        };
      } else {
        console.warn(
          '目標設定が見つからないか、取得に失敗しました。デフォルト値を使用します。',
        );
      }

      // KPIとPFCチャートを更新
      updateKPIs(
        totalCalories,
        totalProtein,
        totalFat,
        totalCarbs,
        userGoals.target_calories,
        userGoals.target_protein,
        userGoals.target_fat,
        userGoals.target_carbs,
      );
      updatePFCChart(totalProtein, totalFat, totalCarbs);
    } catch (error) {
      console.error('Error fetching meal data:', error);
      mealDataBody.innerHTML =
        '<tr><td colspan="6">データの読み込み中にエラーが発生しました。</td></tr>';
    }
  }

  // KPIを更新する関数
  function updateKPIs(
    calories,
    protein,
    fat,
    carbs,
    targetCalories,
    targetProtein,
    targetFat,
    targetCarbs,
  ) {
    document.querySelector('#calories-tracker .kpi-value').textContent =
      `${Math.round(calories)} / ${targetCalories} kcal`;
    const calorieProgressBar = document.querySelector(
      '#calories-tracker .progress-bar',
    );
    const progressPercentage =
      targetCalories > 0 ? (calories / targetCalories) * 100 : 0;
    calorieProgressBar.style.width = `${Math.min(progressPercentage, 100)}%`; // 100%を超えないように

    document.querySelector(
      '#pfc-summary-card .pfc-details p:nth-child(1) strong',
    ).textContent = `${Math.round(protein)} / ${targetProtein}g`;
    document.querySelector(
      '#pfc-summary-card .pfc-details p:nth-child(2) strong',
    ).textContent = `${Math.round(fat)} / ${targetFat}g`;
    document.querySelector(
      '#pfc-summary-card .pfc-details p:nth-child(3) strong',
    ).textContent = `${Math.round(carbs)} / ${targetCarbs}g`;
  }

  // PFCチャートを更新する関数
  function updatePFCChart(protein, fat, carbs) {
    const totalPFC = protein + fat + carbs;
    const pfcData = totalPFC > 0 ? [protein, fat, carbs] : [1, 1, 1]; // データがない場合は均等に表示

    if (pfcChartInstance) {
      pfcChartInstance.data.datasets[0].data = pfcData;
      pfcChartInstance.update();
    } else {
      pfcChartInstance = new Chart(pfcPieChartCtx, {
        type: 'doughnut',
        data: {
          labels: ['タンパク質', '脂質', '炭水化物'],
          datasets: [
            {
              data: pfcData,
              backgroundColor: ['#36A2EB', '#FF6384', '#FFCE56'],
              borderWidth: 2,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false,
            },
          },
          cutout: '60%',
        },
      });
    }
  }

  // フィルターボタンのクリックイベント
  filterButton.addEventListener('click', () => {
    loadAndDisplayData(startDateInput.value, endDateInput.value);
  });

  // ページロード時に初期データを表示
  loadAndDisplayData(startDateInput.value, endDateInput.value);
  loadAIAdivce();
  loadMealScore();
  loadNotifications(); // 変更
});

async function loadNotifications() {
  const notificationList = document.getElementById('notification-list');
  notificationList.innerHTML = '<p>通知を確認中...</p>';

  try {
    const response = await fetch('/api/notifications');
    if (!response.ok) {
      if (response.status === 401) {
        window.location.href = '/login';
        return;
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const notifications = await response.json();
    if (notifications && notifications.length > 0) {
      notificationList.innerHTML = notifications
        .map((n) => `<div class="notification-item">🔔 ${n.message}</div>`)
        .join('');
      // 通知を既読にする
      const notificationIds = notifications.map((n) => n.id);
      await fetch('/api/reminders/notifications/mark-as-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationIds }),
        credentials: 'include',
      });
    } else {
      notificationList.innerHTML = '<p>新しい通知はありません。</p>';
    }
  } catch (error) {
    console.error('Error fetching notifications:', error);
    notificationList.innerHTML = '<p>通知の取得に失敗しました。</p>';
  }
}

async function loadAIAdivce() {
  const aiAdviceCard = document.getElementById('ai-advice-card');
  const aiCommentElement = aiAdviceCard.querySelector('.ai-comment p');
  aiCommentElement.textContent = 'AIアドバイスを生成中...';

  try {
    const response = await fetch('/api/ai-advice', { credentials: 'include' });
    if (!response.ok) {
      if (response.status === 401) {
        window.location.href = '/login';
        return;
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    aiCommentElement.textContent = data.advice;
  } catch (error) {
    console.error('Error fetching AI advice:', error);
    aiCommentElement.textContent = 'AIアドバイスの取得に失敗しました。';
  }
}
