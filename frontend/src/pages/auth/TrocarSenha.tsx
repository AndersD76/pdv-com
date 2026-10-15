import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { authApi } from '../../services/api';
import { Button, Input } from '../../components/ui';

export default function TrocarSenha() {
  const { user, isLoading, setUser, logout } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ atual: '', nova: '', confirmacao: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isLoading && !user) {
    return <Navigate to="/login" replace />;
  }

  const obrigatoria = Boolean(user?.deve_trocar_senha);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.nova.length < 8) {
      toast.error('A nova senha deve ter pelo menos 8 caracteres');
      return;
    }
    if (form.nova !== form.confirmacao) {
      toast.error('A confirmação não confere com a nova senha');
      return;
    }

    setIsSubmitting(true);
    try {
      const updated = await authApi.changePassword(form.atual, form.nova);
      setUser(updated);
      toast.success('Senha alterada!');
      navigate('/', { replace: true });
    } catch (error) {
      toast.error((error as Error).message || 'Erro ao trocar senha');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="card w-full max-w-sm p-8">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 bg-primary-600 rounded-xl flex items-center justify-center mb-3">
            <KeyRound className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Trocar senha</h1>
          {obrigatoria && (
            <p className="text-sm text-gray-500 text-center mt-1">
              Sua senha é provisória. Defina uma nova senha para continuar.
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Senha atual"
            type="password"
            autoComplete="current-password"
            value={form.atual}
            onChange={(e) => setForm({ ...form, atual: e.target.value })}
            autoFocus
            required
          />
          <Input
            label="Nova senha (mínimo 8 caracteres)"
            type="password"
            autoComplete="new-password"
            value={form.nova}
            onChange={(e) => setForm({ ...form, nova: e.target.value })}
            required
          />
          <Input
            label="Confirme a nova senha"
            type="password"
            autoComplete="new-password"
            value={form.confirmacao}
            onChange={(e) => setForm({ ...form, confirmacao: e.target.value })}
            required
          />
          <Button type="submit" className="w-full" size="lg" isLoading={isSubmitting}>
            Salvar nova senha
          </Button>
          {obrigatoria ? (
            <Button type="button" variant="ghost" className="w-full" onClick={() => logout()}>
              Sair
            </Button>
          ) : (
            <Button type="button" variant="ghost" className="w-full" onClick={() => navigate(-1)}>
              Voltar
            </Button>
          )}
        </form>
      </div>
    </div>
  );
}
