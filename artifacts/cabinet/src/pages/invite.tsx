import { useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { useGetInvitePreview, useAcceptInvite } from '@workspace/api-client-react';
import { AppBrand } from '@/components/brand';

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const [, setLocation] = useLocation();
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const { data: invite, isLoading, isError } = useGetInvitePreview(token || '');
  const acceptInvite = useAcceptInvite();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setMessage(null);
    if (password.length < 8) {
      setMessage('Пароль должен быть не менее 8 символов.');
      return;
    }
    acceptInvite.mutate(
      { token, data: { password } },
      {
        onSuccess: () => setLocation('/login'),
        onError: (err: any) => setMessage(err?.message || 'Не удалось принять приглашение.'),
      },
    );
  };

  if (isLoading) {
    return <main className="admin-loading">Проверяю приглашение…</main>;
  }

  if (isError || !invite) {
    return (
      <main className="auth-page">
        <section className="auth-card" aria-labelledby="invite-error-title">
          <AppBrand />
          <div className="auth-copy">
            <h1 id="invite-error-title">Приглашение не найдено</h1>
            <p>Возможно, срок действия истёк или ссылка неверна.</p>
          </div>
          <button className="primary-button compact" type="button" onClick={() => setLocation('/login')}>На страницу входа</button>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="invite-title">
        <AppBrand />
        <div className="auth-copy">
          <span className="admin-eyebrow">Приглашение в команду</span>
          <h1 id="invite-title">{invite.displayName}</h1>
          <p>{invite.email} · роль «{invite.role}»</p>
        </div>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            Придумайте пароль
            <input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="Минимум 8 символов" />
          </label>
          <button className="primary-button compact" type="submit" disabled={acceptInvite.isPending}>
            {acceptInvite.isPending ? 'Активирую…' : 'Активировать аккаунт'}
          </button>
        </form>
        {message && <p className="auth-message" role="status">{message}</p>}
      </section>
    </main>
  );
}
