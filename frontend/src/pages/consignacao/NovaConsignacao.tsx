import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ArrowLeft, Plus, UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import { consignmentsApi, suppliersApi } from '../../services/api';
import { Button, Input, Select, Textarea, Modal, ModalFooter } from '../../components/ui';
import type { Supplier } from '../../types';

export default function NovaConsignacao() {
  const navigate = useNavigate();

  const [fornecedorId, setFornecedorId] = useState('');
  const [dataRecebimento, setDataRecebimento] = useState(new Date().toISOString().split('T')[0]);
  const [prazoRetirada, setPrazoRetirada] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [showNewSupplierModal, setShowNewSupplierModal] = useState(false);

  // Novo fornecedor
  const [novoFornecedor, setNovoFornecedor] = useState({
    nome: '',
    cpf: '',
    telefone: '',
    email: '',
    endereco: '',
  });

  const { data: suppliers, refetch: refetchSuppliers } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => suppliersApi.getAll(),
  });

  const createList = useMutation({
    mutationFn: consignmentsApi.create,
    onSuccess: (list) => {
      toast.success('Lista criada com sucesso!');
      navigate(`/consignacoes/${list.id}`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao criar lista');
    },
  });

  const createSupplier = useMutation({
    mutationFn: suppliersApi.create,
    onSuccess: (supplier) => {
      toast.success('Fornecedor cadastrado!');
      setFornecedorId(String(supplier.id));
      setShowNewSupplierModal(false);
      setNovoFornecedor({ nome: '', cpf: '', telefone: '', email: '', endereco: '' });
      refetchSuppliers();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao cadastrar fornecedor');
    },
  });

  // Calcular prazo automaticamente (30 dias após recebimento)
  const handleDataRecebimentoChange = (value: string) => {
    setDataRecebimento(value);
    if (value) {
      const date = new Date(value);
      date.setDate(date.getDate() + 30);
      setPrazoRetirada(date.toISOString().split('T')[0]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!fornecedorId) {
      toast.error('Selecione um fornecedor');
      return;
    }

    createList.mutate({
      fornecedor_id: Number(fornecedorId),
      data_recebimento: dataRecebimento,
      prazo_retirada: prazoRetirada,
      observacoes: observacoes || undefined,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h1 className="text-2xl font-bold text-gray-900">Nova Lista de Consignação</h1>
      </div>

      <form onSubmit={handleSubmit} className="card p-6 max-w-2xl">
        <div className="space-y-6">
          {/* Fornecedor */}
          <div>
            <label className="label">Fornecedor *</label>
            <div className="flex gap-2">
              <Select
                options={[
                  { value: '', label: 'Selecione um fornecedor' },
                  ...(suppliers?.map((s: Supplier) => ({ value: s.id, label: s.nome })) || []),
                ]}
                value={fornecedorId}
                onChange={(e) => setFornecedorId(e.target.value)}
                className="flex-1"
              />
              <Button type="button" variant="secondary" onClick={() => setShowNewSupplierModal(true)}>
                <UserPlus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Datas */}
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Data de Recebimento *"
              type="date"
              value={dataRecebimento}
              onChange={(e) => handleDataRecebimentoChange(e.target.value)}
              required
            />
            <Input
              label="Prazo para Retirada *"
              type="date"
              value={prazoRetirada}
              onChange={(e) => setPrazoRetirada(e.target.value)}
              required
            />
          </div>

          {/* Observações */}
          <Textarea
            label="Observações"
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            placeholder="Observações sobre a lista..."
          />

          {/* Botões */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
              Cancelar
            </Button>
            <Button type="submit" isLoading={createList.isPending}>
              <Plus className="w-4 h-4 mr-2" />
              Criar Lista
            </Button>
          </div>
        </div>
      </form>

      {/* Modal de novo fornecedor */}
      <Modal
        isOpen={showNewSupplierModal}
        onClose={() => setShowNewSupplierModal(false)}
        title="Novo Fornecedor"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createSupplier.mutate(novoFornecedor);
          }}
          className="space-y-4"
        >
          <Input
            label="Nome *"
            value={novoFornecedor.nome}
            onChange={(e) => setNovoFornecedor({ ...novoFornecedor, nome: e.target.value })}
            required
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="CPF"
              value={novoFornecedor.cpf}
              onChange={(e) => setNovoFornecedor({ ...novoFornecedor, cpf: e.target.value })}
              placeholder="000.000.000-00"
            />
            <Input
              label="Telefone"
              value={novoFornecedor.telefone}
              onChange={(e) => setNovoFornecedor({ ...novoFornecedor, telefone: e.target.value })}
              placeholder="(00) 00000-0000"
            />
          </div>
          <Input
            label="E-mail"
            type="email"
            value={novoFornecedor.email}
            onChange={(e) => setNovoFornecedor({ ...novoFornecedor, email: e.target.value })}
          />
          <Input
            label="Endereço"
            value={novoFornecedor.endereco}
            onChange={(e) => setNovoFornecedor({ ...novoFornecedor, endereco: e.target.value })}
          />

          <ModalFooter>
            <Button type="button" variant="secondary" onClick={() => setShowNewSupplierModal(false)}>
              Cancelar
            </Button>
            <Button type="submit" isLoading={createSupplier.isPending}>
              Cadastrar
            </Button>
          </ModalFooter>
        </form>
      </Modal>
    </div>
  );
}
