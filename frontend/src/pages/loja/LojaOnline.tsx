import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Globe, Copy, ExternalLink, CheckCircle2, AlertCircle, Sparkles, CreditCard } from 'lucide-react';
import toast from 'react-hot-toast';
import { lojaApi } from '../../services/api';
import { Button, Input } from '../../components/ui';
import type { StoreSettings } from '../../types';

// Campo de valor em reais: aceita vírgula ou ponto e não força zeros à esquerda,
// algo que o <input type="number"> nativo faz mal com value controlado.
const lerValor = (texto: string) => Number(texto.replace(',', '.')) || 0;

function MoneyInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const [texto, setTexto] = useState(value ? String(value).replace('.', ',') : '');

  useEffect(() => {
    setTexto((atual) => (lerValor(atual) === value ? atual : value ? String(value).replace('.', ',') : ''));
  }, [value]);

  return (
    <Input
      label={label}
      type="text"
      inputMode="decimal"
      placeholder="0,00"
      value={texto}
      onChange={(e) => {
        const bruto = e.target.value.replace(/[^\d,]/g, '');
        setTexto(bruto);
        onChange(lerValor(bruto));
      }}
    />
  );
}

const limitarMinutos = (minutos: number) => (minutos ? Math.min(120, Math.max(10, minutos)) : 30);

function MinutosInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const [texto, setTexto] = useState(String(value));

  useEffect(() => {
    setTexto((atual) => (Number(atual) === value ? atual : String(value)));
  }, [value]);

  return (
    <Input
      label={label}
      type="text"
      inputMode="numeric"
      value={texto}
      onChange={(e) => {
        const digitos = e.target.value.replace(/\D/g, '').slice(0, 3);
        setTexto(digitos);
        onChange(Number(digitos));
      }}
      onBlur={() => onChange(limitarMinutos(Number(texto)))}
    />
  );
}

// Pagamento (InfinitePay) e formas de entrega da compra online
function CheckoutSettings() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ['loja-config'], queryFn: lojaApi.getConfig });
  const [form, setForm] = useState<StoreSettings | null>(null);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const salvar = useMutation({
    mutationFn: (settings: StoreSettings) => lojaApi.saveConfig(settings),
    onSuccess: (saved) => {
      toast.success(saved.checkout_ativo ? 'Configuração salva. Compra online ativa!' : 'Configuração salva.');
      queryClient.invalidateQueries({ queryKey: ['loja-config'] });
      queryClient.invalidateQueries({ queryKey: ['loja-status'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!form) return <div className="animate-pulse h-64 bg-gray-200 rounded-xl" />;

  const set = <K extends keyof StoreSettings>(key: K, value: StoreSettings[K]) => setForm({ ...form, [key]: value });
  const check = (key: 'retirada_ativa' | 'entrega_local_ativa' | 'correios_ativo', label: string) => (
    <label className="flex items-center gap-2 font-medium text-gray-900">
      <input type="checkbox" checked={form[key]} onChange={(e) => set(key, e.target.checked)} className="w-4 h-4" />
      {label}
    </label>
  );

  return (
    <form
      className="card p-6 space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        salvar.mutate({ ...form, reserva_minutos: limitarMinutos(form.reserva_minutos) });
      }}
    >
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <CreditCard className="w-5 h-5" /> Compra online (pagamento automático)
        </h2>
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${data?.checkout_ativo ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
          {data?.checkout_ativo ? 'Ativa' : 'Desativada'}
        </span>
      </div>

      <div>
        <Input
          label="InfiniteTag da loja (usuário no app InfinitePay, sem o $)"
          value={form.infinitepay_handle}
          onChange={(e) => set('infinitepay_handle', e.target.value.replace(/^\$/, '').trim())}
          placeholder="ex.: apegadesapega"
        />
        <p className="text-xs text-gray-500 mt-1">O cliente paga com Pix ou cartão (até 12x) na tela da InfinitePay, e o dinheiro cai na conta da loja.</p>
      </div>

      <div className="space-y-2 border-t pt-4">
        {check('retirada_ativa', 'Retirada na loja (grátis)')}
        {form.retirada_ativa && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-6">
            <Input label="Endereço de retirada" value={form.retirada_endereco} onChange={(e) => set('retirada_endereco', e.target.value)} />
            <Input label="Horário" value={form.retirada_horario} onChange={(e) => set('retirada_horario', e.target.value)} placeholder="ex.: seg a sex, 9h às 18h" />
          </div>
        )}
      </div>

      <div className="space-y-2 border-t pt-4">
        {check('entrega_local_ativa', 'Entrega local (taxa fixa)')}
        {form.entrega_local_ativa && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-6">
            <Input label="Cidade atendida" value={form.entrega_local_cidade} onChange={(e) => set('entrega_local_cidade', e.target.value)} />
            <MoneyInput label="Taxa de entrega (R$)" value={form.entrega_local_taxa} onChange={(v) => set('entrega_local_taxa', v)} />
          </div>
        )}
      </div>

      <div className="space-y-2 border-t pt-4">
        {check('correios_ativo', 'Envio pelos Correios (para todo o Brasil)')}
        {form.correios_ativo && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-6">
            <MoneyInput
              label="Frete fixo (R$) — deixe 0 para combinar por WhatsApp"
              value={form.correios_taxa}
              onChange={(v) => set('correios_taxa', v)}
            />
          </div>
        )}
      </div>

      <div className="border-t pt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <MinutosInput
          label="Reserva da peça enquanto o cliente paga (minutos, de 10 a 120)"
          value={form.reserva_minutos}
          onChange={(v) => set('reserva_minutos', v)}
        />
      </div>

      <Button type="submit" isLoading={salvar.isPending}>Salvar configuração</Button>
    </form>
  );
}

