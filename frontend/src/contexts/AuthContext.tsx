import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi, AUTH_EXPIRED_EVENT, PASSWORD_CHANGE_REQUIRED_EVENT } from '../services/api';
import type { AuthUser } from '../types';

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAdmin: boolean;
  // true após "Sair": o próximo login começa do início em vez de voltar à última página
  explicitLogout: boolean;
  login: (usuario: string, senha: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  setUser: (user: AuthUser) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const ME_KEY = ['auth', 'me'];

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [explicitLogout, setExplicitLogout] = useState(false);

  const { data: user, isLoading } = useQuery({
    queryKey: ME_KEY,
    queryFn: () => authApi.me().catch(() => null),
    staleTime: Infinity,
    retry: false,
  });

  // Descarta os dados em cache de outro usuário/sessão (mantém só a query de autenticação)
  const clearData = () => queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'auth' });

  useEffect(() => {
    const onExpired = () => {
      queryClient.setQueryData(ME_KEY, null);
      clearData();
    };
    const onPasswordChangeRequired = () => {
      queryClient.setQueryData<AuthUser | null>(ME_KEY, (current) =>
        current ? { ...current, deve_trocar_senha: true } : current
      );
    };

    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    window.addEventListener(PASSWORD_CHANGE_REQUIRED_EVENT, onPasswordChangeRequired);
    return () => {
      window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
      window.removeEventListener(PASSWORD_CHANGE_REQUIRED_EVENT, onPasswordChangeRequired);
    };
  }, [queryClient]);

  const setUser = (newUser: AuthUser) => queryClient.setQueryData(ME_KEY, newUser);

  const login = async (usuario: string, senha: string) => {
    const loggedUser = await authApi.login(usuario, senha);
    setExplicitLogout(false);
    clearData();
    setUser(loggedUser);
    return loggedUser;
  };

  const logout = async () => {
    await authApi.logout().catch(() => undefined);
    setExplicitLogout(true);
    queryClient.setQueryData(ME_KEY, null);
    clearData();
  };

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading,
        isAdmin: user?.perfil === 'admin',
        explicitLogout,
        login,
        logout,
        setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider');
  }
  return context;
}
