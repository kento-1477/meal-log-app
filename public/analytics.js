document.addEventListener('DOMContentLoaded', async () => {
  console.log('Analytics page loaded.');

  const trendsCtx = document.getElementById('trendsLineChart');
  const fullMealDataBody = document.getElementById('full-meal-data-body');
  let trendsChartInstance = null;

  async function loadAndDisplayAnalyticsData() {
    try {
      const response = await fetch('/api/meal-data');
      if (!response.ok) {
        if (response.status === 401) {
          window.location.href = '/login';
          return;
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const allMealData = await response.json();

      // 全食事記録テーブルの更新
      fullMealDataBody.innerHTML = '';
      if (allMealData.length === 0) {
        fullMealDataBody.innerHTML =
          '<tr><td colspan="7">まだ記録がありません。</td></tr>';
      } else {
        allMealData.forEach((meal) => {
          const row = document.createElement('tr');
          const time = meal.timestamp
            ? meal.timestamp.split(' ')[1].substring(0, 5)
            : '';
          const date = meal.timestamp ? meal.timestamp.split(' ')[0] : '';
          row.innerHTML = `
                        <td>${date} ${time}</td>
                        <td>${meal.mealName || ''}</td>
                        <td>${meal.protein || ''}</td>
                        <td>${meal.fat || ''}</td>
                        <td>${meal.carbs || ''}</td>
                        <td>${meal.calories || ''}</td>
                        <td>${meal.imagePath ? `<img src="/${meal.imagePath}" class="meal-image">` : ''}</td>
                        <td>${meal.memo || ''}</td>
                    `;
          fullMealDataBody.appendChild(row);
        });
      }

      // カロリー推移データの集計
      const dailyCalories = {};
      allMealData.forEach((meal) => {
        const date = meal.timestamp ? meal.timestamp.split(' ')[0] : 'Unknown';
        dailyCalories[date] =
          (dailyCalories[date] || 0) + (parseFloat(meal.calories) || 0);
      });

      const sortedDates = Object.keys(dailyCalories).sort(
        (a, b) => new Date(a) - new Date(b),
      );
      const caloriesData = sortedDates.map((date) => dailyCalories[date]);

      // 体重データはダミーのまま
      const dummyWeightData = sortedDates.map((_, index) => 70.5 - index * 0.1); // 仮の減少傾向

      // グラフの更新
      if (trendsChartInstance) {
        trendsChartInstance.data.labels = sortedDates;
        trendsChartInstance.data.datasets[0].data = caloriesData;
        trendsChartInstance.data.datasets[1].data = dummyWeightData;
        trendsChartInstance.update();
      } else if (trendsCtx) {
        trendsChartInstance = new Chart(trendsCtx.getContext('2d'), {
          type: 'line',
          data: {
            labels: sortedDates,
            datasets: [
              {
                label: '摂取カロリー (kcal)',
                data: caloriesData,
                borderColor: '#36A2EB',
                tension: 0.1,
              },
              {
                label: '体重 (kg)',
                data: dummyWeightData,
                borderColor: '#FF6384',
                yAxisID: 'y1',
                tension: 0.1,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              y: {
                position: 'left',
                title: { display: true, text: 'カロリー (kcal)' },
              },
              y1: {
                position: 'right',
                title: { display: true, text: '体重 (kg)' },
                ticks: {
                  stepSize: 0.5,
                },
                grid: {
                  drawOnChartArea: false,
                },
              },
            },
          },
        });
      }
    } catch (error) {
      console.error('Error fetching analytics data:', error);
      fullMealDataBody.innerHTML =
        '<tr><td colspan="7">データの読み込み中にエラーが発生しました。<br>開発者ツール（F12）のConsoleタブを確認してください。</td></tr>';
    }
  }

  loadAndDisplayAnalyticsData();
});
