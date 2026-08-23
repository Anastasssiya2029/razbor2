"use client";

import { useEffect, useState } from "react";

export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
  role: "architect" | "admin" | "manager";
};

export function useAppSession(options: { redirectToLogin?: boolean } = {}) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const recovery = new URLSearchParams(window.location.hash.replace(/^#/u, ""));
    if (recovery.get("type") === "recovery" && recovery.has("access_token")) {
      window.location.replace(`/reset-password${window.location.hash}`);
      return;
    }
    let active = true;
    const checkSession = async () => {
      try {
        const response = await fetch("/api/auth/session", {
          cache: "no-store",
          credentials: "include",
        });
        if (!response.ok) throw new Error("UNAUTHENTICATED");
        const result = await response.json() as { user: SessionUser };
        if (active) setUser(result.user);
      } catch {
        if (!active) return;
        setUser(null);
        if (options.redirectToLogin) {
          const next = `${window.location.pathname}${window.location.search}`;
          window.location.replace(`/login?next=${encodeURIComponent(next)}`);
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void checkSession();
    const interval = window.setInterval(() => void checkSession(), 5 * 60 * 1000);
    const checkOnFocus = () => void checkSession();
    window.addEventListener("focus", checkOnFocus);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", checkOnFocus);
    };
  }, [options.redirectToLogin]);
  return { user, loading };
}

export async function logoutAndRedirect() {
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.replace("/login");
}
