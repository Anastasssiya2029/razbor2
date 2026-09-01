import { useState } from 'react';
import { useListUsers, useChangeUserRole, useCreateInvite, getListUsersQueryKey } from '@workspace/api-client-react';
import { useAuth } from '@/components/auth-provider';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { CabinetNav, CabinetTitleRow } from '@/components/cabinet-header';

const roleLabels = { manager: 'Менеджер', admin: 'Администратор', architect: 'Архитектор' };
const statusLabels = { active: 'Активен', invited: 'Приглашён', disabled: 'Отключён' };

export default function TeamPage() {
  const { user: currentUser } = useAuth();
  const { data: users, isLoading } = useListUsers();
  const changeRole = useChangeUserRole();
  const createInvite = useCreateInvite();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<'manager' | 'admin' | 'architect'>('manager');
  const [inviteLink, setInviteLink] = useState('');
  const [copied, setCopied] = useState(false);
  const isArchitect = currentUser?.role === 'architect';
  const isAdminOrArchitect = isArchitect || currentUser?.role === 'admin';

  const handleCreateInvite = (event: React.FormEvent) => {
    event.preventDefault();
    createInvite.mutate({ data: { email: inviteEmail, displayName: inviteName, role: inviteRole } }, {
      onSuccess: (data) => {
        toast({ title: 'Приглашение создано' });
        setInviteLink(`${window.location.origin}/invite/${data.token}`);
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      },
      onError: (err: any) => toast({ title: 'Ошибка', description: err.message || 'Не удалось создать приглашение', variant: 'destructive' }),
    });
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRoleChange = (userId: string, newRole: 'manager' | 'admin' | 'architect') => {
    changeRole.mutate({ userId, data: { role: newRole } }, {
      onSuccess: () => {
        toast({ title: 'Роль обновлена' });
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      },
      onError: (err: any) => toast({ title: 'Ошибка', description: err.message || 'Не удалось изменить роль', variant: 'destructive' }),
    });
  };

  if (!isAdminOrArchitect) return <main className="admin-shell"><p className="admin-empty error">Доступ запрещён. У вас нет прав для просмотра этой страницы.</p></main>;

  return (
    <main className="admin-shell">
      <CabinetNav />
      <CabinetTitleRow eyebrow="Управление доступом" title="Команда" subtitle="Администратор приглашает сотрудников. Только архитектор меняет роли." />
      <section className="team-layout">
        <form className="team-form" onSubmit={handleCreateInvite}>
          <h2>{inviteLink ? 'Приглашение создано' : 'Пригласить сотрудника'}</h2>
          {!inviteLink ? <>
            <label htmlFor="invite-name">Имя<input id="invite-name" required value={inviteName} onChange={(event) => setInviteName(event.target.value)} placeholder="Анна Смирнова" /></label>
            <label htmlFor="invite-email">Email сотрудника<input id="invite-email" type="email" required value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="manager@company.com" /></label>
            <label htmlFor="invite-role">Роль
              <select id="invite-role" value={inviteRole} onChange={(event) => setInviteRole(event.target.value as 'manager' | 'admin' | 'architect')}>
                <option value="manager">Менеджер</option><option value="admin">Администратор</option>{isArchitect && <option value="architect">Архитектор</option>}
              </select>
            </label>
            <button className="admin-button primary" type="submit" disabled={createInvite.isPending}>{createInvite.isPending ? 'Создаю…' : 'Создать ссылку'}</button>
          </> : <>
            <label htmlFor="invite-link">Ссылка для приглашения<input id="invite-link" readOnly value={inviteLink} /></label>
            <button className="admin-button" type="button" onClick={copyToClipboard}>{copied ? 'Скопировано' : 'Скопировать ссылку'}</button>
            <button className="admin-button primary" type="button" onClick={() => setInviteLink('')}>Готово</button>
          </>}
        </form>
        <section className="team-list" aria-label="Сотрудники">
          {isLoading ? <p className="admin-empty">Загружаю сотрудников…</p> : !users || users.length === 0 ? <p className="admin-empty">Сотрудники не найдены.</p> : users.map((member) => (
            <article key={member.id} className="team-member">
              <div><strong>{member.displayName}</strong><span>{member.email}</span><small>{statusLabels[member.status]}</small></div>
              {isArchitect && member.id !== currentUser?.id ? (
                <select aria-label={`Роль ${member.displayName}`} value={member.role} onChange={(event) => handleRoleChange(member.id, event.target.value as 'manager' | 'admin' | 'architect')}>
                  <option value="manager">Менеджер</option><option value="admin">Администратор</option><option value="architect">Архитектор</option>
                </select>
              ) : <b>{roleLabels[member.role]}</b>}
            </article>
          ))}
        </section>
      </section>
    </main>
  );
}