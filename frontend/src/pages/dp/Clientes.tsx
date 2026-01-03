import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Edit2, Trash2, Users, Cake } from 'lucide-react';
import toast from 'react-hot-toast';
import { customersApi } from '../../services/api';
import {
  Button, Input, Modal, ModalFooter,
  Table, TableHead, TableBody, TableRow, TableHeader, TableCell, TableEmpty, TableLoading
} from '../../components/ui';
import type { Customer } from '../../types';

const formatDate = (date: string | null) => {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('pt-BR');
};

export default function Clientes() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState({
    nome: '',
    cpf: '',
    telefone: '',
    email: '',
    endereco: '',
    cidade: '',
    estado: '',
    cep: '',
    data_nascimento: '',
    observacoes: ''
  });

  const { data: customers, isLoading } = useQuery({
    queryKey: ['customers', search],
    queryFn: () => customersApi.getAll(search || undefined),
  });

  const { data: stats } = useQuery({
    queryKey: ['customers-stats'],
    queryFn: () => customersApi.getStats(),
  });

  const createCustomer = useMutation({
    mutationFn: customersApi.create,
    onSuccess: () => {
      toast.success('Cliente cadastrado!');
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customers-stats'] });
      closeModal();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateCustomer = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Customer> }) => customersApi.update(id, data),
    onSuccess: () => {
      toast.success('Cliente atualizado!');
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customers-stats'] });
      closeModal();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteCustomer = useMutation({
    mutationFn: customersApi.delete,
    onSuccess: () => {
      toast.success('Cliente excluido!');
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customers-stats'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const closeModal = () => {
    setShowModal(false);
    setEditingCustomer(null);
    setForm({
      nome: '',
      cpf: '',
      telefone: '',
      email: '',
      endereco: '',
      cidade: '',
      estado: '',
      cep: '',
      data_nascimento: '',
      observacoes: ''
    });
  };

  const openEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setForm({
      nome: customer.nome,
      cpf: customer.cpf || '',
      telefone: customer.telefone || '',
      email: customer.email || '',
      endereco: customer.endereco || '',
      cidade: customer.cidade || '',
      estado: customer.estado || '',
      cep: customer.cep || '',
      data_nascimento: customer.data_nascimento?.split('T')[0] || '',
      observacoes: customer.observacoes || ''
    });
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      ...form,
      data_nascimento: form.data_nascimento || null
    };
    if (editingCustomer) {
      updateCustomer.mutate({ id: editingCustomer.id, data });
    } else {
      createCustomer.mutate(data);
    }
  };

  const estados = [
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
    'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
        <Button onClick={() => setShowModal(true)}>
          <Plus className="w-4 h-4 mr-2" /> Novo Cliente
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total de Clientes</p>
              <p className="text-xl font-bold">{stats?.total || 0}</p>
            </div>
          </div>
        </div>

        {stats?.aniversariantes_mes && stats.aniversariantes_mes.length > 0 && (
          <div className="card p-4 md:col-span-2">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-pink-100 rounded-lg flex items-center justify-center">
                <Cake className="w-5 h-5 text-pink-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Aniversariantes do Mes</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {stats.aniversariantes_mes.map((a: { nome: string; data_nascimento: string }, i: number) => (
                <span key={i} className="px-2 py-1 bg-pink-50 text-pink-700 rounded text-sm">
                  {a.nome} - {formatDate(a.data_nascimento)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="card p-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Buscar por nome, CPF ou telefone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <div className="card">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Nome</TableHeader>
              <TableHeader>CPF</TableHeader>
              <TableHeader>Telefone</TableHeader>
              <TableHeader>E-mail</TableHeader>
              <TableHeader>Cidade/UF</TableHeader>
              <TableHeader className="w-32">Acoes</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? <TableLoading cols={6} /> : customers?.length === 0 ? (
              <TableEmpty />
            ) : (
              customers?.map((customer: Customer) => (
                <TableRow key={customer.id}>
                  <TableCell className="font-medium">{customer.nome}</TableCell>
                  <TableCell>{customer.cpf || '-'}</TableCell>
                  <TableCell>{customer.telefone || '-'}</TableCell>
                  <TableCell>{customer.email || '-'}</TableCell>
                  <TableCell>
                    {customer.cidade ? `${customer.cidade}${customer.estado ? `/${customer.estado}` : ''}` : '-'}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(customer)}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => {
                        if (confirm('Excluir cliente?')) deleteCustomer.mutate(customer.id);
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

      <Modal isOpen={showModal} onClose={closeModal} title={editingCustomer ? 'Editar Cliente' : 'Novo Cliente'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="Nome *" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
          <div className="grid grid-cols-2 gap-4">
            <Input label="CPF" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} />
            <Input label="Telefone" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
          </div>
          <Input label="E-mail" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input label="Endereco" value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} />
          <div className="grid grid-cols-3 gap-4">
            <Input label="Cidade" value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} className="col-span-2" />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">UF</label>
              <select
                value={form.estado}
                onChange={(e) => setForm({ ...form, estado: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              >
                <option value="">-</option>
                {estados.map(uf => (
                  <option key={uf} value={uf}>{uf}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="CEP" value={form.cep} onChange={(e) => setForm({ ...form, cep: e.target.value })} />
            <Input label="Data de Nascimento" type="date" value={form.data_nascimento} onChange={(e) => setForm({ ...form, data_nascimento: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Observacoes</label>
            <textarea
              value={form.observacoes}
              onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <ModalFooter>
            <Button type="button" variant="secondary" onClick={closeModal}>Cancelar</Button>
            <Button type="submit" isLoading={createCustomer.isPending || updateCustomer.isPending}>
              {editingCustomer ? 'Salvar' : 'Cadastrar'}
            </Button>
          </ModalFooter>
        </form>
      </Modal>
    </div>
  );
}
