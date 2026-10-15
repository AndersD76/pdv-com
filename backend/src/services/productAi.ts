import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod/v4';
import { sql } from '../database.js';
import { HttpError, round2 } from '../utils/http.js';
import { ImageMime } from '../utils/images.js';

// Modelo usado na análise das fotos (pode ser trocado pela variável ANTHROPIC_MODEL)
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';

// Campos que a IA devolve; o formulário de cadastro é preenchido com eles para revisão
const analiseSchema = z.object({
  descricao: z.string().describe('Tipo da peça, curto (ex.: "Vestido Midi", "Calça Jeans")'),
  cor: z.string().nullable().describe('Cor ou estampa predominante'),
  marca: z.string().nullable().describe('Marca, somente se estiver legível na etiqueta ou na peça'),
  tamanho: z.string().nullable().describe('Tamanho, somente se estiver legível na etiqueta'),
  condicao: z.enum(['NOVA', 'SEMI_NOVA', 'USADA']),
  defeitos: z.string().nullable().describe('Defeitos visíveis; null se não houver'),
  valor_venda_sugerido: z.number().nullable().describe('Preço de venda sugerido em reais'),
  titulo_loja: z.string().describe('Título para a loja online, até 80 caracteres'),
  descricao_loja: z.string().describe('Texto de venda para a loja online e o Instagram'),
  observacoes: z.string().nullable().describe('O que não foi possível identificar ou merece conferência')
});

export type AnalisePeca = z.infer<typeof analiseSchema>;

const SYSTEM_PROMPT = `Você ajuda um brechó brasileiro (roupas, calçados e acessórios em consignação) a cadastrar peças a partir de fotos.

Regras:
- Responda sempre em português do Brasil.
- descricao: o tipo da peça, curto. Se houver um item equivalente na lista de descrições cadastradas, use exatamente esse texto.
- cor: a cor ou estampa predominante. Prefira um item da lista de cores cadastradas.
- marca e tamanho: preencha somente se estiverem legíveis em alguma foto (etiqueta, estampa, logotipo). Não deduza pelo estilo. Se a marca estiver na lista cadastrada, use a grafia da lista.
- condicao: NOVA se tiver etiqueta de loja ou nunca foi usada; SEMI_NOVA se tiver pouco ou nenhum sinal de uso; USADA se houver desgaste visível (bolinhas, desbotamento, tecido gasto).
- defeitos: descreva manchas, furos, rasgos, botões ou zíperes faltando que estejam visíveis. Use null se não houver.
- valor_venda_sugerido: preço justo de revenda em brechó no Brasil, considerando tipo, marca e condição. Use null se não houver base para estimar.
- titulo_loja: título atrativo e objetivo, até 80 caracteres (ex.: "Vestido Midi Floral Farm - Tam. M").
- descricao_loja: 2 a 4 frases honestas para vender a peça online, citando tecido/modelagem só se forem visíveis e mencionando os defeitos, se houver. Não invente informações.
- observacoes: o que ficou incerto ou deve ser conferido pela equipe (ex.: "tamanho não visível, conferir etiqueta").`;

let client: Anthropic | null = null;

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function getClient(): Anthropic {
  if (!isAiConfigured()) {
    throw new HttpError(503, 'IA não configurada: defina ANTHROPIC_API_KEY nas variáveis do servidor');
  }
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 90_000, maxRetries: 2 });
  }
  return client;
}

// Cadastros auxiliares mudam pouco; evita 4 consultas a cada foto analisada
let auxiliaresCache: { valor: Record<string, string[]>; expira: number } | null = null;

async function carregarAuxiliares(): Promise<Record<string, string[]>> {
  if (auxiliaresCache && auxiliaresCache.expira > Date.now()) return auxiliaresCache.valor;

  const [descricoes, cores, marcas, tamanhos] = await Promise.all([
    sql`SELECT nome FROM descriptions ORDER BY nome`,
    sql`SELECT nome FROM colors ORDER BY nome`,
    sql`SELECT nome FROM brands ORDER BY nome`,
    sql`SELECT DISTINCT nome FROM sizes ORDER BY nome`
  ]);
  const nomes = (rows: Record<string, unknown>[]) => rows.map((r) => String(r.nome));
  const valor = { descricoes: nomes(descricoes), cores: nomes(cores), marcas: nomes(marcas), tamanhos: nomes(tamanhos) };
  auxiliaresCache = { valor, expira: Date.now() + 5 * 60 * 1000 };
  return valor;
}

