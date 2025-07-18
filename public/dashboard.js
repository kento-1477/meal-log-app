document.addEventListener('DOMContentLoaded', async () => {
  const mealDataBody = document.getElementById('meal-data-body');
  const editModal = document.getElementById('edit-modal');
  const closeButton = document.querySelector('.close-button');
  const cancelEditButton = document.getElementById('cancel-edit-button');
  const editForm = document.getElementById('edit-form');

  let currentEditingRow = null; // 現在編集中の行のデータ

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
      const data = await response.json();

      if (data.length === 0) {
        mealDataBody.innerHTML =
          '<tr><td colspan="9">まだ記録がありません。</td></tr>'; // 列数を9に修正
        return;
      }

      data.forEach((meal) => {
        const row = document.createElement('tr');
        row.innerHTML = `
                    <td>${meal.timestamp || ''}</td>
                    <td>${meal.mealName || ''}</td>
                    <td>${meal.protein || ''}</td>
                    <td>${meal.fat || ''}</td>
                    <td>${meal.carbs || ''}</td>
                    <td>${meal.calories || ''}</td>
                    <td>${meal.imagePath ? `<img src="/${meal.imagePath}" class="meal-image">` : ''}</td>
                    <td>${meal.memo || ''}</td>
                    <td><button class="edit-button" data-id="${meal.id}">編集</button></td>
                `;
        mealDataBody.appendChild(row);
      });

      // 編集ボタンのイベントリスナーを設定
      document.querySelectorAll('.edit-button').forEach((button) => {
        button.addEventListener('click', (event) => {
          const id = parseInt(event.target.dataset.id); // IDを数値に変換
          currentEditingRow = data.find((meal) => meal.id === id); // 編集対象のデータを特定
          if (currentEditingRow) {
            // フォームにデータをセット
            document.getElementById('edit-timestamp').value =
              currentEditingRow.timestamp;
            document.getElementById('edit-mealName').value =
              currentEditingRow.mealName;
            document.getElementById('edit-protein').value =
              currentEditingRow.protein;
            document.getElementById('edit-fat').value = currentEditingRow.fat;
            document.getElementById('edit-carbs').value =
              currentEditingRow.carbs;
            document.getElementById('edit-calories').value =
              currentEditingRow.calories;
            document.getElementById('edit-memo').value = currentEditingRow.memo;
            editModal.style.display = 'block'; // モーダルを表示
          }
        });
      });
    } catch (error) {
      console.error('Error fetching meal data:', error);
      mealDataBody.innerHTML =
        '<tr><td colspan="9">データの読み込み中にエラーが発生しました。<br>開発者ツール（F12）のConsoleタブを確認してください。</td></tr>';
    }
  }

  // モーダルを閉じるイベント
  closeButton.addEventListener('click', () => {
    editModal.style.display = 'none';
  });
  cancelEditButton.addEventListener('click', () => {
    editModal.style.display = 'none';
  });
  window.addEventListener('click', (event) => {
    if (event.target === editModal) {
      editModal.style.display = 'none';
    }
  });

  // 編集フォームの送信処理
  editForm.addEventListener('submit', async (event) => {
    event.preventDefault(); // フォームのデフォルト送信を防止

    const updatedData = {
      id: currentEditingRow.id, // レコードIDを追加
      timestamp: document.getElementById('edit-timestamp').value,
      mealName: document.getElementById('edit-mealName').value,
      protein: document.getElementById('edit-protein').value,
      fat: document.getElementById('edit-fat').value,
      carbs: document.getElementById('edit-carbs').value,
      calories: document.getElementById('edit-calories').value,
      memo: document.getElementById('edit-memo').value,
      imagePath: currentEditingRow.imagePath, // 画像パスは変更しない
    };

    try {
      const response = await fetch('/api/meal-data', {
        method: 'PUT', // PUTリクエストで更新
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedData),
      });

      if (response.ok) {
        alert('記録が更新されました！');
        editModal.style.display = 'none'; // モーダルを閉じる
        loadAndDisplayData(); // データを再ロードして表示を更新
      } else {
        alert('記録の更新に失敗しました。');
      }
    } catch (error) {
      console.error('Error updating meal data:', error);
      alert('記録の更新中にエラーが発生しました。');
    }
  });

  // --- 目標設定表示機能のJavaScript ---
  async function fetchGoalsData() {
    try {
      const response = await fetch('/api/goals');
      if (response.ok) {
        const data = await response.json();
        document.getElementById('display-target-calories').textContent =
          data.target_calories || '--';
        document.getElementById('display-target-protein').textContent =
          data.target_protein || '--';
        document.getElementById('display-target-fat').textContent =
          data.target_fat || '--';
        document.getElementById('display-target-carbs').textContent =
          data.target_carbs || '--';
      } else if (response.status === 404) {
        // 目標設定がまだない場合
        document.getElementById('display-target-calories').textContent =
          '未設定';
        document.getElementById('display-target-protein').textContent =
          '未設定';
        document.getElementById('display-target-fat').textContent = '未設定';
        document.getElementById('display-target-carbs').textContent = '未設定';
      } else {
        const errorData = await response.json();
        console.error('Error fetching goals:', errorData.error);
        alert('目標設定の取得に失敗しました。');
      }
    } catch (error) {
      console.error('Error fetching goals:', error);
      alert('目標設定の取得中にエラーが発生しました。');
    }
  }

  // 「目標を編集」ボタンのイベントリスナー
  const editGoalsButton = document.getElementById('edit-goals-button');
  if (editGoalsButton) {
    editGoalsButton.addEventListener('click', () => {
      window.location.href = '/goal-setting';
    });
  }

  // ページロード時にデータを表示
  loadAndDisplayData();
  fetchGoalsData(); // 目標データもロード
});

// 既存の関数はそのまま残す
function openEditModal(meal) {
  document.getElementById('edit-timestamp').value = meal.id; // IDをセット
  document.getElementById('edit-mealName').value = meal.mealName;
  document.getElementById('edit-protein').value = meal.protein;
  document.getElementById('edit-fat').value = meal.fat;
  document.getElementById('edit-carbs').value = meal.carbs;
  document.getElementById('edit-calories').value = meal.calories;
  document.getElementById('edit-memo').value = meal.memo;
  document.getElementById('edit-modal').style.display = 'block';
}

async function deleteMealRecord(id) {
  if (!confirm('この記録を削除してもよろしいですか？')) {
    return;
  }

  try {
    const response = await fetch('/api/meal-data', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: id }),
    });

    if (response.ok) {
      alert('記録が削除されました！');
      loadAndDisplayData(); // データを再取得して表示を更新
    } else {
      const errorData = await response.json();
      alert(`削除に失敗しました: ${errorData.error}`);
    }
  } catch (error) {
    console.error('Error deleting meal record:', error);
    alert('記録の削除中にエラーが発生しました。');
  }
}
