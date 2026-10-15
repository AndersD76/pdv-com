import { Router, Request, Response } from 'express';
import { sql } from '../database.js';
import { isAiConfigured } from '../services/productAi.js';
import { sendError } from '../utils/http.js';

// Loja online pública: vitrine, página de cada peça, fotos e feed do catálogo do Instagram (Meta Commerce Manager).
// Só aparecem peças com canal DIGITAL e foto cadastrada.

const LOJA_NOME = process.env.LOJA_NOME || 'Apega Desapega Brechó';
const INSTAGRAM = (process.env.LOJA_INSTAGRAM || '').replace(/^@/, '').trim();
const WHATSAPP = (process.env.LOJA_WHATSAPP || '').replace(/\D/g, '');
const DOMAIN_VERIFICATION = process.env.FACEBOOK_DOMAIN_VERIFICATION || '';

// Peças vendidas/devolvidas continuam no feed como "fora de estoque" por este período, para o Instagram removê-las
const DIAS_NO_FEED_APOS_SAIR = 30;

const condicaoLabels: Record<string, string> = { NOVA: 'Nova', SEMI_NOVA: 'Seminova', USADA: 'Usada' };

interface PecaLoja {
  id: number;
  codigo_barras: string;
  descricao: string;
  titulo_loja: string | null;
  descricao_loja: string | null;
  marca: string | null;
  cor: string | null;
  tamanho: string | null;
  condicao: string;
  defeitos: string | null;
  valor_venda: number;
  status: string;
  foto_atualizada_em: Date;
}

