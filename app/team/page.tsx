"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { AppBrand } from "@/app/_components/brand";
import { logoutAndRedirect, useAppSession } from "@/app/_components/app-session";
import type { AppRole, AppUser } from "@/server/auth";

const ROLE_LABELS: Record<AppRole, string> = { architect: "Архитектор", admin: "Администратор", manager: "Менеджер" };
const STATUS_LABELS: Record<AppUser["status"], string> = { invited: "Приглашён", active: "Активен", disabled: "Отключён" };

export default function TeamPage() {
  const { user, loading: sessionLoading } = useAppSession({ redirectToLogin: true });
  const [users, setUsers] = useState<AppUser[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("manager");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadUsers = useCallback(async () => {
    const response = await fetch("/api/users", { cache: "no-store" });
    const result = await response.json() as { users?: AppUser[]; message?: string };
    if (!response.ok) throw new Error(result.message ?? "Не удалось загрузить сотрудников.");
    setUsers(result.users ?? []);
  }, []);

  useEffect(() => {
    if (!user) return;
    if (user.role === "manager") { window.location.replace("/cabinet"); return; }
    void loadUsers().catch((error) => setMessage(error instanceof Error ? error.message : "Не удалось загрузить сотрудников."));
  }, [loadUsers, user]);

  async function addUser(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName, email, role: user?.role === "architect" ? role : "manager" }),
      });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message ?? "Не удалось добавить сотрудника.");
      setDisplayName(""); setEmail(""); setRole("manager");
      setMessage("Сотрудник приглашён. Он сможет активировать аккаунт на странице входа.");
      await loadUsers();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не удалось добавить сотрудника."); }
    finally { setBusy(false); }
  }

  async function updateRole(userId: string, nextRole: AppRole) {
    setMessage(null);
    const response = await fetch(`/api/users/${userId}/role`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ role: nextRole }),
    });
    const result = await response.json() as { message?: string };
    if (!response.ok) { setMessage(result.message ?? "Не удалось изменить роль."); return; }
    await loadUsers();
  }

  if (sessionLoading || !user) return <main className="admin-loading">Загружаю команду…</main>;
  return (
    <main className="admin-shell">
      <header className="admin-header"><AppBrand /><nav className="admin-actions"><Link className="admin-button primary" href="/cabinet">К разборам</Link><button className="admin-button danger" type="button" onClick={() => void logoutAndRedirect()}>Выйти</button></nav></header>
      <section className="admin-title-row"><div><span className="admin-eyebrow">Управление доступом</span><h1>Менеджеры</h1><p>Администратор добавляет менеджеров. Только архитектор меняет роли.</p></div></section>
      <section className="team-layout">
        <form className="team-form" onSubmit={addUser}>
          <h2>Добавить сотрудника</h2>
          <label>Имя<input value={displayName} maxLength={120} onChange={(event) => setDisplayName(event.target.value)} required /></label>
          <label>Email<input type="email" value={email} maxLength={254} onChange={(event) => setEmail(event.target.value)} required /></label>
          {user.role === "architect" && <label>Роль<select value={role} onChange={(event) => setRole(event.target.value as AppRole)}><option value="manager">Менеджер</option><option value="admin">Администратор</option><option value="architect">Архитектор</option></select></label>}
          <button className="admin-button primary" disabled={busy} type="submit">{busy ? "Добавляю…" : "Добавить"}</button>
          {message && <p className="team-message" role="status">{message}</p>}
        </form>
        <section className="team-list" aria-label="Сотрудники">
          {users.map((member) => <article key={member.id} className="team-member">
            <div><strong>{member.displayName}</strong><span>{member.email}</span><small>{STATUS_LABELS[member.status]}</small></div>
            {user.role === "architect" ? <select aria-label={`Роль ${member.displayName}`} value={member.role} disabled={member.id === user.id} onChange={(event) => void updateRole(member.id, event.target.value as AppRole)}><option value="manager">Менеджер</option><option value="admin">Администратор</option><option value="architect">Архитектор</option></select> : <b>{ROLE_LABELS[member.role]}</b>}
          </article>)}
        </section>
      </section>
    </main>
  );
}
