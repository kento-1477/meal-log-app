document.addEventListener('DOMContentLoaded', async () => {
  const mealDataBody = document.getElementById('meal-data-body');
  const pfcPieChartCtx = document
    .getElementById('pfcPieChart')
    .getContext('2d');
  let pfcChartInstance = null; // Chart.jsインスタンスを保持する変数

  // データをロードして表示する関数
  async function loadAndDisplayData() {
    mealDataBody.innerHTML = ''; // 既存のデータをクリア
    try {
      const response = await fetch('/api/meal-data');
      if (!response.ok) {
        if (response.status === 401) {
          window.location.href = '/login'; // 認証切れの場合はログインページへリダイレクト
          return;
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const allMealData = await response.json();

      // 今日の日付を取得 (YYYY/MM/DD形式)
      const today = new Date();
      const todayString = `${today.getFullYear()}/${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getDate().toString().padStart(2, '0')}`;

      // 今日の食事データのみをフィルタリング
      const todayMealData = allMealData.filter((meal) => {
        // meal.timestamp は "YYYY/MM/DD HH:MM:SS" 形式を想定
        return meal.timestamp && meal.timestamp.startsWith(todayString);
      });

      if (todayMealData.length === 0) {
        mealDataBody.innerHTML =
          '<tr><td colspan="6">まだ今日の記録がありません。</td></tr>';
        // 今日のデータがない場合、KPIも0にリセット
        updateKPIs(0, 0, 0, 0, 0);
        updatePFCChart(0, 0, 0);
        return;
      }

      let totalCalories = 0;
      let totalProtein = 0;
      let totalFat = 0;
      let totalCarbs = 0;

      todayMealData.forEach((meal) => {
        const row = document.createElement('tr');
        // 時刻のみ表示
        const time = meal.timestamp
          ? meal.timestamp.split(' ')[1].substring(0, 5)
          : '';
        row.innerHTML = `
                    <td>${time}</td>
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

      // KPIとPFCチャートを更新
      updateKPIs(totalCalories, totalProtein, totalFat, totalCarbs, 2500); // 目標カロリーは仮で2500
      updatePFCChart(totalProtein, totalFat, totalCarbs);
    } catch (error) {
      console.error('Error fetching meal data:', error);
      mealDataBody.innerHTML =
        '<tr><td colspan="6">データの読み込み中にエラーが発生しました。<br>開発者ツール（F12）のConsoleタブを確認してください。</td></tr>';
    }
  }

  // KPIを更新する関数
  function updateKPIs(calories, protein, fat, carbs, targetCalories) {
    document.querySelector('#calories-tracker .kpi-value').textContent =
      `${calories} / ${targetCalories} kcal`;
    const calorieProgressBar = document.querySelector(
      '#calories-tracker .progress-bar',
    );
    const progressPercentage = (calories / targetCalories) * 100;
    calorieProgressBar.style.width = `${Math.min(progressPercentage, 100)}%`; // 100%を超えないように

    document.querySelector(
      '#pfc-summary-card .pfc-details p:nth-child(1) strong',
    ).textContent = `${protein} / 120g`; // 仮の目標値
    document.querySelector(
      '#pfc-summary-card .pfc-details p:nth-child(2) strong',
    ).textContent = `${fat} / 70g`; // 仮の目標値
    document.querySelector(
      '#pfc-summary-card .pfc-details p:nth-child(3) strong',
    ).textContent = `${carbs} / 250g`; // 仮の目標値
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

  // ページロード時にデータを表示
  loadAndDisplayData();
});