function StatusItem({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      {ok
        ? <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
        : <AlertCircle className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />}
      <span>{children}</span>
    </li>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success('Copiado!');
    } catch {
      toast.error('Não foi possível copiar');
    }
  };

  return (
    <div>
      <p className="text-sm text-gray-600 mb-1">{label}</p>
      <div className="flex gap-2">
        <input readOnly value={value} className="input font-mono text-sm flex-1" onFocus={(e) => e.target.select()} />
        <button type="button" onClick={copy} className="px-3 rounded-lg border hover:bg-gray-50" title="Copiar">
          <Copy className="w-4 h-4" />
        </button>
        <a href={value} target="_blank" rel="noopener noreferrer" className="px-3 rounded-lg border hover:bg-gray-50 flex items-center" title="Abrir">
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
}

export default function LojaOnline() {
  const { data: status, isLoading } = useQuery({
    queryKey: ['loja-status'],
    queryFn: lojaApi.status,
  });

  if (isLoading || !status) {
    return <div className="animate-pulse h-96 bg-gray-200 rounded-xl" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Globe className="w-8 h-8 text-primary-600" />
        <h1 className="text-2xl font-bold text-gray-900">Loja Online e Instagram</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-4">
          <p className="text-sm text-gray-600">Peças publicadas</p>
          <p className="text-2xl font-bold text-primary-600">{status.pecas_publicadas}</p>
          <p className="text-xs text-gray-500">loja digital, disponíveis e com foto</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-gray-600">Peças digitais sem foto</p>
          <p className={`text-2xl font-bold ${status.pecas_sem_foto > 0 ? 'text-orange-600' : 'text-gray-900'}`}>
            {status.pecas_sem_foto}
          </p>
          <p className="text-xs text-gray-500">não aparecem na loja até ter foto</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-gray-600 flex items-center gap-1"><Sparkles className="w-4 h-4" /> Cadastro por IA</p>
          <p className={`text-2xl font-bold ${status.ia_configurada ? 'text-green-600' : 'text-orange-600'}`}>
            {status.ia_configurada ? 'Ativo' : 'Desativado'}
          </p>
          <p className="text-xs text-gray-500">{status.ia_configurada ? 'fotografe a peça no cadastro' : 'defina ANTHROPIC_API_KEY no servidor'}</p>
        </div>
      </div>

      <CheckoutSettings />

      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">Links</h2>
        <CopyField label="Vitrine da loja (link para a bio do Instagram)" value={status.vitrine_url} />
        <CopyField label="Feed do catálogo (para o Commerce Manager do Meta)" value={status.feed_url} />
      </div>

      <div className="card p-6 space-y-3">
        <h2 className="font-semibold text-gray-900">Configuração</h2>
        <ul className="space-y-2">
          <StatusItem ok={status.ia_configurada}>
            Chave da IA (<code>ANTHROPIC_API_KEY</code>)
          </StatusItem>
          <StatusItem ok={Boolean(status.instagram)}>
            Instagram da loja para o botão "Comprar" (<code>LOJA_INSTAGRAM</code>){status.instagram ? `: @${status.instagram}` : ''}
          </StatusItem>
          <StatusItem ok={Boolean(status.whatsapp)}>
            WhatsApp da loja, opcional (<code>LOJA_WHATSAPP</code>, ex.: 5554999999999)
          </StatusItem>
          <StatusItem ok={status.url_publica_configurada}>
            Endereço público fixo (<code>PUBLIC_URL</code>), recomendado ao usar domínio próprio
          </StatusItem>
          <StatusItem ok={status.dominio_verificacao_configurado}>
            Verificação de domínio do Meta (<code>FACEBOOK_DOMAIN_VERIFICATION</code>)
          </StatusItem>
        </ul>
      </div>

      <div className="card p-6">
        <h2 className="font-semibold text-gray-900 mb-3">Como conectar a loja do Instagram</h2>
        <ol className="list-decimal pl-5 space-y-2 text-sm text-gray-700">
          <li>A conta do Instagram precisa ser <strong>profissional</strong> e estar ligada a uma Página do Facebook e a um portfólio empresarial do Meta (business.facebook.com).</li>
          <li>No <strong>Commerce Manager</strong> (business.facebook.com/commerce), crie um catálogo do tipo <em>E-commerce</em>.</li>
          <li>Em <em>Fontes de dados</em>, adicione um <strong>feed de dados programado</strong> com o link do feed acima, atualização a cada hora e moeda BRL.</li>
          <li>Verifique o domínio da loja no portfólio empresarial (Configurações da empresa → Segurança da marca → Domínios). Copie o código da meta tag para a variável <code>FACEBOOK_DOMAIN_VERIFICATION</code> no Railway. O Meta exige um domínio próprio (ex.: loja.seubrecho.com.br) apontado para o Railway, configurado também em <code>PUBLIC_URL</code>.</li>
          <li>No Instagram, ative as <strong>Compras</strong> (Configurações → Empresa → Compras no Instagram) usando esse catálogo e aguarde a análise do Meta.</li>
          <li>Depois de aprovado, marque as peças nos posts e stories. Peças vendidas no PDV saem do Instagram na próxima atualização do feed.</li>
        </ol>
      </div>
    </div>
  );
}
