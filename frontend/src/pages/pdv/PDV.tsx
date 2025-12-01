import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShoppingCart,
  Search,
  Trash2,
  CreditCard,
  Banknote,
  Smartphone,
  X,
  Check,
  User
} from 'lucide-react';
import toast from 'react-hot-toast';
import { productsApi, salesApi, sellersApi } from '../../services/api';
import { Button, Input, Select, Modal, ModalFooter } from '../../components/ui';
import type { Product, CartItem, PaymentMethod, Seller } from '../../types';

export default function PDV() {
  const queryClient = useQueryClient();
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  const [barcode, setBarcode] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [selectedSeller, setSelectedSeller] = useState<number | null>(null);
  const [clientName, setClientName] = useState('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);

  // Buscar vendedoras ativas
  const { data: sellers } = useQuery({
    queryKey: ['sellers', true],
    queryFn: () => sellersApi.getAll(true),
  });

  // Buscar produto por código de barras
  const searchByBarcode = useMutation({
    mutationFn: productsApi.getByBarcode,
    onSuccess: (product) => {
      addToCart(product);
      setBarcode('');
      barcodeInputRef.current?.focus();
    },
    onError: () => {
      toast.error('Produto não encontrado');
      setBarcode('');
    },
  });

  // Buscar produtos
  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: ['productSearch', searchTerm],
    queryFn: () => productsApi.searchAvailable(searchTerm),
    enabled: searchTerm.length >= 2,
  });

  // Criar venda
  const createSale = useMutation({
    mutationFn: salesApi.create,
    onSuccess: (sale) => {
      toast.success(`Venda ${sale.codigo} realizada com sucesso!`);
      setCart([]);
      setDiscount(0);
      setClientName('');
      setShowPaymentModal(false);
      queryClient.invalidateQueries({ queryKey: ['quickStats'] });
      barcodeInputRef.current?.focus();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao finalizar venda');
    },
  });

  // Focar no campo de código de barras ao carregar
  useEffect(() => {
    barcodeInputRef.current?.focus();
  }, []);

  // Busca automática quando para de digitar (para leitores de código de barras)
  useEffect(() => {
    if (!barcode.trim()) return;

    const timer = setTimeout(() => {
      // Se o código tem pelo menos 4 caracteres, busca automaticamente
      if (barcode.trim().length >= 4) {
        searchByBarcode.mutate(barcode.trim());
      }
    }, 300); // 300ms delay para leitores de código de barras

    return () => clearTimeout(timer);
  }, [barcode]);

  // Adicionar produto ao carrinho
  const addToCart = (product: Product) => {
    if (product.status !== 'DISPONIVEL') {
      toast.error('Este produto não está disponível para venda');
      return;
    }

    const exists = cart.find((item) => item.product.id === product.id);
    if (exists) {
      toast.error('Este produto já está no carrinho');
      return;
    }

    setCart([...cart, { product, valor_unitario: Number(product.valor_venda) }]);
    toast.success('Produto adicionado');
  };

  // Remover produto do carrinho
  const removeFromCart = (productId: number) => {
    setCart(cart.filter((item) => item.product.id !== productId));
  };

  // Calcular totais
  const subtotal = cart.reduce((sum, item) => sum + Number(item.valor_unitario || 0), 0);
  const total = subtotal - Number(discount || 0);

  // Handler do código de barras
  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (barcode.trim()) {
      searchByBarcode.mutate(barcode.trim());
    }
  };

  // Finalizar venda
  const handleFinalizeSale = (paymentMethod: PaymentMethod) => {
    if (cart.length === 0) {
      toast.error('Adicione produtos ao carrinho');
      return;
    }

    createSale.mutate({
      itens: cart.map((item) => ({
        produto_id: Number(item.product.id),
        valor_unitario: Number(item.valor_unitario),
      })),
      desconto: Number(discount) || 0,
      forma_pagamento: paymentMethod,
      cliente_nome: clientName || undefined,
      vendedora_id: selectedSeller ? Number(selectedSeller) : undefined,
    });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  return (
    <div className="h-full flex">
      {/* Área principal */}
      <div className="flex-1 flex flex-col p-6">
        {/* Header do PDV */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <ShoppingCart className="w-8 h-8 text-primary-600" />
            <h1 className="text-2xl font-bold text-gray-900">Ponto de Venda</h1>
          </div>

          <div className="flex items-center gap-4">
            {/* Seletor de vendedora */}
            <div className="flex items-center gap-2">
              <User className="w-5 h-5 text-gray-400" />
              <Select
                options={[
                  { value: '', label: 'Selecione vendedora' },
                  ...(sellers?.map((s: Seller) => ({ value: s.id, label: s.nome })) || []),
                ]}
                value={selectedSeller || ''}
                onChange={(e) => setSelectedSeller(e.target.value ? Number(e.target.value) : null)}
                className="w-48"
              />
            </div>
          </div>
        </div>

        {/* Campo de código de barras */}
        <form onSubmit={handleBarcodeSubmit} className="mb-6">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <input
                ref={barcodeInputRef}
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="Digite ou leia o código de barras..."
                className="w-full px-4 py-4 text-xl border-2 border-primary-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-primary-200 focus:border-primary-500"
                autoFocus
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              className="px-6"
              onClick={() => setShowSearchModal(true)}
            >
              <Search className="w-5 h-5 mr-2" />
              Buscar
            </Button>
          </div>
        </form>

        {/* Lista de itens no carrinho */}
        <div className="flex-1 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-4 bg-gray-50 border-b">
            <h2 className="font-semibold text-gray-900">Itens do Carrinho</h2>
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 400px)' }}>
            {cart.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <ShoppingCart className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Carrinho vazio</p>
                <p className="text-sm">Leia um código de barras para adicionar produtos</p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50 text-left text-sm text-gray-600">
                  <tr>
                    <th className="px-4 py-3">Código</th>
                    <th className="px-4 py-3">Descrição</th>
                    <th className="px-4 py-3">Cor/Tamanho</th>
                    <th className="px-4 py-3 text-right">Valor</th>
                    <th className="px-4 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {cart.map((item) => (
                    <tr key={item.product.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-sm">{item.product.codigo_barras}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{item.product.descricao}</p>
                        <p className="text-sm text-gray-500">{item.product.marca}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {item.product.cor} / {item.product.tamanho}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">
                        {formatCurrency(item.valor_unitario)}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => removeFromCart(item.product.id)}
                          className="p-1 text-red-500 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Sidebar - Resumo e pagamento */}
      <div className="w-96 bg-white border-l border-gray-200 flex flex-col">
        <div className="p-6 border-b">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Resumo da Venda</h2>

          <div className="space-y-3">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal ({cart.length} itens)</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-gray-600">Desconto</span>
              <Input
                type="number"
                value={discount || ''}
                onChange={(e) => setDiscount(Number(e.target.value) || 0)}
                placeholder="0,00"
                className="flex-1 text-right"
                min="0"
                max={subtotal}
                step="0.01"
              />
            </div>

            <div className="pt-3 border-t">
              <div className="flex justify-between text-xl font-bold">
                <span>Total</span>
                <span className="text-green-600">{formatCurrency(total)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 border-b">
          <Input
            label="Nome do Cliente (opcional)"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            placeholder="Digite o nome do cliente"
          />
        </div>

        <div className="flex-1 p-6">
          <h3 className="font-medium text-gray-900 mb-4">Forma de Pagamento</h3>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleFinalizeSale('DINHEIRO')}
              disabled={cart.length === 0 || createSale.isPending}
              className="p-4 border-2 border-gray-200 rounded-xl hover:border-green-500 hover:bg-green-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Banknote className="w-8 h-8 mx-auto mb-2 text-green-600" />
              <span className="block text-sm font-medium">Dinheiro</span>
            </button>

            <button
              onClick={() => handleFinalizeSale('PIX')}
              disabled={cart.length === 0 || createSale.isPending}
              className="p-4 border-2 border-gray-200 rounded-xl hover:border-primary-500 hover:bg-primary-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Smartphone className="w-8 h-8 mx-auto mb-2 text-primary-600" />
              <span className="block text-sm font-medium">Pix</span>
            </button>

            <button
              onClick={() => handleFinalizeSale('CARTAO_CREDITO')}
              disabled={cart.length === 0 || createSale.isPending}
              className="p-4 border-2 border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CreditCard className="w-8 h-8 mx-auto mb-2 text-blue-600" />
              <span className="block text-sm font-medium">Crédito</span>
            </button>

            <button
              onClick={() => handleFinalizeSale('CARTAO_DEBITO')}
              disabled={cart.length === 0 || createSale.isPending}
              className="p-4 border-2 border-gray-200 rounded-xl hover:border-orange-500 hover:bg-orange-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CreditCard className="w-8 h-8 mx-auto mb-2 text-orange-600" />
              <span className="block text-sm font-medium">Débito</span>
            </button>
          </div>
        </div>

        {cart.length > 0 && (
          <div className="p-6 border-t">
            <Button
              variant="danger"
              className="w-full"
              onClick={() => {
                setCart([]);
                setDiscount(0);
                setClientName('');
              }}
            >
              <X className="w-4 h-4 mr-2" />
              Limpar Carrinho
            </Button>
          </div>
        )}
      </div>

      {/* Modal de busca */}
      <Modal
        isOpen={showSearchModal}
        onClose={() => {
          setShowSearchModal(false);
          setSearchTerm('');
        }}
        title="Buscar Produto"
        size="lg"
      >
        <div className="space-y-4">
          <Input
            placeholder="Digite descrição, marca ou código..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            autoFocus
          />

          {isSearching && (
            <div className="text-center py-4">
              <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto"></div>
            </div>
          )}

          {searchResults && searchResults.length > 0 && (
            <div className="max-h-96 overflow-y-auto border rounded-lg divide-y">
              {searchResults.map((product: Product) => (
                <button
                  key={product.id}
                  onClick={() => {
                    addToCart(product);
                    setShowSearchModal(false);
                    setSearchTerm('');
                  }}
                  className="w-full p-4 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="flex justify-between">
                    <div>
                      <p className="font-medium">{product.descricao}</p>
                      <p className="text-sm text-gray-500">
                        {product.marca} - {product.cor} - {product.tamanho}
                      </p>
                      <p className="text-xs text-gray-400 font-mono">{product.codigo_barras}</p>
                    </div>
                    <p className="font-semibold text-green-600">
                      {formatCurrency(product.valor_venda)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {searchTerm.length >= 2 && searchResults?.length === 0 && (
            <p className="text-center text-gray-500 py-4">Nenhum produto encontrado</p>
          )}
        </div>
      </Modal>
    </div>
  );
}
