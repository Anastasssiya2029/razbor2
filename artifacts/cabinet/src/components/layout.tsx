import { useAuth } from './auth-provider';

/**
 * Auth gate only. The approved brand shell has no persistent sidebar — every
 * authenticated screen renders its own `admin-shell`/`CabinetNav` header
 * (see cabinet-header.tsx), matching the reference product's page structure.
 */
export function Layout({ children }: { children: React.ReactNode }) {
  const { isLoading } = useAuth();

  if (isLoading) {
    return <main className="admin-loading">Загружаю кабинет…</main>;
  }

  return <>{children}</>;
}
