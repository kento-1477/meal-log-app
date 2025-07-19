document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const loginError = document.getElementById('login-error');
  const registerError = document.getElementById('register-error');

  // ログイン処理
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.textContent = '';

    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const result = await response.json();

      if (response.ok) {
        // ログイン成功後、バックエンドから返されたredirectToに基づいてリダイレクト
        window.location.href = result.redirectTo || '/';
      } else {
        loginError.textContent = result.error || 'ログインに失敗しました。';
      }
    } catch (err) {
      loginError.textContent = 'ネットワークエラーが発生しました。';
    }
  });

  // 新規登録処理
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    registerError.textContent = '';

    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;

    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const result = await response.json();

      if (response.ok) {
        alert('登録が成功しました！ログインしてください。');
        // フォームをリセット
        registerForm.reset();
      } else {
        registerError.textContent = result.error || '登録に失敗しました。';
      }
    } catch (err) {
      registerError.textContent = 'ネットワークエラーが発生しました。';
    }
  });
});
