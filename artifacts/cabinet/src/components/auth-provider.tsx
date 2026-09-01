import { createContext, useContext, useEffect, ReactNode } from 'react';
import { useLocation } from 'wouter';
import { useGetCurrentUser, getGetCurrentUserQueryKey, type AuthUser } from '@workspace/api-client-react';

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  error: Error | null;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  error: null,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const { data: user, isLoading, error } = useGetCurrentUser({
    query: {
      retry: false,
      queryKey: getGetCurrentUserQueryKey()
    }
  });

  const isPublicRoute = location === '/login' || location === '/bootstrap' || location.startsWith('/invite/');

  useEffect(() => {
    if (!isLoading && !user && !isPublicRoute) {
      setLocation('/login');
    }
    if (!isLoading && user && (location === '/login' || location === '/bootstrap')) {
      setLocation('/');
    }
  }, [user, isLoading, location, setLocation, isPublicRoute]);

  return (
    <AuthContext.Provider value={{ user: user ?? null, isLoading, error: error as Error | null }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
