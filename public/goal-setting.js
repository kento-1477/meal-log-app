document.addEventListener('DOMContentLoaded', () => {
  const profileForm = document.getElementById('profile-form');
  const goalResultsContainer = document.getElementById(
    'goal-results-container',
  );
  const goalsForm = document.getElementById('goals-form');

  // 活動レベルの係数
  const activityMultipliers = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
  };

  // 「計算する」フォームの送信イベント
  profileForm.addEventListener('submit', (e) => {
    e.preventDefault(); // フォームのデフォルトの送信をキャンセル

    // フォームから値を取得
    const gender = profileForm.querySelector(
      'input[name="gender"]:checked',
    ).value;
    const age = parseInt(document.getElementById('age').value);
    const height = parseFloat(document.getElementById('height').value);
    const weight = parseFloat(document.getElementById('weight').value);
    const activityLevel = document.getElementById('activity-level').value;

    // 1. BMR（基礎代謝量）の計算 (ハリス・ベネディクト方程式)
    let bmr;
    if (gender === 'male') {
      bmr = 13.397 * weight + 4.799 * height - 5.677 * age + 88.362;
    } else {
      bmr = 9.247 * weight + 3.098 * height - 4.33 * age + 447.593;
    }

    // 2. TDEE（消費カロリー）の計算
    const tdee = bmr * activityMultipliers[activityLevel];

    // 3. 推奨栄養素の計算 (PFCバランス = 20:25:55)
    const targetCalories = Math.round(tdee);
    const targetProtein = Math.round((tdee * 0.2) / 4);
    const targetFat = Math.round((tdee * 0.25) / 9);
    const targetCarbs = Math.round((tdee * 0.55) / 4);

    // 計算結果をフォームに自動入力
    document.getElementById('recommended-calories').value = targetCalories;
    document.getElementById('recommended-protein').value = targetProtein;
    document.getElementById('recommended-fat').value = targetFat;
    document.getElementById('recommended-carbs').value = targetCarbs;

    // 推奨目標セクションを表示
    goalResultsContainer.style.display = 'block';
  });

  // 「この目標で設定する」フォームの送信イベント
  goalsForm.addEventListener('submit', (e) => {
    e.preventDefault(); // フォームのデフォルトの送信をキャンセル

    // 本来はここで目標をサーバーに保存するAPIを呼び出す
    // 例: const data = { ... };
    // fetch('/api/goals', { method: 'POST', body: JSON.stringify(data), ... });

    // ダッシュボード画面に遷移
    window.location.href = 'dashboard.html';
  });
});
