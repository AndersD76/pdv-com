import { useQuery } from '@tanstack/react-query';
import { Package, DollarSign, Clock } from 'lucide-react';
import { dashboardApi } from '../../services/api';

export function Header() {
  const { data: stats } = useQuery({
    queryKey: ['quickStats'],
    queryFn: dashboardApi.getQuickStats,
    refetchInterval: 30000, // Atualiza a cada 30 segundos
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value || 0);
  };

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      <div className="flex items-center gap-6">
        {/* Stats rápidas */}
        <div className="flex items-center gap-2 text-sm">
          <Package className="w-4 h-4 text-primary-600" />
          <span className="text-gray-600">Peças disponíveis:</span>
          <span className="font-semibold text-gray-900">
            {stats?.pecas_disponiveis || 0}
          </span>
        </div>

        <div className="h-6 w-px bg-gray-200" />

        <div className="flex items-center gap-2 text-sm">
          <DollarSign className="w-4 h-4 text-green-600" />
          <span className="text-gray-600">Vendas hoje:</span>
          <span className="font-semibold text-green-600">
            {formatCurrency(stats?.vendas_hoje || 0)}
          </span>
        </div>

        <div className="h-6 w-px bg-gray-200" />

        <div className="flex items-center gap-2 text-sm">
          <Clock className="w-4 h-4 text-orange-600" />
          <span className="text-gray-600">Listas pendentes:</span>
          <span className="font-semibold text-orange-600">
            {stats?.listas_pendentes || 0}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-600">
          {new Date().toLocaleDateString('pt-BR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </span>
      </div>
    </header>
  );
}
