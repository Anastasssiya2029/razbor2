import { useState } from 'react';
import { useLocation } from 'wouter';
import { useBootstrapFirstArchitect } from '@workspace/api-client-react';
import { AppBrand } from '@/components/brand';

export default function BootstrapPage() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const bootstrap = useBootstrapFirstArchitect();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (password.length < 8) {
      setMessage('Пароль должен быть не менее 8 символов.');
      return;
    }
    bootstrap.mutate(
      { data: { email, displayName, password } },
      {
        onSuccess: () => setLocation('/login'),
        onError: (err: any) => setMessage(err?.message || 'Не удалось создать аккаунт.'),
      },
    );
  };

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="bootstrap-title">
        <AppBrand />
        <div className="auth-copy">
          <span className="admin-eyebrow">Первоначальная настройка</span>
          <h1 id="bootstrap-title">Создание аккаунта архитектора</h1>
          <p>Доступно только если пользователей ещё нет в системе.</p>
        </div>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label>Email<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label>Имя<input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required /></label>
          <label>
            Пароль
            <input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="Минимум 8 символов" />
          </label>
          <button className="primary-button compact" type="submit" disabled={bootstrap.isPending}>
            {bootstrap.isPending ? 'Создаю…' : 'Создать аккаунт'}
          </button>
        </form>
        {message && <p className="auth-message" role="status">{message}</p>}
      </section>
    </main>
  );
}