function baseUrl(req: Request): string {
  return (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const formatBRL = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

function tituloPeca(peca: PecaLoja): string {
  return peca.titulo_loja
    || [peca.descricao, peca.marca, peca.tamanho ? `Tam. ${peca.tamanho}` : null].filter(Boolean).join(' - ');
}

function descricaoPeca(peca: PecaLoja): string {
  const partes = [peca.descricao_loja || tituloPeca(peca)];
  if (peca.defeitos && !peca.descricao_loja) partes.push(`Detalhes: ${peca.defeitos}`);
  return partes.join(' ');
}

function fotoUrl(req: Request, peca: PecaLoja): string {
  return `${baseUrl(req)}/loja/foto/${peca.id}?v=${new Date(peca.foto_atualizada_em).getTime()}`;
}

function layout(req: Request, title: string, content: string, meta = ''): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
${DOMAIN_VERIFICATION ? `<meta name="facebook-domain-verification" content="${escapeHtml(DOMAIN_VERIFICATION)}">` : ''}
${meta}
<style>
  :root { --cor: #7c3aed; --texto: #1f2937; --suave: #6b7280; --fundo: #f9fafb; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--texto); background: var(--fundo); }
  header { background: #fff; border-bottom: 1px solid #e5e7eb; padding: 16px; text-align: center; }
  header a { color: var(--texto); text-decoration: none; font-weight: 700; font-size: 1.25rem; }
  main { max-width: 1100px; margin: 0 auto; padding: 16px; }
  .grade { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 16px; }
  .card { background: #fff; border-radius: 12px; overflow: hidden; text-decoration: none; color: inherit; border: 1px solid #e5e7eb; }
  .card img { width: 100%; aspect-ratio: 1; object-fit: cover; display: block; background: #eee; }
  .card div { padding: 10px; }
  .card h2 { font-size: .95rem; margin: 0 0 6px; font-weight: 500; }
  .preco { color: var(--cor); font-weight: 700; }
  .produto { display: grid; gap: 24px; grid-template-columns: 1fr; background: #fff; border-radius: 12px; padding: 16px; border: 1px solid #e5e7eb; }
  @media (min-width: 760px) { .produto { grid-template-columns: 1fr 1fr; } }
  .produto img { width: 100%; border-radius: 8px; }
  .produto h1 { font-size: 1.4rem; margin: 0 0 8px; }
  .produto .preco { font-size: 1.6rem; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; color: var(--suave); }
  dd { margin: 0; color: var(--texto); }
  .botao { display: block; text-align: center; padding: 14px; border-radius: 10px; background: var(--cor); color: #fff; text-decoration: none; font-weight: 600; margin-top: 10px; }
  .botao.whatsapp { background: #16a34a; }
  .vendida { padding: 14px; border-radius: 10px; background: #f3f4f6; text-align: center; font-weight: 600; color: var(--suave); }
  .vazio { text-align: center; color: var(--suave); padding: 48px 0; }
</style>
</head>
<body>
<header><a href="${baseUrl(req)}/loja">${escapeHtml(LOJA_NOME)}</a></header>
<main>${content}</main>
</body>
</html>`;
}

async function buscarPecaDigital(id: string): Promise<PecaLoja | null> {
  if (!/^\d+$/.test(id)) return null;
  const [peca] = await sql`
    SELECT p.id, p.codigo_barras, p.descricao, p.titulo_loja, p.descricao_loja, p.marca, p.cor, p.tamanho,
      p.condicao, p.defeitos, p.valor_venda, p.status, pp.updated_at as foto_atualizada_em
    FROM products p
    JOIN product_photos pp ON pp.product_id = p.id
    WHERE p.id = ${id} AND p.canal = 'DIGITAL'
  ` as PecaLoja[];
  return peca ?? null;
}

// Vitrine: peças digitais disponíveis
async function vitrine(req: Request, res: Response) {
  try {
    const pecas = await sql`
      SELECT p.id, p.codigo_barras, p.descricao, p.titulo_loja, p.descricao_loja, p.marca, p.cor, p.tamanho,
        p.condicao, p.defeitos, p.valor_venda, p.status, pp.updated_at as foto_atualizada_em
      FROM products p
      JOIN product_photos pp ON pp.product_id = p.id
      WHERE p.canal = 'DIGITAL' AND p.status = 'DISPONIVEL'
      ORDER BY p.created_at DESC
      LIMIT 300
    ` as PecaLoja[];

    const conteudo = pecas.length === 0
      ? '<p class="vazio">Nenhuma peça disponível no momento. Volte em breve!</p>'
      : `<div class="grade">${pecas.map((peca) => `
          <a class="card" href="${baseUrl(req)}/loja/p/${peca.id}">
            <img src="${escapeHtml(fotoUrl(req, peca))}" alt="${escapeHtml(tituloPeca(peca))}" loading="lazy">
            <div><h2>${escapeHtml(tituloPeca(peca))}</h2><span class="preco">${formatBRL(peca.valor_venda)}</span></div>
          </a>`).join('')}</div>`;

    res.setHeader('Cache-Control', 'public, max-age=60');
    res.send(layout(req, LOJA_NOME, conteudo));
  } catch (error) {
    console.error('Erro ao montar a vitrine:', error);
    res.status(500).send('Erro ao carregar a loja');
  }
}

// Página de uma peça (destino dos links do catálogo do Instagram)
async function paginaPeca(req: Request, res: Response) {
  try {
    const peca = await buscarPecaDigital(req.params.id);
    if (!peca) {
      return res.status(404).send(layout(req, LOJA_NOME, '<p class="vazio">Peça não encontrada.</p>'));
    }

    const titulo = tituloPeca(peca);
    const url = `${baseUrl(req)}/loja/p/${peca.id}`;
    const mensagem = `Olá! Tenho interesse na peça "${titulo}" (cód. ${peca.codigo_barras}): ${url}`;
    const disponivel = peca.status === 'DISPONIVEL';

    const botoes = !disponivel
      ? '<p class="vendida">Esta peça já foi vendida</p>'
      : [
          INSTAGRAM && `<a class="botao" href="https://ig.me/m/${encodeURIComponent(INSTAGRAM)}" rel="noopener">Comprar pelo Instagram</a>`,
          WHATSAPP && `<a class="botao whatsapp" href="https://wa.me/${WHATSAPP}?text=${encodeURIComponent(mensagem)}" rel="noopener">Comprar pelo WhatsApp</a>`
        ].filter(Boolean).join('') || '<p class="vendida">Entre em contato com a loja para comprar</p>';

    const detalhes = [
      ['Código', peca.codigo_barras],
      ['Marca', peca.marca],
      ['Tamanho', peca.tamanho],
      ['Cor', peca.cor],
      ['Condição', condicaoLabels[peca.condicao] ?? peca.condicao],
      ['Detalhes', peca.defeitos]
    ].filter(([, valor]) => valor).map(([rotulo, valor]) => `<dt>${rotulo}</dt><dd>${escapeHtml(valor)}</dd>`).join('');

    const meta = `
<meta property="og:type" content="product">
<meta property="og:title" content="${escapeHtml(titulo)}">
<meta property="og:description" content="${escapeHtml(descricaoPeca(peca))}">
<meta property="og:image" content="${escapeHtml(fotoUrl(req, peca))}">
<meta property="og:url" content="${escapeHtml(url)}">
<meta property="product:price:amount" content="${peca.valor_venda.toFixed(2)}">
<meta property="product:price:currency" content="BRL">
<meta property="product:availability" content="${disponivel ? 'in stock' : 'out of stock'}">`;

    const conteudo = `
      <div class="produto">
        <img src="${escapeHtml(fotoUrl(req, peca))}" alt="${escapeHtml(titulo)}">
        <div>
          <h1>${escapeHtml(titulo)}</h1>
          <p class="preco">${formatBRL(peca.valor_venda)}</p>
          ${peca.descricao_loja ? `<p>${escapeHtml(peca.descricao_loja)}</p>` : ''}
          <dl>${detalhes}</dl>
          ${botoes}
        </div>
      </div>`;

    res.setHeader('Cache-Control', 'public, max-age=60');
    res.send(layout(req, `${titulo} | ${LOJA_NOME}`, conteudo, meta));
  } catch (error) {
    console.error('Erro ao montar a página da peça:', error);
    res.status(500).send('Erro ao carregar a peça');
  }
}

// Foto pública (somente de peças da loja digital)
async function fotoPublica(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!/^\d+$/.test(id)) return res.status(404).end();

    const [photo] = await sql`
      SELECT pp.mime, encode(pp.dados, 'base64') as base64
      FROM product_photos pp
      JOIN products p ON p.id = pp.product_id
      WHERE pp.product_id = ${id} AND p.canal = 'DIGITAL'
    `;
    if (!photo) return res.status(404).end();

    res.setHeader('Cache-Control', req.query.v ? 'public, max-age=31536000, immutable' : 'public, max-age=300');
    res.type(String(photo.mime)).send(Buffer.from(String(photo.base64), 'base64'));
  } catch (error) {
    console.error('Erro ao enviar foto:', error);
    res.status(500).end();
  }
}

const csvCell = (value: unknown) => `"${String(value ?? '').replace(/\r?\n/g, ' ').replace(/"/g, '""')}"`;

// Feed do catálogo (formato do Meta Commerce Manager): configure como "feed programado" de hora em hora
async function feedCatalogo(req: Request, res: Response) {
  try {
    const pecas = await sql`
      SELECT p.id, p.codigo_barras, p.descricao, p.titulo_loja, p.descricao_loja, p.marca, p.cor, p.tamanho,
        p.condicao, p.defeitos, p.valor_venda, p.status, pp.updated_at as foto_atualizada_em
      FROM products p
      JOIN product_photos pp ON pp.product_id = p.id
      WHERE p.canal = 'DIGITAL'
        AND (p.status = 'DISPONIVEL' OR p.updated_at > now() - make_interval(days => ${DIAS_NO_FEED_APOS_SAIR}))
      ORDER BY p.id
    ` as PecaLoja[];

    const header = ['id', 'title', 'description', 'availability', 'condition', 'price', 'link', 'image_link', 'brand', 'color', 'size'];
    const linhas = pecas.map((peca) => [
      peca.codigo_barras,
      tituloPeca(peca).slice(0, 150),
      descricaoPeca(peca).slice(0, 5000),
      peca.status === 'DISPONIVEL' ? 'in stock' : 'out of stock',
      peca.condicao === 'NOVA' ? 'new' : 'used',
      `${peca.valor_venda.toFixed(2)} BRL`,
      `${baseUrl(req)}/loja/p/${peca.id}`,
      fotoUrl(req, peca),
      peca.marca || LOJA_NOME,
      peca.cor,
      peca.tamanho
    ].map(csvCell).join(','));

    res.setHeader('Cache-Control', 'no-cache');
    res.type('text/csv; charset=utf-8').send([header.join(','), ...linhas].join('\n'));
  } catch (error) {
    console.error('Erro ao gerar feed do catálogo:', error);
    res.status(500).send('Erro ao gerar feed');
  }
}

export const lojaRouter = Router();
lojaRouter.get('/', vitrine);
lojaRouter.get('/p/:id', paginaPeca);
lojaRouter.get('/foto/:id', fotoPublica);
lojaRouter.get('/feed.csv', feedCatalogo);

// Situação da loja online para a tela de configuração (rota autenticada, admin)
export async function getStatus(req: Request, res: Response) {
  try {
    const [contagem] = await sql`
      SELECT
        COUNT(*) FILTER (WHERE p.status = 'DISPONIVEL' AND pp.product_id IS NOT NULL) as publicadas,
        COUNT(*) FILTER (WHERE p.status = 'DISPONIVEL' AND pp.product_id IS NULL) as sem_foto
      FROM products p
      LEFT JOIN product_photos pp ON pp.product_id = p.id
      WHERE p.canal = 'DIGITAL'
    `;

    res.json({
      ia_configurada: isAiConfigured(),
      vitrine_url: `${baseUrl(req)}/loja`,
      feed_url: `${baseUrl(req)}/loja/feed.csv`,
      instagram: INSTAGRAM || null,
      whatsapp: WHATSAPP || null,
      dominio_verificacao_configurado: Boolean(DOMAIN_VERIFICATION),
      url_publica_configurada: Boolean(process.env.PUBLIC_URL),
      pecas_publicadas: contagem.publicadas,
      pecas_sem_foto: contagem.sem_foto
    });
  } catch (error) {
    sendError(res, error, 'Erro ao carregar status da loja');
  }
}
