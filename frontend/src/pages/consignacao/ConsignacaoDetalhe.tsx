import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Plus, Trash2, Edit2, Tags, FileText, RotateCcw,
  Check, Download, Wallet, Globe, ImageOff, Printer
} from 'lucide-react';
import toast from 'react-hot-toast';
import { consignmentsApi, productPhotoUrl } from '../../services/api';
import { generateConsignmentPDF } from '../../utils/generatePDF';
import { printLabels } from '../../utils/labels';
import {
  Button,
  Table, TableHead, TableBody, TableRow, TableHeader, TableCell, TableEmpty
} from '../../components/ui';
import { ProductFormModal } from '../../components/products/ProductFormModal';
import { ProductCondition, ListStatus } from '../../types';
import type { Product } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { formatCurrency, formatDate, formatDateTime, isPastDate } from '../../utils/format';

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
  const { isAdmin } = useAuth();

  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const { data: list, isLoading } = useQuery({
    queryKey: ['consignment', id],
    queryFn: () => consignmentsApi.getById(Number(id)),
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
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao devolver produtos');
    },
  });

  const paySupplier = useMutation({
    mutationFn: () => consignmentsApi.markAsPaid(Number(id)),
    onSuccess: (payment) => {
      toast.success(`Pagamento de ${formatCurrency(payment.valor)} registrado!`);
      queryClient.invalidateQueries({ queryKey: ['consignment', id] });
      queryClient.invalidateQueries({ queryKey: ['paymentReport'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao registrar pagamento');
    },
  });

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setShowAddProductModal(true);
  };

  const closeProductModal = () => {
    setShowAddProductModal(false);
    setEditingProduct(null);
  };

  if (isLoading) {
    return <div className="animate-pulse h-96 bg-gray-200 rounded-xl" />;
  }

  if (!list) {
    return <div>Lista não encontrada</div>;
  }

  const products = list.products || [];
  const availableProducts = products.filter(p => p.status === 'DISPONIVEL');
  const totalValorVenda = products.reduce((sum, p) => sum + Number(p.valor_venda || 0), 0);
  const soldProducts = products.filter(p => p.status === 'VENDIDO');
  const totalPendente = soldProducts.filter(p => !p.pago_fornecedor).reduce((sum, p) => sum + Number(p.valor_compra || 0), 0);
  const totalPagoFornecedor = soldProducts.filter(p => p.pago_fornecedor).reduce((sum, p) => sum + Number(p.valor_compra || 0), 0);
  const payments = list.payments || [];

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
          <p className={`font-semibold ${isPastDate(list.prazo_retirada) && list.status !== 'FINALIZADA' ? 'text-red-600' : ''}`}>
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
            A pagar ao fornecedor: {formatCurrency(totalPendente)}
          </p>
          {totalPagoFornecedor > 0 && (
            <p className="text-xs text-green-600">Já pago: {formatCurrency(totalPagoFornecedor)}</p>
          )}
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
          {isAdmin && totalPendente > 0 && (
            <Button
              variant="success"
              isLoading={paySupplier.isPending}
              onClick={() => {
                if (confirm(`Registrar pagamento de ${formatCurrency(totalPendente)} ao fornecedor pelas peças vendidas?`)) {
                  paySupplier.mutate();
                }
              }}
            >
              <Wallet className="w-4 h-4 mr-2" />
              Pagar fornecedor ({formatCurrency(totalPendente)})
            </Button>
          )}
          {list.status === 'DIGITADA' && products.length > 0 && (
            <Button variant="secondary" onClick={() => updateStatus.mutate(ListStatus.EXPORTADA)}>
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
            <Button variant="success" onClick={() => updateStatus.mutate(ListStatus.FINALIZADA)}>
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
              <TableHeader className="w-16">Foto</TableHeader>
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
                  <TableCell>
                    {productPhotoUrl(product) ? (
                      <img
                        src={productPhotoUrl(product)!}
                        alt={product.descricao}
                        loading="lazy"
                        className="w-12 h-12 rounded-md object-cover border"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-md bg-gray-100 flex items-center justify-center" title="Sem foto">
                        <ImageOff className="w-4 h-4 text-gray-400" />
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-sm">{product.codigo_barras}</TableCell>
                  <TableCell className="font-medium">
                    {product.descricao}
                    {product.canal === 'DIGITAL' && (
                      <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-normal bg-purple-100 text-purple-700">
                        <Globe className="w-3 h-3" /> Digital
                      </span>
                    )}
                  </TableCell>
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
                    {product.status === 'VENDIDO' && (
                      <span className={`ml-1 text-xs ${product.pago_fornecedor ? 'text-green-600' : 'text-orange-600'}`}>
                        {product.pago_fornecedor ? 'pago' : 'a pagar'}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {product.status === 'DISPONIVEL' && list.status !== 'FINALIZADA' && (
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => printLabels([product])} title="Imprimir etiqueta">
                          <Printer className="w-4 h-4" />
                        </Button>
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

      {/* Pagamentos ao fornecedor */}
      {payments.length > 0 && (
        <div className="card">
          <div className="p-4 border-b">
            <h2 className="font-semibold text-gray-900">Pagamentos ao Fornecedor</h2>
          </div>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Data</TableHeader>
                <TableHeader>Peças</TableHeader>
                <TableHeader className="text-right">Valor</TableHeader>
                <TableHeader>Registrado por</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {payments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell>{formatDateTime(payment.created_at)}</TableCell>
                  <TableCell>{payment.quantidade_pecas}</TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(payment.valor)}</TableCell>
                  <TableCell>{payment.usuario_nome || '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Modal de adicionar/editar peça (fotos, IA e canal de venda) */}
      <ProductFormModal
        isOpen={showAddProductModal}
        listId={Number(id)}
        product={editingProduct}
        onClose={closeProductModal}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ['consignment', id] })}
      />
    </div>
  );
}
