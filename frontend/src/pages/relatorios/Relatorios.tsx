import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FileText,
  Calendar,
  Users,
  Truck,
  TrendingUp,
  Filter
} from 'lucide-react';
import { salesApi, sellersApi, consignmentsApi, suppliersApi } from '../../services/api';
import {
  Button,
  Input,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
  TableEmpty
} from '../../components/ui';
import { PaymentMethod } from '../../types';
import type { Sale, Seller, SellerCommission } from '../../types';

interface CommissionReportItem {
  seller: Seller;
  commissions: SellerCommission[];
  totals: {
    total_comissao: number;
    total_pago: number;
    total_pendente: number;
    total_vendas: number;
  };
}

const paymentLabels: Record<PaymentMethod, string> = {
  DINHEIRO: 'Dinheiro',
  PIX: 'Pix',
  CARTAO_CREDITO: 'Crédito',
  CARTAO_DEBITO: 'Débito',
};

type TabType = 'vendas' | 'comissoes' | 'fornecedores';

export default function Relatorios() {
  const today = new Date().toISOString().split('T')[0];
  const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString().split('T')[0];

  const [activeTab, setActiveTab] = useState<TabType>('vendas');
  const [inicio, setInicio] = useState(firstDayOfMonth);
  const [fim, setFim] = useState(today);

  // Filtros específicos
  const [vendedoraId, setVendedoraId] = useState<number | ''>('');
  const [fornecedorId, setFornecedorId] = useState<number | ''>('');
  const [statusPagamento, setStatusPagamento] = useState<'todos' | 'pago' | 'pendente'>('todos');

  // Queries
  const { data: dailyReport } = useQuery({
    queryKey: ['dailyReport', today],
    queryFn: () => salesApi.getDailyReport(today),
  });

  const { data: salesReport, refetch: refetchSales } = useQuery({
    queryKey: ['salesReport', inicio, fim],
    queryFn: () => salesApi.getReport(inicio, fim),
    enabled: activeTab === 'vendas',
  });

  const { data: sellers } = useQuery({
    queryKey: ['sellers'],
    queryFn: () => sellersApi.getAll(),
  });

  const { data: suppliers } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => suppliersApi.getAll(),
  });

  const { data: commissionReport, refetch: refetchCommissions } = useQuery<CommissionReportItem[]>({
    queryKey: ['commissionReport', vendedoraId, inicio, fim, statusPagamento],
    queryFn: async (): Promise<CommissionReportItem[]> => {
      if (!vendedoraId) {
        // Buscar de todas as vendedoras
        const allSellers = await sellersApi.getAll();
        const reports = await Promise.all(
          allSellers.map(async (s: Seller): Promise<CommissionReportItem> => {
            try {
              const report = await sellersApi.getCommissions(s.id, {
                inicio,
                fim,
                pago: statusPagamento === 'todos' ? undefined : statusPagamento === 'pago'
              });
              return {
                seller: s,
                commissions: report.commissions || [],
                totals: {
                  total_comissao: Number(report.totals?.total_comissao) || 0,
                  total_pago: Number(report.totals?.total_pago) || 0,
                  total_pendente: Number(report.totals?.total_pendente) || 0,
                  total_vendas: Number(report.totals?.total_vendas) || 0,
                }
              };
            } catch {
              return {
                seller: s,
                commissions: [],
                totals: { total_comissao: 0, total_pago: 0, total_pendente: 0, total_vendas: 0 }
              };
            }
          })
        );
        return reports;
      }
      const report = await sellersApi.getCommissions(Number(vendedoraId), {
        inicio,
        fim,
        pago: statusPagamento === 'todos' ? undefined : statusPagamento === 'pago'
      });
      return [{
        seller: report.seller,
        commissions: report.commissions || [],
        totals: {
          total_comissao: Number(report.totals?.total_comissao) || 0,
          total_pago: Number(report.totals?.total_pago) || 0,
          total_pendente: Number(report.totals?.total_pendente) || 0,
          total_vendas: Number(report.totals?.total_vendas) || 0,
        }
      }];
    },
    enabled: activeTab === 'comissoes',
  });

  const { data: paymentReport, refetch: refetchPayments } = useQuery({
    queryKey: ['paymentReport', fornecedorId, inicio, fim, statusPagamento],
    queryFn: () => consignmentsApi.getPaymentReport({
      inicio,
      fim,
      pago: statusPagamento === 'todos' ? undefined : statusPagamento === 'pago',
      fornecedor_id: fornecedorId ? Number(fornecedorId) : undefined
    }),
    enabled: activeTab === 'fornecedores',
  });

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

  const handleFilter = () => {
    if (activeTab === 'vendas') refetchSales();
    else if (activeTab === 'comissoes') refetchCommissions();
    else if (activeTab === 'fornecedores') refetchPayments();
  };

  const tabs = [
    { id: 'vendas' as TabType, label: 'Vendas', icon: TrendingUp },
    { id: 'comissoes' as TabType, label: 'Comissões', icon: Users },
    { id: 'fornecedores' as TabType, label: 'Pagamentos Fornecedores', icon: Truck },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <FileText className="w-8 h-8 text-primary-600" />
        <h1 className="text-2xl font-bold text-gray-900">Relatórios</h1>
      </div>

      {/* Resumo do dia */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card p-4">
          <p className="text-sm text-gray-600">Vendas Hoje</p>
          <p className="text-2xl font-bold text-green-600">
            {formatCurrency(dailyReport?.totals?.valor_liquido || 0)}
          </p>
          <p className="text-xs text-gray-500">{dailyReport?.totals?.total_vendas || 0} vendas</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-gray-600">Dinheiro</p>
          <p className="text-xl font-semibold">{formatCurrency(dailyReport?.totals?.total_dinheiro || 0)}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-gray-600">Pix</p>
          <p className="text-xl font-semibold">{formatCurrency(dailyReport?.totals?.total_pix || 0)}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-gray-600">Cartão</p>
          <p className="text-xl font-semibold">
            {formatCurrency((dailyReport?.totals?.total_credito || 0) + (dailyReport?.totals?.total_debito || 0))}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Filtros */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-5 h-5 text-gray-500" />
          <h3 className="font-medium text-gray-900">Filtros</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Input
            label="Data Inicial"
            type="date"
            value={inicio}
            onChange={(e) => setInicio(e.target.value)}
          />
          <Input
            label="Data Final"
            type="date"
            value={fim}
            onChange={(e) => setFim(e.target.value)}
          />

          {activeTab === 'comissoes' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vendedora</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                value={vendedoraId}
                onChange={(e) => setVendedoraId(e.target.value ? Number(e.target.value) : '')}
              >
                <option value="">Todas</option>
                {sellers?.map((s: Seller) => (
                  <option key={s.id} value={s.id}>{s.nome}</option>
                ))}
              </select>
            </div>
          )}

          {activeTab === 'fornecedores' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fornecedor</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                value={fornecedorId}
                onChange={(e) => setFornecedorId(e.target.value ? Number(e.target.value) : '')}
              >
                <option value="">Todos</option>
                {suppliers?.map((s: { id: number; nome: string }) => (
                  <option key={s.id} value={s.id}>{s.nome}</option>
                ))}
              </select>
            </div>
          )}

          {(activeTab === 'comissoes' || activeTab === 'fornecedores') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                value={statusPagamento}
                onChange={(e) => setStatusPagamento(e.target.value as 'todos' | 'pago' | 'pendente')}
              >
                <option value="todos">Todos</option>
                <option value="pago">Pago</option>
                <option value="pendente">Pendente</option>
              </select>
            </div>
          )}

          <div className="flex items-end">
            <Button onClick={handleFilter} className="w-full">
              <Calendar className="w-4 h-4 mr-2" />
              Filtrar
            </Button>
          </div>
        </div>
      </div>

      {/* Conteúdo das abas */}
      {activeTab === 'vendas' && (
        <div className="space-y-6">
          {/* Resumo do período */}
          {salesReport && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="card p-6">
                <h3 className="font-semibold text-gray-900 mb-4">Resumo do Período</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total de Vendas</span>
                    <span className="font-medium">{salesReport.totals?.total_vendas || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Valor Bruto</span>
                    <span className="font-medium">{formatCurrency(salesReport.totals?.valor_bruto || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Descontos</span>
                    <span className="font-medium text-red-600">-{formatCurrency(salesReport.totals?.total_descontos || 0)}</span>
                  </div>
                  <div className="flex justify-between pt-3 border-t">
                    <span className="font-semibold">Valor Líquido</span>
                    <span className="font-bold text-green-600">{formatCurrency(salesReport.totals?.valor_liquido || 0)}</span>
                  </div>
                </div>
              </div>

              <div className="card p-6">
                <h3 className="font-semibold text-gray-900 mb-4">Por Forma de Pagamento</h3>
                <div className="space-y-3">
                  {salesReport.byPaymentMethod?.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">Nenhuma venda no período</p>
                  ) : (
                    salesReport.byPaymentMethod?.map((item: { forma_pagamento: PaymentMethod; quantidade: number; total: number }) => (
                      <div key={item.forma_pagamento} className="flex justify-between">
                        <span className="text-gray-600">{paymentLabels[item.forma_pagamento]}</span>
                        <span className="font-medium">{formatCurrency(item.total)} ({item.quantidade})</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Vendas por vendedora */}
          {salesReport?.bySeller && salesReport.bySeller.length > 0 && (
            <div className="card p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Vendas por Vendedora</h3>
              <div className="space-y-2">
                {salesReport.bySeller.map((item: { vendedora: string; quantidade: number; total: number }, index: number) => (
                  <div key={index} className="flex justify-between items-center py-2 border-b last:border-0">
                    <span className="text-gray-700">{item.vendedora || 'Sem vendedora'}</span>
                    <div className="text-right">
                      <span className="font-semibold">{formatCurrency(item.total)}</span>
                      <span className="text-sm text-gray-500 ml-2">({item.quantidade} vendas)</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Lista de vendas do dia */}
          <div className="card">
            <div className="p-4 border-b">
              <h3 className="font-semibold text-gray-900">Vendas de Hoje</h3>
            </div>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Código</TableHeader>
                  <TableHeader>Hora</TableHeader>
                  <TableHeader>Vendedora</TableHeader>
                  <TableHeader>Itens</TableHeader>
                  <TableHeader>Pagamento</TableHeader>
                  <TableHeader className="text-right">Valor</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {!dailyReport?.sales || dailyReport.sales.length === 0 ? (
                  <TableEmpty message="Nenhuma venda hoje" />
                ) : (
                  dailyReport.sales.map((sale: Sale) => (
                    <TableRow key={sale.id}>
                      <TableCell className="font-mono">{sale.codigo}</TableCell>
                      <TableCell>{new Date(sale.data_venda).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</TableCell>
                      <TableCell>{sale.vendedora_nome || '-'}</TableCell>
                      <TableCell>{sale.total_itens}</TableCell>
                      <TableCell>{paymentLabels[sale.forma_pagamento]}</TableCell>
                      <TableCell className="text-right font-semibold text-green-600">
                        {formatCurrency(sale.valor_final)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {activeTab === 'comissoes' && (
        <div className="space-y-6">
          {/* Resumo de comissões */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card p-4">
              <p className="text-sm text-gray-600">Total em Comissões</p>
              <p className="text-2xl font-bold text-primary-600">
                {formatCurrency(
                  commissionReport?.reduce((acc, r) => acc + (r.totals?.total_comissao || 0), 0) || 0
                )}
              </p>
            </div>
            <div className="card p-4">
              <p className="text-sm text-gray-600">Comissões Pagas</p>
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(
                  commissionReport?.reduce((acc, r) => acc + (r.totals?.total_pago || 0), 0) || 0
                )}
              </p>
            </div>
            <div className="card p-4">
              <p className="text-sm text-gray-600">Comissões Pendentes</p>
              <p className="text-2xl font-bold text-orange-600">
                {formatCurrency(
                  commissionReport?.reduce((acc, r) => acc + (r.totals?.total_pendente || 0), 0) || 0
                )}
              </p>
            </div>
          </div>

          {/* Lista de comissões por vendedora */}
          <div className="card">
            <div className="p-4 border-b">
              <h3 className="font-semibold text-gray-900">Comissões por Vendedora</h3>
            </div>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Vendedora</TableHeader>
                  <TableHeader>Qtd. Vendas</TableHeader>
                  <TableHeader className="text-right">Total Comissões</TableHeader>
                  <TableHeader className="text-right">Pago</TableHeader>
                  <TableHeader className="text-right">Pendente</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {!commissionReport || commissionReport.length === 0 ? (
                  <TableEmpty message="Nenhuma comissão no período" />
                ) : (
                  commissionReport
                    .filter((r) => (r.totals?.total_comissao || 0) > 0)
                    .map((report) => (
                      <TableRow key={report.seller.id}>
                        <TableCell className="font-medium">{report.seller.nome}</TableCell>
                        <TableCell>{report.totals?.total_vendas || 0}</TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatCurrency(report.totals?.total_comissao || 0)}
                        </TableCell>
                        <TableCell className="text-right text-green-600">
                          {formatCurrency(report.totals?.total_pago || 0)}
                        </TableCell>
                        <TableCell className="text-right text-orange-600">
                          {formatCurrency(report.totals?.total_pendente || 0)}
                        </TableCell>
                      </TableRow>
                    ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {activeTab === 'fornecedores' && (
        <div className="space-y-6">
          {/* Resumo de pagamentos */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card p-4">
              <p className="text-sm text-gray-600">Total a Pagar</p>
              <p className="text-2xl font-bold text-primary-600">
                {formatCurrency(paymentReport?.totals?.total_a_pagar || 0)}
              </p>
              <p className="text-xs text-gray-500">{paymentReport?.totals?.total_listas || 0} listas</p>
            </div>
            <div className="card p-4">
              <p className="text-sm text-gray-600">Total Pago</p>
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(paymentReport?.totals?.total_pago || 0)}
              </p>
              <p className="text-xs text-gray-500">{paymentReport?.totals?.listas_pagas || 0} listas</p>
            </div>
            <div className="card p-4">
              <p className="text-sm text-gray-600">Pendente</p>
              <p className="text-2xl font-bold text-orange-600">
                {formatCurrency(paymentReport?.totals?.total_pendente || 0)}
              </p>
              <p className="text-xs text-gray-500">{paymentReport?.totals?.listas_pendentes || 0} listas</p>
            </div>
          </div>

          {/* Lista de pagamentos por fornecedor */}
          <div className="card">
            <div className="p-4 border-b">
              <h3 className="font-semibold text-gray-900">Pagamentos por Fornecedor</h3>
            </div>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Fornecedor</TableHeader>
                  <TableHeader>Lista</TableHeader>
                  <TableHeader>Peças Vendidas</TableHeader>
                  <TableHeader className="text-right">Valor a Pagar</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader>Data Pagamento</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {!paymentReport?.lists || paymentReport.lists.length === 0 ? (
                  <TableEmpty message="Nenhum pagamento no período" />
                ) : (
                  paymentReport.lists.map((item: {
                    id: number;
                    codigo: string;
                    fornecedor_nome: string;
                    pecas_vendidas: number;
                    valor_a_pagar: number;
                    pago: boolean;
                    data_pagamento: string | null;
                  }) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.fornecedor_nome}</TableCell>
                      <TableCell className="font-mono">{item.codigo}</TableCell>
                      <TableCell>{item.pecas_vendidas || 0}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(item.valor_a_pagar || 0)}
                      </TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          item.pago
                            ? 'bg-green-100 text-green-700'
                            : 'bg-orange-100 text-orange-700'
                        }`}>
                          {item.pago ? 'Pago' : 'Pendente'}
                        </span>
                      </TableCell>
                      <TableCell>
                        {item.data_pagamento
                          ? new Date(item.data_pagamento).toLocaleDateString('pt-BR')
                          : '-'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
