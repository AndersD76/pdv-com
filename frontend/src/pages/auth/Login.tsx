import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Store, LogIn } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { Button, Input } from '../../components/ui';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const from = (location.state as { from?: string } | null)?.from || '/';

  if (user) {
    return <Navigate to={user.deve_trocar_senha ? '/trocar-senha' : from} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const loggedUser = await login(usuario, senha);
      navigate(loggedUser.deve_trocar_senha ? '/trocar-senha' : from, { replace: true });
    } catch (error) {
      toast.error((error as Error).message || 'Não foi possível entrar');
      setSenha('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="card w-full max-w-sm p-8">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 bg-primary-600 rounded-xl flex items-center justify-center mb-3">
            <Store className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">PDV COM</h1>
          <p className="text-sm text-gray-500">Entre para continuar</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Usuário"
            name="usuario"
            autoComplete="username"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            autoFocus
            required
          />
          <Input
            label="Senha"
            name="senha"
            type="password"
            autoComplete="current-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
          />
          <Button type="submit" className="w-full" size="lg" isLoading={isSubmitting}>
            <LogIn className="w-4 h-4 mr-2" />
            Entrar
          </Button>
        </form>
      </div>
    </div>
  );
}
