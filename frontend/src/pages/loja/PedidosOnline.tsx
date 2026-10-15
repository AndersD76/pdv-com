import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShoppingBag, MessageCircle, PackageCheck, Truck, XCircle, ExternalLink, ImageOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { pedidosApi, productPhotoUrl } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui';
import { formatCurrency, formatDateTime } from '../../utils/format';
import type { OnlineOrder, OnlineOrderStatus, DeliveryMethod } from '../../types';

const FILTROS: Array<{ id: string; label: string; status: string }> = [
  { id: 'separar', label: 'Para separar', status: 'PAGO,PAGO_SEM_ESTOQUE' },
  { id: 'separados', label: 'Separados', status: 'SEPARADO' },
  { id: 'entregues', label: 'Entregues', status: 'ENTREGUE' },
  { id: 'aguardando', label: 'Aguardando pagamento', status: 'AGUARDANDO_PAGAMENTO' },
  { id: 'todos', label: 'Todos', status: '' },
];

const statusInfo: Record<OnlineOrderStatus, { label: string; className: string }> = {
  AGUARDANDO_PAGAMENTO: { label: 'Aguardando pagamento', className: 'bg-gray-100 text-gray-700' },
  PAGO: { label: 'Pago · separar', className: 'bg-green-100 text-green-800' },
  SEPARADO: { label: 'Separado', className: 'bg-blue-100 text-blue-800' },
  ENTREGUE: { label: 'Entregue', className: 'bg-gray-100 text-gray-600' },
  CANCELADO: { label: 'Cancelado', className: 'bg-gray-100 text-gray-500' },
  PAGO_SEM_ESTOQUE: { label: 'Pago sem estoque · estornar', className: 'bg-red-100 text-red-700' },
};

const entregaLabels: Record<DeliveryMethod, string> = {
  RETIRADA: 'Retirada na loja',
  ENTREGA_LOCAL: 'Entrega local',
  CORREIOS: 'Correios',
};

