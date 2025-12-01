import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Plus, Trash2, Edit2, Tags, FileText, RotateCcw,
  Check, Package, AlertTriangle, Download
} from 'lucide-react';
import toast from 'react-hot-toast';
import { consignmentsApi, auxiliariesApi } from '../../services/api';
import { generateConsignmentPDF } from '../../utils/generatePDF';
import {
  Button, Input, Select, Modal, ModalFooter,
  Table, TableHead, TableBody, TableRow, TableHeader, TableCell, TableEmpty
} from '../../components/ui';
import type { Product, ProductCondition, ListStatus } from '../../types';

const conditionLabels: Record<ProductCondition, string> = {
  NOVA: 'Nova',
  SEMI_NOVA: 'Semi Nova',
  USADA: 'Usada',
};

const statusColors = {
  DISPONIVEL: 'bg-green-100 text-green-800',
  VENDIDO: 'bg-blue-100 text-blue-800',
  DEVOLVIDO: 'bg-gray-100 text-gray-800',
};

export default function ConsignacaoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productForm, setProductForm] = useState({
    descricao: '',
    cor: '',
    marca: '',
    tamanho: '',
    condicao: 'SEMI_NOVA' as ProductCondition,
    defeitos: '',
    valor_compra: '',
    valor_venda: '',
  });

  const { data: list, isLoading } = useQuery({
    queryKey: ['consignment', id],
    queryFn: () => consignmentsApi.getById(Number(id)),
  });

  const { data: auxiliaries } = useQuery({
    queryKey: ['auxiliaries'],
    queryFn: auxiliariesApi.getAll,
  });

  const addProduct = useMutation({
    mutationFn: (data: Parameters<typeof consignmentsApi.addProduct>[1]) =>
      consignmentsApi.addProduct(Number(id), data),
    onSuccess: () => {
      toast.success('Produto adicionado!');
      queryClient.invalidateQueries({ queryKey: ['consignment', id] });
      setShowAddProductModal(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao adicionar produto');
    },
  });

  const updateProduct = useMutation({
    mutationFn: ({ productId, data }: { productId: number; data: Parameters<typeof consignmentsApi.updateProduct>[2] }) =>
      consignmentsApi.updateProduct(Number(id), productId, data),
    onSuccess: () => {
      toast.success('Produto atualizado!');
      queryClient.invalidateQueries({ queryKey: ['consignment', id] });
      setEditingProduct(null);
      resetForm();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao atualizar produto');
    },
  });

  const removeProduct = useMutation({
    mutationFn: (productId: number) => consignmentsApi.removeProduct(Number(id), productId),
    onSuccess: () => {
      toast.success('Produto removido!');
      queryClient.invalidateQueries({ queryKey: ['consignment', id] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao remover produto');
    },
  });

  const updateStatus = useMutation({
    mutationFn: (status: ListStatus) => consignmentsApi.updateStatus(Number(id), status),
    onSuccess: () => {
      toast.success('Status atualizado!');
      queryClient.invalidateQueries({ queryKey: ['consignment', id] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao atualizar status');
    },
  });

  const returnAllProducts = useMutation({
    mutationFn: () => consignmentsApi.returnAllProducts(Number(id)),
    onSuccess: () => {
      toast.success('Produtos devolvidos!');
      queryClient.invalidateQueries({ queryKey: ['consignment', id] });
    },
  });

  const resetForm = () => {
    setProductForm({
      descricao: '',
      cor: '',
      marca: '',
      tamanho: '',
      condicao: 'SEMI_NOVA',
      defeitos: '',
      valor_compra: '',
      valor_venda: '',
    });
  };

  const handleSubmitProduct = (e: React.FormEvent) => {
    e.preventDefault();

    const data = {
      descricao: productForm.descricao,
      cor: productForm.cor || undefined,
      marca: productForm.marca || undefined,
      tamanho: productForm.tamanho || undefined,
      condicao: productForm.condicao,
      defeitos: productForm.defeitos || undefined,
      valor_compra: Number(productForm.valor_compra),
      valor_venda: Number(productForm.valor_venda),
    };

    if (editingProduct) {
      updateProduct.mutate({ productId: editingProduct.id, data });
    } else {
      addProduct.mutate(data);
    }
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setProductForm({
      descricao: product.descricao,
      cor: product.cor || '',
      marca: product.marca || '',
      tamanho: product.tamanho || '',
      condicao: product.condicao,
      defeitos: product.defeitos || '',
      valor_compra: String(product.valor_compra),
      valor_venda: String(product.valor_venda),
    });
    setShowAddProductModal(true);
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
  const formatDate = (date: string) => new Date(date).toLocaleDateString('pt-BR');

  if (isLoading) {
    return <div className="animate-pulse h-96 bg-gray-200 rounded-xl" />;
  }

  if (!list) {
    return <div>Lista não encontrada</div>;
  }

  const products = list.products || [];
  const availableProducts = products.filter(p => p.status === 'DISPONIVEL');
  const totalValorVenda = products.reduce((sum, p) => sum + Number(p.valor_venda || 0), 0);
  const totalVendido = products.filter(p => p.status === 'VENDIDO').reduce((sum, p) => sum + Number(p.valor_compra || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Lista {list.codigo}</h1>
            <p className="text-gray-600">{list.fornecedor_nome}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => generateConsignmentPDF(list, products)}
            disabled={products.length === 0}
          >
            <Download className="w-4 h-4 mr-2" />
            Gerar PDF
          </Button>
          <Link to={`/etiquetas?lista=${id}`}>
            <Button variant="secondary">
              <Tags className="w-4 h-4 mr-2" />
              Etiquetas
            </Button>
          </Link>
          {list.status !== 'FINALIZADA' && (
            <Button onClick={() => setShowAddProductModal(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Peça
            </Button>
          )}
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="card p-4">
          <p className="text-sm text-gray-600">Recebimento</p>
          <p className="font-semibold">{formatDate(list.data_recebimento)}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-gray-600">Prazo Retirada</p>
          <p className={`font-semibold ${new Date(list.prazo_retirada) < new Date() ? 'text-red-600' : ''}`}>
            {formatDate(list.prazo_retirada)}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-gray-600">Total Peças</p>
          <p className="font-semibold">{products.length}</p>
          <p className="text-xs text-gray-500">
            {availableProducts.length} disponíveis
          </p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-gray-600">Valor Total</p>
          <p className="font-semibold text-green-600">{formatCurrency(totalValorVenda)}</p>
          <p className="text-xs text-gray-500">
            A pagar: {formatCurrency(totalVendido)}
          </p>
        </div>
      </div>

      {/* Ações de status */}
      <div className="card p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-gray-600">Status:</span>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
            list.status === 'DIGITADA' ? 'bg-yellow-100 text-yellow-800' :
            list.status === 'EXPORTADA' ? 'bg-blue-100 text-blue-800' :
            'bg-green-100 text-green-800'
          }`}>
            {list.status}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {list.status === 'DIGITADA' && products.length > 0 && (
            <Button variant="secondary" onClick={() => updateStatus.mutate('EXPORTADA')}>
              <FileText className="w-4 h-4 mr-2" />
              Marcar como Exportada
            </Button>
          )}
          {list.status === 'EXPORTADA' && availableProducts.length > 0 && (
            <Button
              variant="secondary"
              onClick={() => {
                if (confirm('Devolver todas as peças disponíveis?')) {
                  returnAllProducts.mutate();
                }
              }}
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Devolver Todas
            </Button>
          )}
          {list.status !== 'FINALIZADA' && availableProducts.length === 0 && products.length > 0 && (
            <Button variant="success" onClick={() => updateStatus.mutate('FINALIZADA')}>
              <Check className="w-4 h-4 mr-2" />
              Finalizar Lista
            </Button>
          )}
        </div>
      </div>

      {/* Tabela de produtos */}
      <div className="card">
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Peças da Lista</h2>
        </div>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Código</TableHeader>
              <TableHeader>Descrição</TableHeader>
              <TableHeader>Cor</TableHeader>
              <TableHeader>Marca</TableHeader>
              <TableHeader>Tamanho</TableHeader>
              <TableHeader>Condição</TableHeader>
              <TableHeader className="text-right">V. Compra</TableHeader>
              <TableHeader className="text-right">V. Venda</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader className="w-24">Ações</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {products.length === 0 ? (
              <TableEmpty message="Nenhuma peça cadastrada" />
            ) : (
              products.map((product: Product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-mono text-sm">{product.codigo_barras}</TableCell>
                  <TableCell className="font-medium">{product.descricao}</TableCell>
                  <TableCell>{product.cor}</TableCell>
                  <TableCell>{product.marca}</TableCell>
                  <TableCell>{product.tamanho}</TableCell>
                  <TableCell>{conditionLabels[product.condicao]}</TableCell>
                  <TableCell className="text-right">{formatCurrency(product.valor_compra)}</TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(product.valor_venda)}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusColors[product.status]}`}>
                      {product.status}
                    </span>
                  </TableCell>
                  <TableCell>
                    {product.status === 'DISPONIVEL' && list.status !== 'FINALIZADA' && (
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEditModal(product)}>
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (confirm('Remover esta peça?')) {
                              removeProduct.mutate(product.id);
                            }
                          }}
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Modal de adicionar/editar produto */}
      <Modal
        isOpen={showAddProductModal}
        onClose={() => {
          setShowAddProductModal(false);
          setEditingProduct(null);
          resetForm();
        }}
        title={editingProduct ? 'Editar Peça' : 'Adicionar Peça'}
        size="lg"
      >
        <form onSubmit={handleSubmitProduct} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Descrição *</label>
              <input
                list="descriptions"
                className="input"
                value={productForm.descricao}
                onChange={(e) => setProductForm({ ...productForm, descricao: e.target.value })}
                required
              />
              <datalist id="descriptions">
                {auxiliaries?.descriptions.map((d) => (
                  <option key={d.id} value={d.nome} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="label">Cor</label>
              <input
                list="colors"
                className="input"
                value={productForm.cor}
                onChange={(e) => setProductForm({ ...productForm, cor: e.target.value })}
              />
              <datalist id="colors">
                {auxiliaries?.colors.map((c) => (
                  <option key={c.id} value={c.nome} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="label">Marca</label>
              <input
                list="brands"
                className="input"
                value={productForm.marca}
                onChange={(e) => setProductForm({ ...productForm, marca: e.target.value })}
              />
              <datalist id="brands">
                {auxiliaries?.brands.map((b) => (
                  <option key={b.id} value={b.nome} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="label">Tamanho</label>
              <input
                list="sizes"
                className="input"
                value={productForm.tamanho}
                onChange={(e) => setProductForm({ ...productForm, tamanho: e.target.value })}
              />
              <datalist id="sizes">
                {auxiliaries?.sizes.map((s) => (
                  <option key={s.id} value={s.nome} />
                ))}
              </datalist>
            </div>

            <Select
              label="Condição"
              options={[
                { value: 'NOVA', label: 'Nova' },
                { value: 'SEMI_NOVA', label: 'Semi Nova' },
                { value: 'USADA', label: 'Usada' },
              ]}
              value={productForm.condicao}
              onChange={(e) => setProductForm({ ...productForm, condicao: e.target.value as ProductCondition })}
            />

            <div className="col-span-2">
              <Input
                label="Defeitos"
                value={productForm.defeitos}
                onChange={(e) => setProductForm({ ...productForm, defeitos: e.target.value })}
                placeholder="Descreva os defeitos se houver..."
              />
            </div>

            <Input
              label="Valor de Compra (R$) *"
              type="number"
              step="0.01"
              min="0"
              value={productForm.valor_compra}
              onChange={(e) => {
                const valorCompra = e.target.value;
                setProductForm({
                  ...productForm,
                  valor_compra: valorCompra,
                  // Sugerir valor de venda como 2x o valor de compra
                  valor_venda: productForm.valor_venda || String(Number(valorCompra) * 2),
                });
              }}
              required
            />

            <Input
              label="Valor de Venda (R$) *"
              type="number"
              step="0.01"
              min="0"
              value={productForm.valor_venda}
              onChange={(e) => setProductForm({ ...productForm, valor_venda: e.target.value })}
              required
            />
          </div>

          <ModalFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setShowAddProductModal(false);
                setEditingProduct(null);
                resetForm();
              }}
            >
              Cancelar
            </Button>
            <Button type="submit" isLoading={addProduct.isPending || updateProduct.isPending}>
              {editingProduct ? 'Salvar' : 'Adicionar'}
            </Button>
          </ModalFooter>
        </form>
      </Modal>
    </div>
  );
}
