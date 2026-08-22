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
    let active = true;
    void fetch("/api/auth/session", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("UNAUTHENTICATED");
        return response.json() as Promise<{ user: SessionUser }>;
      })
      .then((result) => {
        if (active) setUser(result.user);
      })
      .catch(() => {
        if (active && options.redirectToLogin) {
          const next = `${window.location.pathname}${window.location.search}`;
          window.location.replace(`/login?next=${encodeURIComponent(next)}`);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [options.redirectToLogin]);
  return { user, loading };
}

export async function logoutAndRedirect() {
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.replace("/login");
}