// Usa a grafia do cadastro quando a IA devolve o mesmo nome com outra caixa/acentuação
function normalizarComLista(valor: string | null, lista: string[]): string | null {
  if (!valor) return null;
  const chave = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  return lista.find((item) => chave(item) === chave(valor)) ?? valor.trim();
}

export interface ImagemPeca {
  mediaType: ImageMime;
  base64: string;
}

export async function analisarPeca(imagens: ImagemPeca[]): Promise<AnalisePeca> {
  const anthropic = getClient();
  const auxiliares = await carregarAuxiliares();

  const imageBlocks: Anthropic.Beta.BetaImageBlockParam[] = imagens.map((imagem) => ({
    type: 'image',
    source: { type: 'base64', media_type: imagem.mediaType, data: imagem.base64 }
  }));

  const instrucao = [
    imagens.length > 1
      ? `Analise as ${imagens.length} fotos acima: são da mesma peça (a primeira é a foto principal; as demais podem mostrar etiqueta ou detalhes).`
      : 'Analise a foto da peça acima.',
    `Descrições cadastradas: ${auxiliares.descricoes.join(', ') || '(nenhuma)'}`,
    `Cores cadastradas: ${auxiliares.cores.join(', ') || '(nenhuma)'}`,
    `Marcas cadastradas: ${auxiliares.marcas.join(', ') || '(nenhuma)'}`,
    `Tamanhos cadastrados: ${auxiliares.tamanhos.join(', ') || '(nenhum)'}`
  ].join('\n');

  let response;
  try {
    response = await anthropic.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      // Se um filtro de segurança recusar a análise, a API refaz no modelo de reserva recomendado
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: betaZodOutputFormat(analiseSchema) },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: [...imageBlocks, { type: 'text', text: instrucao }] }]
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      throw new HttpError(502, 'Chave da API da Anthropic inválida ou sem permissão');
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new HttpError(429, 'Limite de uso da IA atingido. Tente novamente em instantes.');
    }
    if (error instanceof Anthropic.BadRequestError) {
      console.error('IA: requisição rejeitada:', error.message);
      throw new HttpError(422, 'A IA não aceitou as fotos enviadas. Tente outra foto.');
    }
    if (error instanceof Anthropic.APIConnectionError || error instanceof Anthropic.APIError) {
      console.error('IA: erro na API da Anthropic:', error);
      throw new HttpError(502, 'Serviço de IA indisponível no momento. Preencha manualmente ou tente de novo.');
    }
    throw error;
  }

  console.log(`IA: peça analisada (${response.model}, ${response.usage.input_tokens} tokens de entrada, ${response.usage.output_tokens} de saída)`);

  if (response.stop_reason === 'refusal') {
    throw new HttpError(422, 'A IA não conseguiu analisar esta foto. Preencha manualmente.');
  }
  if (response.stop_reason === 'max_tokens' || !response.parsed_output) {
    throw new HttpError(502, 'A IA devolveu uma resposta incompleta. Tente novamente.');
  }

  const analise = response.parsed_output;
  return {
    ...analise,
    descricao: normalizarComLista(analise.descricao, auxiliares.descricoes) ?? analise.descricao,
    cor: normalizarComLista(analise.cor, auxiliares.cores),
    marca: normalizarComLista(analise.marca, auxiliares.marcas),
    tamanho: normalizarComLista(analise.tamanho, auxiliares.tamanhos),
    valor_venda_sugerido: analise.valor_venda_sugerido && analise.valor_venda_sugerido > 0
      ? round2(analise.valor_venda_sugerido)
      : null,
    titulo_loja: analise.titulo_loja.slice(0, 150)
  };
}
