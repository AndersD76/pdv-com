import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Edit2, Trash2, UserCheck, UserX, Users, DollarSign } from 'lucide-react';
import toast from 'react-hot-toast';
import { employeesApi } from '../../services/api';
import {
  Button, Input, Modal, ModalFooter,
  Table, TableHead, TableBody, TableRow, TableHeader, TableCell, TableEmpty, TableLoading
} from '../../components/ui';
import type { Employee } from '../../types';

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString('pt-BR');
};

export default function Funcionarios() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [showModal, setShowModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [form, setForm] = useState({
    nome: '',
    cpf: '',
    cargo: '',
    departamento: '',
    salario_base: '',
    data_admissao: '',
    dependentes: '0',
    status: 'ativo' as 'ativo' | 'inativo',
    email: '',
    telefone: ''
  });

  const { data: employees, isLoading } = useQuery({
    queryKey: ['employees', search, statusFilter],
    queryFn: () => employeesApi.getAll({ search: search || undefined, status: statusFilter !== 'todos' ? statusFilter : undefined }),
  });

  const { data: stats } = useQuery({
    queryKey: ['employees-stats'],
    queryFn: () => employeesApi.getStats(),
  });

  const createEmployee = useMutation({
    mutationFn: employeesApi.create,
    onSuccess: () => {
      toast.success('Funcionario cadastrado!');
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['employees-stats'] });
      closeModal();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateEmployee = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Employee> }) => employeesApi.update(id, data),
    onSuccess: () => {
      toast.success('Funcionario atualizado!');
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['employees-stats'] });
      closeModal();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteEmployee = useMutation({
    mutationFn: employeesApi.delete,
    onSuccess: () => {
      toast.success('Funcionario excluido!');
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['employees-stats'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleStatus = useMutation({
    mutationFn: employeesApi.toggleStatus,
    onSuccess: () => {
      toast.success('Status alterado!');
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['employees-stats'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const closeModal = () => {
    setShowModal(false);
    setEditingEmployee(null);
    setForm({
      nome: '',
      cpf: '',
      cargo: '',
      departamento: '',
      salario_base: '',
      data_admissao: '',
      dependentes: '0',
      status: 'ativo',
      email: '',
      telefone: ''
    });
  };

  const openEdit = (employee: Employee) => {
    setEditingEmployee(employee);
    setForm({
      nome: employee.nome,
      cpf: employee.cpf || '',
      cargo: employee.cargo,
      departamento: employee.departamento || '',
      salario_base: String(employee.salario_base),
      data_admissao: employee.data_admissao.split('T')[0],
      dependentes: String(employee.dependentes),
      status: employee.status,
      email: employee.email || '',
      telefone: employee.telefone || ''
    });
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      ...form,
      salario_base: parseFloat(form.salario_base),
      dependentes: parseInt(form.dependentes)
    };
    if (editingEmployee) {
      updateEmployee.mutate({ id: editingEmployee.id, data });
    } else {
      createEmployee.mutate(data);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Funcionarios</h1>
        <Button onClick={() => setShowModal(true)}>
          <Plus className="w-4 h-4 mr-2" /> Novo Funcionario
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total</p>
              <p className="text-xl font-bold">{stats?.total || 0}</p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <UserCheck className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Ativos</p>
              <p className="text-xl font-bold text-green-600">{stats?.ativos || 0}</p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
              <UserX className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Inativos</p>
              <p className="text-xl font-bold text-red-600">{stats?.inativos || 0}</p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Folha Mensal</p>
              <p className="text-xl font-bold text-purple-600">{formatCurrency(stats?.folha_total || 0)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="card p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Buscar por nome ou CPF..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          >
            <option value="todos">Todos</option>
            <option value="ativo">Ativos</option>
            <option value="inativo">Inativos</option>
          </select>
        </div>
      </div>

      <div className="card">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Nome</TableHeader>
              <TableHeader>CPF</TableHeader>
              <TableHeader>Cargo</TableHeader>
              <TableHeader>Salario</TableHeader>
              <TableHeader>Admissao</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader className="w-32">Acoes</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? <TableLoading cols={7} /> : employees?.length === 0 ? (
              <TableEmpty />
            ) : (
              employees?.map((employee: Employee) => (
                <TableRow key={employee.id}>
                  <TableCell className="font-medium">{employee.nome}</TableCell>
                  <TableCell>{employee.cpf || '-'}</TableCell>
                  <TableCell>{employee.cargo}</TableCell>
                  <TableCell>{formatCurrency(employee.salario_base)}</TableCell>
                  <TableCell>{formatDate(employee.data_admissao)}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      employee.status === 'ativo' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {employee.status === 'ativo' ? 'Ativo' : 'Inativo'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => toggleStatus.mutate(employee.id)} title={employee.status === 'ativo' ? 'Desativar' : 'Ativar'}>
                        {employee.status === 'ativo' ? <UserX className="w-4 h-4 text-orange-500" /> : <UserCheck className="w-4 h-4 text-green-500" />}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(employee)}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => {
                        if (confirm('Excluir funcionario?')) deleteEmployee.mutate(employee.id);
                      }}>
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Modal isOpen={showModal} onClose={closeModal} title={editingEmployee ? 'Editar Funcionario' : 'Novo Funcionario'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="Nome *" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
          <div className="grid grid-cols-2 gap-4">
            <Input label="CPF" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} />
            <Input label="Telefone" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
          </div>
          <Input label="E-mail" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Cargo *" value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} required />
            <Input label="Departamento" value={form.departamento} onChange={(e) => setForm({ ...form, departamento: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Input label="Salario Base *" type="number" step="0.01" value={form.salario_base} onChange={(e) => setForm({ ...form, salario_base: e.target.value })} required />
            <Input label="Data Admissao *" type="date" value={form.data_admissao} onChange={(e) => setForm({ ...form, data_admissao: e.target.value })} required />
            <Input label="Dependentes" type="number" min="0" value={form.dependentes} onChange={(e) => setForm({ ...form, dependentes: e.target.value })} />
          </div>
          {editingEmployee && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as 'ativo' | 'inativo' })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              >
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </select>
            </div>
          )}
          <ModalFooter>
            <Button type="button" variant="secondary" onClick={closeModal}>Cancelar</Button>
            <Button type="submit" isLoading={createEmployee.isPending || updateEmployee.isPending}>
              {editingEmployee ? 'Salvar' : 'Cadastrar'}
            </Button>
          </ModalFooter>
        </form>
      </Modal>
    </div>
  );
}
