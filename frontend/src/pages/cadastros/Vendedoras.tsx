import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Trash2, ToggleLeft, ToggleRight, DollarSign } from 'lucide-react';
import toast from 'react-hot-toast';
import { sellersApi } from '../../services/api';
import {
  Button, Input, Modal, ModalFooter,
  Table, TableHead, TableBody, TableRow, TableHeader, TableCell, TableEmpty, TableLoading
} from '../../components/ui';
import type { Seller } from '../../types';

export default function Vendedoras() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editingSeller, setEditingSeller] = useState<Seller | null>(null);
  const [form, setForm] = useState({ nome: '', cpf: '', telefone: '', email: '', comissao_percentual: '10' });

  const { data: sellers, isLoading } = useQuery({
    queryKey: ['sellers'],
    queryFn: () => sellersApi.getAll(),
  });

  const createSeller = useMutation({
    mutationFn: sellersApi.create,
    onSuccess: () => {
      toast.success('Vendedora cadastrada!');
      queryClient.invalidateQueries({ queryKey: ['sellers'] });
      closeModal();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateSeller = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Seller> }) => sellersApi.update(id, data),
    onSuccess: () => {
      toast.success('Vendedora atualizada!');
      queryClient.invalidateQueries({ queryKey: ['sellers'] });
      closeModal();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleActive = useMutation({
    mutationFn: sellersApi.toggleActive,
    onSuccess: () => {
      toast.success('Status alterado!');
      queryClient.invalidateQueries({ queryKey: ['sellers'] });
    },
  });

  const deleteSeller = useMutation({
    mutationFn: sellersApi.delete,
    onSuccess: () => {
      toast.success('Vendedora excluída!');
      queryClient.invalidateQueries({ queryKey: ['sellers'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const closeModal = () => {
    setShowModal(false);
    setEditingSeller(null);
    setForm({ nome: '', cpf: '', telefone: '', email: '', comissao_percentual: '10' });
  };

  const openEdit = (seller: Seller) => {
    setEditingSeller(seller);
    setForm({
      nome: seller.nome,
      cpf: seller.cpf || '',
      telefone: seller.telefone || '',
      email: seller.email || '',
      comissao_percentual: String(seller.comissao_percentual),
    });
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = { ...form, comissao_percentual: Number(form.comissao_percentual) };
    if (editingSeller) {
      updateSeller.mutate({ id: editingSeller.id, data });
    } else {
      createSeller.mutate(data);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Vendedoras</h1>
        <Button onClick={() => setShowModal(true)}>
          <Plus className="w-4 h-4 mr-2" /> Nova Vendedora
        </Button>
      </div>

      <div className="card">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Nome</TableHeader>
              <TableHeader>CPF</TableHeader>
              <TableHeader>Telefone</TableHeader>
              <TableHeader>E-mail</TableHeader>
              <TableHeader className="text-center">Comissão</TableHeader>
              <TableHeader className="text-center">Status</TableHeader>
              <TableHeader className="w-32">Ações</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? <TableLoading cols={7} /> : sellers?.length === 0 ? (
              <TableEmpty />
            ) : (
              sellers?.map((seller: Seller) => (
                <TableRow key={seller.id}>
                  <TableCell className="font-medium">{seller.nome}</TableCell>
                  <TableCell>{seller.cpf || '-'}</TableCell>
                  <TableCell>{seller.telefone || '-'}</TableCell>
                  <TableCell>{seller.email || '-'}</TableCell>
                  <TableCell className="text-center">
                    <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                      {seller.comissao_percentual}%
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <button onClick={() => toggleActive.mutate(seller.id)}>
                      {seller.ativo ? (
                        <span className="flex items-center gap-1 text-green-600">
                          <ToggleRight className="w-6 h-6" /> Ativa
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-gray-400">
                          <ToggleLeft className="w-6 h-6" /> Inativa
                        </span>
                      )}
                    </button>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(seller)}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => {
                        if (confirm('Excluir vendedora?')) deleteSeller.mutate(seller.id);
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

      <Modal isOpen={showModal} onClose={closeModal} title={editingSeller ? 'Editar Vendedora' : 'Nova Vendedora'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="Nome *" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
          <div className="grid grid-cols-2 gap-4">
            <Input label="CPF" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} />
            <Input label="Telefone" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
          </div>
          <Input label="E-mail" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input
            label="Comissão (%)"
            type="number"
            min="0"
            max="100"
            step="0.5"
            value={form.comissao_percentual}
            onChange={(e) => setForm({ ...form, comissao_percentual: e.target.value })}
          />
          <ModalFooter>
            <Button type="button" variant="secondary" onClick={closeModal}>Cancelar</Button>
            <Button type="submit" isLoading={createSeller.isPending || updateSeller.isPending}>
              {editingSeller ? 'Salvar' : 'Cadastrar'}
            </Button>
          </ModalFooter>
        </form>
      </Modal>
    </div>
  );
}
