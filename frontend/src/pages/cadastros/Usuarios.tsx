import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { usersApi } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import {
  Button, Input, Select, Modal, ModalFooter,
  Table, TableHead, TableBody, TableRow, TableHeader, TableCell, TableEmpty, TableLoading
} from '../../components/ui';
import type { AppUser, UserRole } from '../../types';

const perfilLabels: Record<UserRole, string> = {
  admin: 'Administrador',
  operador: 'Operador (caixa)',
};

const emptyForm = { nome: '', usuario: '', senha: '', perfil: 'operador' as UserRole, ativo: true };

export default function Usuarios() {
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<AppUser | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: users, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: usersApi.getAll,
  });

  const closeModal = () => {
    setShowModal(false);
    setEditing(null);
    setForm(emptyForm);
  };

  const saveUser = useMutation({
    mutationFn: () =>
      editing
        ? usersApi.update(editing.id, {
            nome: form.nome,
            perfil: form.perfil,
            ativo: form.ativo,
            nova_senha: form.senha || undefined,
          })
        : usersApi.create({ nome: form.nome, usuario: form.usuario, senha: form.senha, perfil: form.perfil }),
    onSuccess: () => {
      toast.success(editing ? 'Usuário atualizado!' : 'Usuário criado! A senha deverá ser trocada no primeiro acesso.');
      queryClient.invalidateQueries({ queryKey: ['users'] });
      closeModal();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const openEdit = (user: AppUser) => {
    setEditing(user);
    setForm({ nome: user.nome, usuario: user.usuario, senha: '', perfil: user.perfil, ativo: user.ativo });
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((!editing || form.senha) && form.senha.length < 8) {
      toast.error('A senha deve ter pelo menos 8 caracteres');
      return;
    }
    saveUser.mutate();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-8 h-8 text-primary-600" />
          <h1 className="text-2xl font-bold text-gray-900">Usuários</h1>
        </div>
        <Button onClick={() => setShowModal(true)}>
          <Plus className="w-4 h-4 mr-2" /> Novo Usuário
        </Button>
      </div>

      <div className="card">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Nome</TableHeader>
              <TableHeader>Usuário</TableHeader>
              <TableHeader>Perfil</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader className="w-20">Ações</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? <TableLoading cols={5} /> : !users || users.length === 0 ? (
              <TableEmpty />
            ) : (
              users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">
                    {user.nome}
                    {user.id === currentUser?.id && <span className="ml-2 text-xs text-gray-500">(você)</span>}
                  </TableCell>
                  <TableCell className="font-mono">{user.usuario}</TableCell>
                  <TableCell>{perfilLabels[user.perfil]}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      user.ativo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {user.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                    {user.deve_trocar_senha && (
                      <span className="ml-2 text-xs text-orange-600">senha provisória</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(user)}>
                      <Edit2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Modal isOpen={showModal} onClose={closeModal} title={editing ? 'Editar Usuário' : 'Novo Usuário'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Nome *"
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            required
          />
          <Input
            label="Usuário (login) *"
            value={form.usuario}
            onChange={(e) => setForm({ ...form, usuario: e.target.value })}
            disabled={Boolean(editing)}
            autoComplete="off"
            required
          />
          <Input
            label={editing ? 'Nova senha (deixe em branco para manter)' : 'Senha provisória * (mínimo 8 caracteres)'}
            type="password"
            value={form.senha}
            onChange={(e) => setForm({ ...form, senha: e.target.value })}
            autoComplete="new-password"
            required={!editing}
          />
          <Select
            label="Perfil"
            options={[
              { value: 'operador', label: perfilLabels.operador },
              { value: 'admin', label: perfilLabels.admin },
            ]}
            value={form.perfil}
            onChange={(e) => setForm({ ...form, perfil: e.target.value as UserRole })}
          />
          {editing && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="ativo"
                checked={form.ativo}
                onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
                className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
              />
              <label htmlFor="ativo" className="text-sm text-gray-700">Usuário ativo</label>
            </div>
          )}
          <p className="text-xs text-gray-500">
            Operador: PDV, consignações, produtos, etiquetas, cadastros e ponto.
            Administrador: tudo, incluindo relatórios, pagamentos, DP e usuários.
          </p>
          <ModalFooter>
            <Button type="button" variant="secondary" onClick={closeModal}>Cancelar</Button>
            <Button type="submit" isLoading={saveUser.isPending}>Salvar</Button>
          </ModalFooter>
        </form>
      </Modal>
    </div>
  );
}
