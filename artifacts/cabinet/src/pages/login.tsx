import { useState } from 'react';
import { useLocation } from 'wouter';
import { useLogin } from '@workspace/api-client-react';
import { AppBrand } from '@/components/brand';

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const login = useLogin();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    login.mutate(
      { data: { email, password } },
      {
        onSuccess: () => {
          window.location.href = '/';
        },
        onError: (err: any) => {
          setMessage(err?.message || 'Неверный email или пароль');
        },
      },
    );
  };

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <AppBrand />
        <div className="auth-copy">
          <span className="admin-eyebrow">Сервис разбора 7К</span>
          <h1 id="auth-title">Вход в кабинет</h1>
          <p>Введите рабочий email и пароль.</p>
        </div>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            Email
            <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Пароль
            <span className="password-input">
              <input
                type={passwordVisible ? 'text' : 'password'}
                autoComplete="current-password"
                minLength={6}
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                className="password-visibility-toggle"
                type="button"
                aria-label={passwordVisible ? 'Скрыть пароль' : 'Показать пароль'}
                aria-pressed={passwordVisible}
                onClick={() => setPasswordVisible((v) => !v)}
              >
                <span className="password-visibility-icon" aria-hidden="true" />
              </button>
            </span>
          </label>
          <button className="primary-button compact" type="submit" disabled={login.isPending}>
            {login.isPending ? 'Проверяю…' : 'Войти'}
          </button>
        </form>
        {message && <p className="auth-message" role="status">{message}</p>}
      </section>
    </main>
  );
}
