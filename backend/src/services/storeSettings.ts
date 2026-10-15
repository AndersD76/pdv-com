import { z } from 'zod';
import { sql } from '../database.js';

// Configurações da loja online, guardadas na tabela store_settings (chave/valor)
export const storeSettingsSchema = z.object({
  // InfiniteTag da conta InfinitePay (sem o $), usada para gerar o pagamento
  infinitepay_handle: z.string().trim().max(60).regex(/^[a-zA-Z0-9._-]*$/, 'InfiniteTag inválida (sem $ e sem espaços)'),
  retirada_ativa: z.boolean(),
  retirada_endereco: z.string().trim().max(255),
  retirada_horario: z.string().trim().max(255),
  entrega_local_ativa: z.boolean(),
  entrega_local_taxa: z.number().min(0).max(1000),
  entrega_local_cidade: z.string().trim().max(100),
  correios_ativo: z.boolean(),
  correios_taxa: z.number().min(0).max(1000),
  // Por quanto tempo a peça fica reservada enquanto o cliente paga
  reserva_minutos: z.number().int().min(10).max(120)
});

export type StoreSettings = z.infer<typeof storeSettingsSchema>;

const DEFAULTS: StoreSettings = {
  infinitepay_handle: '',
  retirada_ativa: true,
  retirada_endereco: 'Rua Uruguai, 701 - Sala 01 - Passo Fundo - RS',
  retirada_horario: '',
  entrega_local_ativa: false,
  entrega_local_taxa: 0,
  entrega_local_cidade: 'Passo Fundo',
  correios_ativo: false,
  correios_taxa: 0,
  reserva_minutos: 30
};

let cache: { valor: StoreSettings; expira: number } | null = null;

export async function getStoreSettings(): Promise<StoreSettings> {
  if (cache && cache.expira > Date.now()) return cache.valor;

  const rows = await sql`SELECT chave, valor FROM store_settings` as Array<{ chave: string; valor: string | null }>;
  const salvo: Record<string, unknown> = {};
  for (const { chave, valor } of rows) {
    if (!(chave in DEFAULTS) || valor === null) continue;
    const padrao = DEFAULTS[chave as keyof StoreSettings];
    salvo[chave] = typeof padrao === 'boolean' ? valor === 'true' : typeof padrao === 'number' ? Number(valor) : valor;
  }

  const valor = { ...DEFAULTS, ...salvo } as StoreSettings;
  cache = { valor, expira: Date.now() + 30_000 };
  return valor;
}

export async function saveStoreSettings(settings: StoreSettings): Promise<StoreSettings> {
  const entries = Object.entries(settings);
  await sql.transaction(entries.map(([chave, valor]) => sql`
    INSERT INTO store_settings (chave, valor, updated_at) VALUES (${chave}, ${String(valor)}, CURRENT_TIMESTAMP)
    ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = CURRENT_TIMESTAMP
  `));
  cache = null;
  return getStoreSettings();
}

// Checkout liberado quando há InfiniteTag e pelo menos uma forma de entrega
export function checkoutAtivo(settings: StoreSettings): boolean {
  return Boolean(settings.infinitepay_handle)
    && (settings.retirada_ativa || settings.entrega_local_ativa || settings.correios_ativo);
}
