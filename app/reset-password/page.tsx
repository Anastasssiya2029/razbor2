"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { AppBrand } from "@/app/_components/brand";

export default function ResetPasswordPage() {
  const initialized = useRef(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [message, setMessage] = useState("Проверяю ссылку восстановления…");

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const params = new URLSearchParams(window.location.hash.replace(/^#/u, ""));
    const token = params.get("access_token");
    const type = params.get("type");
    window.history.replaceState(null, "", window.location.pathname);
    const timeoutId = window.setTimeout(() => {
      if (type !== "recovery" || !token) {
        setMessage("Ссылка восстановления недействительна или устарела.");
        return;
      }
      setAccessToken(token);
      setMessage("");
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!accessToken) return;
    if (password !== confirmation) {
      setMessage("Пароли не совпадают.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accessToken, password }),
      });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message ?? "Не удалось изменить пароль.");
      setAccessToken(null);
      setPassword("");
      setConfirmation("");
      setComplete(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось изменить пароль.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="reset-title">
        <AppBrand />
        <div className="auth-copy">
          <span className="admin-eyebrow">Сервис разбора 7К</span>
          <h1 id="reset-title">Новый пароль</h1>
          <p>{complete ? "Пароль успешно изменён." : "Придумайте новый пароль для входа в кабинет."}</p>
        </div>

        {complete ? (
          <Link className="primary-button compact auth-primary-link" href="/login">Войти в кабинет</Link>
        ) : accessToken ? (
          <form className="auth-form" onSubmit={submit}>
            <label>
              Новый пароль
              <span className="password-input">
                <input
                  type={passwordVisible ? "text" : "password"}
                  autoComplete="new-password"
                  minLength={6}
                  maxLength={128}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
                <button
                  className="password-visibility-toggle"
                  type="button"
                  aria-label={passwordVisible ? "Скрыть пароль" : "Показать пароль"}
                  aria-pressed={passwordVisible}
                  onClick={() => setPasswordVisible((visible) => !visible)}
                >
                  <span className="password-visibility-icon" aria-hidden="true" />
                </button>
              </span>
            </label>
            <label>
              Повторите пароль
              <input
                type={passwordVisible ? "text" : "password"}
                autoComplete="new-password"
                minLength={6}
                maxLength={128}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                required
              />
            </label>
            <button className="primary-button compact" type="submit" disabled={busy}>
              {busy ? "Сохраняю…" : "Сохранить новый пароль"}
            </button>
          </form>
        ) : (
          <Link className="auth-switch auth-return-link" href="/login">Вернуться ко входу</Link>
        )}

        {message && <p className="auth-message" role="status">{message}</p>}
      </section>
    </main>
  );
}
