import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Edit2, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { suppliersApi } from '../../services/api';
import {
  Button, Input, Modal, ModalFooter,
  Table, TableHead, TableBody, TableRow, TableHeader, TableCell, TableEmpty, TableLoading
} from '../../components/ui';
import type { Supplier } from '../../types';

export default function Fornecedores() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [form, setForm] = useState({ nome: '', cpf: '', telefone: '', email: '', endereco: '' });

  const { data: suppliers, isLoading } = useQuery({
    queryKey: ['suppliers', search],
    queryFn: () => suppliersApi.getAll(search || undefined),
  });

  const createSupplier = useMutation({
    mutationFn: suppliersApi.create,
    onSuccess: () => {
      toast.success('Fornecedor cadastrado!');
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      closeModal();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateSupplier = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Supplier> }) => suppliersApi.update(id, data),
    onSuccess: () => {
      toast.success('Fornecedor atualizado!');
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      closeModal();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteSupplier = useMutation({
    mutationFn: suppliersApi.delete,
    onSuccess: () => {
      toast.success('Fornecedor excluído!');
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const closeModal = () => {
    setShowModal(false);
    setEditingSupplier(null);
    setForm({ nome: '', cpf: '', telefone: '', email: '', endereco: '' });
  };

  const openEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setForm({
      nome: supplier.nome,
      cpf: supplier.cpf || '',
      telefone: supplier.telefone || '',
      email: supplier.email || '',
      endereco: supplier.endereco || '',
    });
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingSupplier) {
      updateSupplier.mutate({ id: editingSupplier.id, data: form });
    } else {
      createSupplier.mutate(form);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Fornecedores</h1>
        <Button onClick={() => setShowModal(true)}>
          <Plus className="w-4 h-4 mr-2" /> Novo Fornecedor
        </Button>
      </div>

      <div className="card p-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Buscar por nome ou CPF..."
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
              <TableHeader className="w-32">Ações</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? <TableLoading cols={5} /> : suppliers?.length === 0 ? (
              <TableEmpty />
            ) : (
              suppliers?.map((supplier: Supplier) => (
                <TableRow key={supplier.id}>
                  <TableCell className="font-medium">{supplier.nome}</TableCell>
                  <TableCell>{supplier.cpf || '-'}</TableCell>
                  <TableCell>{supplier.telefone || '-'}</TableCell>
                  <TableCell>{supplier.email || '-'}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(supplier)}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => {
                        if (confirm('Excluir fornecedor?')) deleteSupplier.mutate(supplier.id);
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

      <Modal isOpen={showModal} onClose={closeModal} title={editingSupplier ? 'Editar Fornecedor' : 'Novo Fornecedor'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="Nome *" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
          <div className="grid grid-cols-2 gap-4">
            <Input label="CPF" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} />
            <Input label="Telefone" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
          </div>
          <Input label="E-mail" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input label="Endereço" value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} />
          <ModalFooter>
            <Button type="button" variant="secondary" onClick={closeModal}>Cancelar</Button>
            <Button type="submit" isLoading={createSupplier.isPending || updateSupplier.isPending}>
              {editingSupplier ? 'Salvar' : 'Cadastrar'}
            </Button>
          </ModalFooter>
        </form>
      </Modal>
    </div>
  );
}
