"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppBrand } from "@/app/_components/brand";

type Mode = "login" | "signup";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("login");
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
      const response = await fetch(mode === "login" ? "/api/auth/login" : "/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const result = await response.json() as { message?: string; confirmationRequired?: boolean };
      if (!response.ok) throw new Error(result.message ?? "Не удалось выполнить вход.");
      if (mode === "signup") {
        setMode("login");
        setPassword("");
        setMessage("Аккаунт создан. Если провайдер запросил подтверждение email, подтвердите его и войдите.");
        return;
      }
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
          <h1 id="auth-title">{mode === "login" ? "Вход в кабинет" : "Активация приглашения"}</h1>
          <p>{mode === "login" ? "Введите рабочий email и пароль." : "Создать аккаунт может только заранее приглашённый сотрудник."}</p>
        </div>
        <form className="auth-form" onSubmit={submit}>
          <label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label>Пароль<input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={6} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          <button className="primary-button compact" type="submit" disabled={busy}>
            {busy ? "Проверяю…" : mode === "login" ? "Войти" : "Активировать"}
          </button>
        </form>
        {message && <p className="auth-message" role="status">{message}</p>}
        <button className="auth-switch" type="button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMessage(null); }}>
          {mode === "login" ? "Первый вход по приглашению" : "У меня уже есть аккаунт"}
        </button>
      </section>
    </main>
  );
}
