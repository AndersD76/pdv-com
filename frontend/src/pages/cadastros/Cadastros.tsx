import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { auxiliariesApi } from '../../services/api';
import { Button, Input, Select } from '../../components/ui';

type Tab = 'descricoes' | 'cores' | 'tamanhos' | 'marcas';

export default function Cadastros() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('descricoes');
  const [newItem, setNewItem] = useState('');
  const [sizeCategory, setSizeCategory] = useState('roupa');

  const { data: auxiliaries, isLoading } = useQuery({
    queryKey: ['auxiliaries'],
    queryFn: auxiliariesApi.getAll,
  });

  const createDescription = useMutation({
    mutationFn: auxiliariesApi.createDescription,
    onSuccess: () => { toast.success('Adicionado!'); queryClient.invalidateQueries({ queryKey: ['auxiliaries'] }); setNewItem(''); },
  });

  const createColor = useMutation({
    mutationFn: auxiliariesApi.createColor,
    onSuccess: () => { toast.success('Adicionado!'); queryClient.invalidateQueries({ queryKey: ['auxiliaries'] }); setNewItem(''); },
  });

  const createSize = useMutation({
    mutationFn: (data: { nome: string; categoria: string }) => auxiliariesApi.createSize(data.nome, data.categoria),
    onSuccess: () => { toast.success('Adicionado!'); queryClient.invalidateQueries({ queryKey: ['auxiliaries'] }); setNewItem(''); },
  });

  const createBrand = useMutation({
    mutationFn: auxiliariesApi.createBrand,
    onSuccess: () => { toast.success('Adicionado!'); queryClient.invalidateQueries({ queryKey: ['auxiliaries'] }); setNewItem(''); },
  });

  const deleteDescription = useMutation({
    mutationFn: auxiliariesApi.deleteDescription,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['auxiliaries'] }),
  });

  const deleteColor = useMutation({
    mutationFn: auxiliariesApi.deleteColor,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['auxiliaries'] }),
  });

  const deleteSize = useMutation({
    mutationFn: auxiliariesApi.deleteSize,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['auxiliaries'] }),
  });

  const deleteBrand = useMutation({
    mutationFn: auxiliariesApi.deleteBrand,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['auxiliaries'] }),
  });

  const handleAdd = () => {
    if (!newItem.trim()) return;
    switch (activeTab) {
      case 'descricoes': createDescription.mutate(newItem); break;
      case 'cores': createColor.mutate(newItem); break;
      case 'tamanhos': createSize.mutate({ nome: newItem, categoria: sizeCategory }); break;
      case 'marcas': createBrand.mutate(newItem); break;
    }
  };

  const handleDelete = (id: number) => {
    if (!confirm('Excluir item?')) return;
    switch (activeTab) {
      case 'descricoes': deleteDescription.mutate(id); break;
      case 'cores': deleteColor.mutate(id); break;
      case 'tamanhos': deleteSize.mutate(id); break;
      case 'marcas': deleteBrand.mutate(id); break;
    }
  };

  const getCurrentItems = () => {
    switch (activeTab) {
      case 'descricoes': return auxiliaries?.descriptions || [];
      case 'cores': return auxiliaries?.colors || [];
      case 'tamanhos': return auxiliaries?.sizes || [];
      case 'marcas': return auxiliaries?.brands || [];
    }
  };

  const tabs = [
    { id: 'descricoes', label: 'Descrições' },
    { id: 'cores', label: 'Cores' },
    { id: 'tamanhos', label: 'Tamanhos' },
    { id: 'marcas', label: 'Marcas' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Cadastros Auxiliares</h1>

      <div className="card">
        {/* Tabs */}
        <div className="border-b">
          <div className="flex">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as Tab)}
                className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Formulário de adição */}
        <div className="p-4 border-b bg-gray-50">
          <div className="flex gap-4 max-w-xl">
            <Input
              placeholder={`Novo(a) ${activeTab.slice(0, -1)}...`}
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
            {activeTab === 'tamanhos' && (
              <Select
                options={[
                  { value: 'roupa', label: 'Roupa' },
                  { value: 'calcado', label: 'Calçado' },
                  { value: 'unico', label: 'Único' },
                ]}
                value={sizeCategory}
                onChange={(e) => setSizeCategory(e.target.value)}
                className="w-32"
              />
            )}
            <Button onClick={handleAdd}>
              <Plus className="w-4 h-4 mr-2" /> Adicionar
            </Button>
          </div>
        </div>

        {/* Lista de itens */}
        <div className="p-4">
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Carregando...</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {getCurrentItems().map((item: { id: number; nome: string; categoria?: string }) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between px-3 py-2 bg-gray-100 rounded-lg group"
                >
                  <span className="text-sm">
                    {item.nome}
                    {item.categoria && (
                      <span className="text-xs text-gray-500 ml-1">({item.categoria})</span>
                    )}
                  </span>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-red-500 hover:bg-red-100 rounded transition-opacity"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
