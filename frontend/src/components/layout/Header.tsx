import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Package, DollarSign, Clock, ShoppingBag } from 'lucide-react';
import toast from 'react-hot-toast';
import { dashboardApi, pedidosApi } from '../../services/api';

// Dois bipes curtos (sem arquivo de áudio); o navegador só toca depois de algum clique na página
function tocarAlerta() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    [0, 0.3].forEach((inicio) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.2;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + inicio);
      osc.stop(ctx.currentTime + inicio + 0.2);
    });
  } catch {
    // sem áudio disponível
  }
}

export function Header() {
  const { data: stats } = useQuery({
    queryKey: ['quickStats'],
    queryFn: dashboardApi.getQuickStats,
    refetchInterval: 30000, // Atualiza a cada 30 segundos
  });

  // Pedidos online pagos aguardando separação (alerta com som quando chega um novo)
  const { data: pedidos } = useQuery({
    queryKey: ['pedidos-resumo'],
    queryFn: pedidosApi.resumo,
    refetchInterval: 20000,
  });
  const anterior = useRef<number | null>(null);
  useEffect(() => {
    if (!pedidos) return;
    if (anterior.current !== null && pedidos.para_separar > anterior.current) {
      tocarAlerta();
      toast.success('Novo pedido online pago! Separe a peça.', { duration: 8000 });
    }
    anterior.current = pedidos.para_separar;
  }, [pedidos]);
  const alertas = (pedidos?.para_separar ?? 0) + (pedidos?.sem_estoque ?? 0);

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
        {alertas > 0 && (
          <Link
            to="/pedidos-online"
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-600 text-white text-sm font-medium animate-pulse hover:animate-none"
          >
            <ShoppingBag className="w-4 h-4" />
            {alertas} pedido{alertas > 1 ? 's' : ''} para separar
          </Link>
        )}
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
