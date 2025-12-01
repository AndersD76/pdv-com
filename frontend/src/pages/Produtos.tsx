import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Package } from 'lucide-react';
import { productsApi } from '../services/api';
import { Input, Select, Table, TableHead, TableBody, TableRow, TableHeader, TableCell, TableEmpty, TableLoading } from '../components/ui';
import type { Product, ProductStatus } from '../types';

const statusColors: Record<ProductStatus, string> = {
  DISPONIVEL: 'bg-green-100 text-green-800',
  VENDIDO: 'bg-blue-100 text-blue-800',
  DEVOLVIDO: 'bg-gray-100 text-gray-800',
};

const statusLabels: Record<ProductStatus, string> = {
  DISPONIVEL: 'Disponível',
  VENDIDO: 'Vendido',
  DEVOLVIDO: 'Devolvido',
};

export default function Produtos() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const { data: products, isLoading } = useQuery({
    queryKey: ['products', { search, status: statusFilter }],
    queryFn: () => productsApi.getAll({ search: search || undefined, status: statusFilter || undefined }),
  });

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Package className="w-8 h-8 text-primary-600" />
        <h1 className="text-2xl font-bold text-gray-900">Produtos</h1>
      </div>

      {/* Filtros */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-64">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Buscar por código, descrição ou marca..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <Select
            options={[
              { value: '', label: 'Todos os status' },
              { value: 'DISPONIVEL', label: 'Disponível' },
              { value: 'VENDIDO', label: 'Vendido' },
              { value: 'DEVOLVIDO', label: 'Devolvido' },
            ]}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-48"
          />
        </div>
      </div>

      {/* Tabela */}
      <div className="card">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Código</TableHeader>
              <TableHeader>Descrição</TableHeader>
              <TableHeader>Cor</TableHeader>
              <TableHeader>Marca</TableHeader>
              <TableHeader>Tamanho</TableHeader>
              <TableHeader>Lista</TableHeader>
              <TableHeader>Fornecedor</TableHeader>
              <TableHeader className="text-right">Valor</TableHeader>
              <TableHeader>Status</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableLoading cols={9} />
            ) : products?.length === 0 ? (
              <TableEmpty message="Nenhum produto encontrado" />
            ) : (
              products?.map((product: Product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-mono text-sm">{product.codigo_barras}</TableCell>
                  <TableCell className="font-medium">{product.descricao}</TableCell>
                  <TableCell>{product.cor || '-'}</TableCell>
                  <TableCell>{product.marca || '-'}</TableCell>
                  <TableCell>{product.tamanho || '-'}</TableCell>
                  <TableCell className="font-mono text-sm">{product.lista_codigo}</TableCell>
                  <TableCell>{product.fornecedor_nome}</TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(product.valor_venda)}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusColors[product.status]}`}>
                      {statusLabels[product.status]}
                    </span>
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