function whatsappUrl(order: OnlineOrder) {
  const digits = order.cliente_telefone.replace(/\D/g, '');
  const phone = digits.startsWith('55') ? digits : `55${digits}`;
  const texto = `Olá, ${order.cliente_nome.split(' ')[0]}! Aqui é da loja, sobre o seu pedido ${order.codigo}.`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(texto)}`;
}

export default function PedidosOnline() {
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();
  const [filtro, setFiltro] = useState('separar');
  const status = FILTROS.find((f) => f.id === filtro)!.status;

  const { data: pedidos, isLoading } = useQuery({
    queryKey: ['pedidos', status],
    queryFn: () => pedidosApi.getAll(status || undefined),
    refetchInterval: 20_000,
  });

  const atualizar = useMutation({
    mutationFn: ({ id, novo }: { id: number; novo: 'SEPARADO' | 'ENTREGUE' | 'CANCELADO' }) => pedidosApi.updateStatus(id, novo),
    onSuccess: (pedido) => {
      toast.success(`Pedido ${pedido.codigo}: ${statusInfo[pedido.status].label}`);
      queryClient.invalidateQueries({ queryKey: ['pedidos'] });
      queryClient.invalidateQueries({ queryKey: ['pedidos-resumo'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ShoppingBag className="w-8 h-8 text-primary-600" />
        <h1 className="text-2xl font-bold text-gray-900">Pedidos Online</h1>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFiltro(f.id)}
            className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
              filtro === f.id ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="animate-pulse h-40 bg-gray-200 rounded-xl" />
      ) : !pedidos || pedidos.length === 0 ? (
        <div className="card p-10 text-center text-gray-500">Nenhum pedido aqui.</div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {pedidos.map((pedido) => {
            const info = pedido.expirado
              ? { label: 'Reserva expirada', className: 'bg-gray-100 text-gray-500' }
              : statusInfo[pedido.status];
            const foto = productPhotoUrl({ id: pedido.product_id, foto_atualizada_em: pedido.foto_atualizada_em });
            return (
              <div key={pedido.id} className={`card p-4 space-y-3 ${pedido.status === 'PAGO' ? 'ring-2 ring-green-500' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-lg">Pedido {pedido.codigo}</p>
                    <p className="text-xs text-gray-500">
                      {pedido.pago_em ? `Pago em ${formatDateTime(pedido.pago_em)}` : `Criado em ${formatDateTime(pedido.created_at)}`}
                    </p>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${info.className}`}>{info.label}</span>
                </div>

                <div className="flex gap-3">
                  {foto ? (
                    <img src={foto} alt="" className="w-16 h-16 rounded-lg object-cover border" />
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center"><ImageOff className="w-5 h-5 text-gray-400" /></div>
                  )}
                  <div className="text-sm">
                    <p className="font-medium">{pedido.titulo_loja || pedido.descricao}</p>
                    <p className="text-gray-500 font-mono">{pedido.codigo_barras}{pedido.tamanho ? ` · Tam. ${pedido.tamanho}` : ''}</p>
                    <p>
                      {formatCurrency(pedido.valor_total)}
                      {pedido.valor_frete > 0 && <span className="text-gray-500"> (frete {formatCurrency(pedido.valor_frete)})</span>}
                      {pedido.forma_pagamento && (
                        <span className="text-gray-500"> · {pedido.forma_pagamento === 'PIX' ? 'Pix' : `Cartão ${pedido.parcelas ?? 1}x`}</span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="text-sm bg-gray-50 rounded-lg p-3 space-y-1">
                  <p><strong>{pedido.cliente_nome}</strong> · {pedido.cliente_telefone}</p>
                  <p className="flex items-center gap-1">
                    <Truck className="w-4 h-4 text-gray-500" /> {entregaLabels[pedido.entrega]}
                  </p>
                  {pedido.entrega !== 'RETIRADA' && (
                    <p className="text-gray-600">
                      {pedido.endereco}, {pedido.numero}{pedido.complemento ? ` - ${pedido.complemento}` : ''} · {pedido.bairro} · {pedido.cidade}/{pedido.uf} · CEP {pedido.cep}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <a href={whatsappUrl(pedido)} target="_blank" rel="noopener noreferrer">
                    <Button variant="secondary" size="sm"><MessageCircle className="w-4 h-4 mr-1" /> WhatsApp do cliente</Button>
                  </a>
                  {pedido.receipt_url && (
                    <a href={pedido.receipt_url} target="_blank" rel="noopener noreferrer">
                      <Button variant="ghost" size="sm"><ExternalLink className="w-4 h-4 mr-1" /> Comprovante</Button>
                    </a>
                  )}
                  {pedido.status === 'PAGO' && (
                    <Button size="sm" onClick={() => atualizar.mutate({ id: pedido.id, novo: 'SEPARADO' })} isLoading={atualizar.isPending}>
                      <PackageCheck className="w-4 h-4 mr-1" /> Marcar como separado
                    </Button>
                  )}
                  {(pedido.status === 'PAGO' || pedido.status === 'SEPARADO') && (
                    <Button variant="success" size="sm" onClick={() => atualizar.mutate({ id: pedido.id, novo: 'ENTREGUE' })} isLoading={atualizar.isPending}>
                      <Truck className="w-4 h-4 mr-1" /> {pedido.entrega === 'CORREIOS' ? 'Marcar como enviado' : 'Marcar como entregue'}
                    </Button>
                  )}
                  {isAdmin && (pedido.status === 'PAGO_SEM_ESTOQUE' || (pedido.status === 'AGUARDANDO_PAGAMENTO' && !pedido.expirado)) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const msg = pedido.status === 'PAGO_SEM_ESTOQUE'
                          ? 'Confirme que o valor já foi devolvido ao cliente pela InfinitePay. Cancelar o pedido?'
                          : 'Cancelar o pedido e liberar a peça?';
                        if (confirm(msg)) atualizar.mutate({ id: pedido.id, novo: 'CANCELADO' });
                      }}
                    >
                      <XCircle className="w-4 h-4 mr-1 text-red-500" /> Cancelar
                    </Button>
                  )}
                </div>
                {pedido.status === 'PAGO_SEM_ESTOQUE' && (
                  <p className="text-xs text-red-700 bg-red-50 rounded p-2">
                    O cliente pagou depois que a peça foi vendida. Devolva o valor pelo app da InfinitePay e depois cancele o pedido.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
