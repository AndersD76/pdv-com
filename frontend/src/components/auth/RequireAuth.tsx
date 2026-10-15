import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

interface RequireAuthProps {
  children: ReactNode;
  admin?: boolean;
}

// Protege rotas: exige login, troca de senha provisória e, se indicado, perfil de administrador
export function RequireAuth({ children, admin = false }: RequireAuthProps) {
  const { user, isLoading, isAdmin, explicitLogout } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="animate-spin w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    // Sessão expirada: lembra a página para voltar após o login; após "Sair", não
    return <Navigate to="/login" replace state={explicitLogout ? undefined : { from: location.pathname }} />;
  }

  if (user.deve_trocar_senha) {
    return <Navigate to="/trocar-senha" replace />;
  }

  if (admin && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
