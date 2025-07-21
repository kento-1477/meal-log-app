document.addEventListener('DOMContentLoaded', () => {
  console.log('Analytics page loaded.');

  // 推移グラフのダミー表示
  const trendsCtx = document.getElementById('trendsLineChart');
  if (trendsCtx) {
    new Chart(trendsCtx.getContext('2d'), {
      type: 'line',
      data: {
        labels: ['7/13', '7/14', '7/15', '7/16', '7/17', '7/18', '7/19'],
        datasets: [
          {
            label: '摂取カロリー (kcal)',
            data: [2200, 2100, 2300, 2500, 2400, 2600, 1500],
            borderColor: '#36A2EB',
            tension: 0.1,
          },
          {
            label: '体重 (kg)',
            data: [70.5, 70.4, 70.6, 70.3, 70.2, 70.1, 70.0],
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
              stepSize: 0.5, // 目盛りを0.5単位に設定
            },
            grid: { drawOnChartArea: false },
          },
        },
      },
    });
  }
});
