import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Package,
  DollarSign,
  TrendingUp,
  Clock,
  AlertTriangle,
  AlertCircle,
  ArrowRight
} from 'lucide-react';
import { dashboardApi } from '../services/api';
import { Button } from '../components/ui';
import { PaymentMethod } from '../types';

export default function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: dashboardApi.get,
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value || 0);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('pt-BR');
  };

  const paymentMethodLabels: Record<PaymentMethod, string> = {
    DINHEIRO: 'Dinheiro',
    PIX: 'Pix',
    CARTAO_CREDITO: 'Crédito',
    CARTAO_DEBITO: 'Débito',
  };

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="grid grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-gray-200 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

      {/* Cards de estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Peças Disponíveis</p>
              <p className="text-3xl font-bold text-gray-900">
                {data?.productStats?.pecas_disponiveis || 0}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Valor: {formatCurrency(data?.productStats?.valor_estoque || 0)}
              </p>
            </div>
            <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center">
              <Package className="w-6 h-6 text-primary-600" />
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Vendas Hoje</p>
              <p className="text-3xl font-bold text-green-600">
                {formatCurrency(data?.salesToday?.valor_total || 0)}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {data?.salesToday?.quantidade || 0} vendas
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Vendas do Mês</p>
              <p className="text-3xl font-bold text-blue-600">
                {formatCurrency(data?.salesMonth?.valor_total || 0)}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {data?.salesMonth?.quantidade || 0} vendas
              </p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Comissões Pendentes</p>
              <p className="text-3xl font-bold text-orange-600">
                {formatCurrency(data?.pendingCommissions?.valor_total || 0)}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {data?.pendingCommissions?.quantidade || 0} comissões
              </p>
            </div>
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
              <Clock className="w-6 h-6 text-orange-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Listas vencidas - alerta vermelho */}
      {data?.expiredLists && data.expiredLists.length > 0 && (
        <div className="card border-red-200 bg-red-50">
          <div className="p-4 border-b border-red-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600" />
              <h2 className="font-semibold text-red-900">Listas Vencidas - Ação Necessária!</h2>
            </div>
            <Link to="/consignacoes">
              <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700">
                Ver todas <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>
          <div className="divide-y divide-red-200">
            {data.expiredLists.map((list) => (
              <Link
                key={list.id}
                to={`/consignacoes/${list.id}`}
                className="p-4 flex items-center justify-between hover:bg-red-100 transition-colors"
              >
                <div>
                  <p className="font-medium text-red-900">{list.fornecedor_nome}</p>
                  <p className="text-sm text-red-700">
                    {list.codigo} - {list.pecas_disponiveis} peças disponíveis
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-red-600">
                    Venceu: {formatDate(list.prazo_retirada)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Listas próximas do vencimento */}
        <div className="card">
          <div className="p-4 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-600" />
              <h2 className="font-semibold text-gray-900">Listas próximas do vencimento</h2>
            </div>
            <Link to="/consignacoes">
              <Button variant="ghost" size="sm">
                Ver todas <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>
          <div className="divide-y">
            {data?.expiringLists?.length === 0 ? (
              <p className="p-4 text-gray-500 text-center">Nenhuma lista próxima do vencimento</p>
            ) : (
              data?.expiringLists?.map((list) => (
                <Link
                  key={list.id}
                  to={`/consignacoes/${list.id}`}
                  className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <div>
                    <p className="font-medium text-gray-900">{list.fornecedor_nome}</p>
                    <p className="text-sm text-gray-500">
                      {list.codigo} - {list.pecas_disponiveis} peças disponíveis
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-orange-600">
                      Vence: {formatDate(list.prazo_retirada)}
                    </p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Últimas vendas */}
        <div className="card">
          <div className="p-4 border-b flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Últimas vendas</h2>
            <Link to="/relatorios">
              <Button variant="ghost" size="sm">
                Ver todas <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>
          <div className="divide-y">
            {data?.recentSales?.length === 0 ? (
              <p className="p-4 text-gray-500 text-center">Nenhuma venda realizada</p>
            ) : (
              data?.recentSales?.slice(0, 5).map((sale) => (
                <div key={sale.id} className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{sale.codigo}</p>
                    <p className="text-sm text-gray-500">
                      {sale.vendedora_nome || 'Sem vendedora'} - {sale.total_itens} itens
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-green-600">
                      {formatCurrency(sale.valor_final)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {paymentMethodLabels[sale.forma_pagamento]}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Vendas por forma de pagamento */}
        <div className="card">
          <div className="p-4 border-b">
            <h2 className="font-semibold text-gray-900">Vendas por forma de pagamento (mês)</h2>
          </div>
          <div className="p-4 space-y-3">
            {data?.salesByPayment?.map((item) => (
              <div key={item.forma_pagamento} className="flex items-center justify-between">
                <span className="text-gray-700">{paymentMethodLabels[item.forma_pagamento]}</span>
                <div className="text-right">
                  <span className="font-semibold">{formatCurrency(item.total)}</span>
                  <span className="text-sm text-gray-500 ml-2">({item.quantidade} vendas)</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top vendedoras */}
        <div className="card">
          <div className="p-4 border-b">
            <h2 className="font-semibold text-gray-900">Top vendedoras (mês)</h2>
          </div>
          <div className="divide-y">
            {data?.topSellers?.map((seller, index) => (
              <div key={seller.id} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-sm font-semibold">
                    {index + 1}
                  </span>
                  <div>
                    <p className="font-medium text-gray-900">{seller.nome}</p>
                    <p className="text-sm text-gray-500">{seller.total_vendas} vendas</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{formatCurrency(seller.valor_vendido)}</p>
                  <p className="text-xs text-gray-500">
                    Comissão: {formatCurrency(seller.comissao)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
