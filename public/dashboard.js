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
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();

            if (data.length === 0) {
                mealDataBody.innerHTML = '<tr><td colspan="9">まだ記録がありません。</td></tr>'; // 列数を9に修正
                return;
            }

            data.forEach(meal => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${meal['日時'] || ''}</td>
                    <td>${meal['料理名'] || ''}</td>
                    <td>${meal['タンパク質(g)'] || ''}</td>
                    <td>${meal['脂質(g)'] || ''}</td>
                    <td>${meal['炭水化物(g)'] || ''}</td>
                    <td>${meal['カロリー(kcal)'] || ''}</td>
                    <td>${meal['画像パス'] ? `<img src="/${meal['画像パス']}" class="meal-image">` : ''}</td>
                    <td>${meal['メモ'] || ''}</td>
                    <td><button class="edit-button" data-timestamp="${meal['日時']}">編集</button></td>
                `;
                mealDataBody.appendChild(row);
            });

            // 編集ボタンのイベントリスナーを設定
            document.querySelectorAll('.edit-button').forEach(button => {
                button.addEventListener('click', (event) => {
                    const timestamp = event.target.dataset.timestamp;
                    currentEditingRow = data.find(meal => meal['日時'] === timestamp); // 編集対象のデータを特定
                    if (currentEditingRow) {
                        // フォームにデータをセット
                        document.getElementById('edit-timestamp').value = currentEditingRow['日時'];
                        document.getElementById('edit-mealName').value = currentEditingRow['料理名'];
                        document.getElementById('edit-protein').value = currentEditingRow['タンパク質(g)'];
                        document.getElementById('edit-fat').value = currentEditingRow['脂質(g)'];
                        document.getElementById('edit-carbs').value = currentEditingRow['炭水化物(g)'];
                        document.getElementById('edit-calories').value = currentEditingRow['カロリー(kcal)'];
                        document.getElementById('edit-memo').value = currentEditingRow['メモ'];
                        editModal.style.display = 'block'; // モーダルを表示
                    }
                });
            });

        } catch (error) {
            console.error('Error fetching meal data:', error);
            mealDataBody.innerHTML = '<tr><td colspan="9">データの読み込み中にエラーが発生しました。<br>開発者ツール（F12）のConsoleタブを確認してください。</td></tr>';
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
            timestamp: document.getElementById('edit-timestamp').value,
            mealName: document.getElementById('edit-mealName').value,
            protein: document.getElementById('edit-protein').value,
            fat: document.getElementById('edit-fat').value,
            carbs: document.getElementById('edit-carbs').value,
            calories: document.getElementById('edit-calories').value,
            memo: document.getElementById('edit-memo').value,
            imagePath: currentEditingRow['画像パス'] // 画像パスは変更しない
        };

        try {
            const response = await fetch('/api/meal-data', {
                method: 'PUT', // PUTリクエストで更新
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(updatedData)
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

    // ページロード時にデータを表示
    loadAndDisplayData();
});