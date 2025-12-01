import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search, Eye, Tags } from 'lucide-react';
import { consignmentsApi, suppliersApi } from '../../services/api';
import { Button, Input, Select, Table, TableHead, TableBody, TableRow, TableHeader, TableCell, TableEmpty, TableLoading } from '../../components/ui';
import type { ConsignmentList, ListStatus, Supplier } from '../../types';

const statusLabels: Record<ListStatus, string> = {
  DIGITADA: 'Digitada',
  EXPORTADA: 'Exportada',
  FINALIZADA: 'Finalizada',
};

const statusColors: Record<ListStatus, string> = {
  DIGITADA: 'bg-yellow-100 text-yellow-800',
  EXPORTADA: 'bg-blue-100 text-blue-800',
  FINALIZADA: 'bg-green-100 text-green-800',
};

export default function Consignacoes() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [fornecedorFilter, setFornecedorFilter] = useState('');

  const { data: lists, isLoading } = useQuery({
    queryKey: ['consignments', { status: statusFilter, fornecedor_id: fornecedorFilter, search }],
    queryFn: () => consignmentsApi.getAll({
      status: statusFilter || undefined,
      fornecedor_id: fornecedorFilter ? Number(fornecedorFilter) : undefined,
      search: search || undefined,
    }),
  });

  const { data: suppliers } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => suppliersApi.getAll(),
  });

  const formatDate = (date: string) => new Date(date).toLocaleDateString('pt-BR');
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Listas de Consignação</h1>
        <Link to="/consignacoes/nova">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Nova Lista
          </Button>
        </Link>
      </div>

      {/* Filtros */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-64">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Buscar por código ou fornecedor..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <Select
            options={[
              { value: '', label: 'Todos os status' },
              { value: 'DIGITADA', label: 'Digitada' },
              { value: 'EXPORTADA', label: 'Exportada' },
              { value: 'FINALIZADA', label: 'Finalizada' },
            ]}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-48"
          />
          <Select
            options={[
              { value: '', label: 'Todos os fornecedores' },
              ...(suppliers?.map((s: Supplier) => ({ value: s.id, label: s.nome })) || []),
            ]}
            value={fornecedorFilter}
            onChange={(e) => setFornecedorFilter(e.target.value)}
            className="w-56"
          />
        </div>
      </div>

      {/* Tabela */}
      <div className="card">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Código</TableHeader>
              <TableHeader>Fornecedor</TableHeader>
              <TableHeader>Recebimento</TableHeader>
              <TableHeader>Prazo</TableHeader>
              <TableHeader className="text-center">Peças</TableHeader>
              <TableHeader className="text-center">Vendidas</TableHeader>
              <TableHeader className="text-right">A Pagar</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader className="w-32">Ações</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableLoading cols={9} />
            ) : lists?.length === 0 ? (
              <TableEmpty message="Nenhuma lista encontrada" />
            ) : (
              lists?.map((list: ConsignmentList) => (
                <TableRow
                  key={list.id}
                  onClick={() => navigate(`/consignacoes/${list.id}`)}
                  className="cursor-pointer"
                >
                  <TableCell className="font-mono font-medium">{list.codigo}</TableCell>
                  <TableCell>{list.fornecedor_nome}</TableCell>
                  <TableCell>{formatDate(list.data_recebimento)}</TableCell>
                  <TableCell>
                    <span className={new Date(list.prazo_retirada) < new Date() ? 'text-red-600 font-medium' : ''}>
                      {formatDate(list.prazo_retirada)}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">{list.total_pecas || 0}</TableCell>
                  <TableCell className="text-center text-green-600 font-medium">
                    {list.pecas_vendidas || 0}
                  </TableCell>
                  <TableCell className="text-right font-medium text-orange-600">
                    {formatCurrency(list.valor_a_pagar || 0)}
                  </TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusColors[list.status]}`}>
                      {statusLabels[list.status]}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <Link to={`/consignacoes/${list.id}`}>
                        <Button variant="ghost" size="sm">
                          <Eye className="w-4 h-4" />
                        </Button>
                      </Link>
                      <Link to={`/etiquetas?lista=${list.id}`}>
                        <Button variant="ghost" size="sm">
                          <Tags className="w-4 h-4" />
                        </Button>
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
