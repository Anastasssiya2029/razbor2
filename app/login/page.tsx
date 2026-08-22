"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppBrand } from "@/app/_components/brand";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/auth/session", { cache: "no-store" }).then((response) => {
      if (response.ok) window.location.replace("/cabinet");
    });
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message ?? "Не удалось выполнить вход.");
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.replace(next?.startsWith("/") ? next : "/cabinet");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось выполнить вход.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <AppBrand />
        <div className="auth-copy">
          <span className="admin-eyebrow">Сервис разбора 7К</span>
          <h1 id="auth-title">Вход в кабинет</h1>
          <p>Введите рабочий email и пароль.</p>
        </div>
        <form className="auth-form" onSubmit={submit}>
          <label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label>Пароль<input type="password" autoComplete="current-password" minLength={6} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          <button className="primary-button compact" type="submit" disabled={busy}>
            {busy ? "Проверяю…" : "Войти"}
          </button>
        </form>
        {message && <p className="auth-message" role="status">{message}</p>}
      </section>
    </main>
  );
}
