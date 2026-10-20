import express, { Router, Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { sql } from '../database.js';
import { isAiConfigured } from '../services/productAi.js';
import { getStoreSettings, checkoutAtivo } from '../services/storeSettings.js';
import { reservaAtivaAte } from '../services/reservas.js';
import { sendError } from '../utils/http.js';
import {
  LOJA_NOME, INSTAGRAM, WHATSAPP, PecaLoja, baseUrl, escapeHtml, formatBRL, tituloPeca, descricaoPeca, fotoUrl, layout,
  cardPeca, icone, logoSvg, pilares, jsonLd, dadosLoja, condicaoLabels, marcaValida, rotuloTipo
} from '../views/loja.js';

// Loja online pública: vitrine, página de cada peça, fotos, sitemap e feed do catálogo do Instagram (Meta Commerce Manager).
// Só aparecem peças com canal DIGITAL e foto cadastrada.

export { LOJA_NOME, INSTAGRAM, WHATSAPP, baseUrl, escapeHtml, formatBRL, tituloPeca, fotoUrl, layout };
export type { PecaLoja };

const ASSETS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../assets/loja');

// Peças vendidas/devolvidas continuam no feed como "fora de estoque" por este período, para o Instagram removê-las
const DIAS_NO_FEED_APOS_SAIR = 30;

export async function buscarPecaDigital(id: string): Promise<PecaLoja | null> {
  if (!/^\d+$/.test(id)) return null;
  const [peca] = await sql`
    SELECT p.id, p.codigo_barras, p.descricao, p.titulo_loja, p.descricao_loja, p.marca, p.cor, p.tamanho,
      p.condicao, p.defeitos, p.valor_venda, p.status, p.created_at as criado_em, pp.updated_at as foto_atualizada_em
    FROM products p
    JOIN product_photos pp ON pp.product_id = p.id
    WHERE p.id = ${id} AND p.canal = 'DIGITAL'
  ` as PecaLoja[];
  return peca ?? null;
}

// PP, P, M, G, GG... antes dos números (34, 36, 38...), e o resto em ordem alfabética
const ORDEM_TAMANHOS = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG', 'EG', 'EGG', 'U', 'UNICO', 'ÚNICO'];
function pesoTamanho(tamanho: string): number {
  const i = ORDEM_TAMANHOS.indexOf(tamanho.trim().toUpperCase());
  if (i >= 0) return i;
  const n = parseFloat(tamanho.replace(',', '.'));
  return Number.isFinite(n) ? 100 + n : 1000;
}
const ordenarTamanhos = (tamanhos: string[]) =>
  [...tamanhos].sort((a, b) => pesoTamanho(a) - pesoTamanho(b) || a.localeCompare(b, 'pt-BR', { numeric: true }));

const ORDENS = { recentes: 'Novidades', menor: 'Menor preço', maior: 'Maior preço' } as const;
type Ordem = keyof typeof ORDENS;

const plural = (n: number) => `${n} ${n === 1 ? 'peça' : 'peças'}`;

// Vitrine: peças digitais disponíveis, com busca, categorias, tamanhos e ordenação (links e formulário GET, sem JavaScript)
async function vitrine(req: Request, res: Response) {
  try {
    const tipo = typeof req.query.tipo === 'string' ? req.query.tipo.slice(0, 100) : '';
    const tamanho = typeof req.query.tamanho === 'string' ? req.query.tamanho.slice(0, 20) : '';
    const busca = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
    const ordem: Ordem = typeof req.query.ordem === 'string' && req.query.ordem in ORDENS ? req.query.ordem as Ordem : 'recentes';

    const [pecas, opcoes, settings] = await Promise.all([
      sql`
        SELECT p.id, p.codigo_barras, p.descricao, p.titulo_loja, p.descricao_loja, p.marca, p.cor, p.tamanho,
          p.condicao, p.defeitos, p.valor_venda, p.status, p.created_at as criado_em, pp.updated_at as foto_atualizada_em
        FROM products p
        JOIN product_photos pp ON pp.product_id = p.id
        WHERE p.canal = 'DIGITAL' AND p.status = 'DISPONIVEL'
          AND NOT EXISTS (
            SELECT 1 FROM online_orders oo
            WHERE oo.product_id = p.id AND oo.status = 'AGUARDANDO_PAGAMENTO' AND oo.expira_em > now()
          )
          AND (${tipo} = '' OR p.descricao = ${tipo})
          AND (${tamanho} = '' OR p.tamanho = ${tamanho})
          AND (${busca} = '' OR p.titulo_loja ILIKE ${'%' + busca + '%'} OR p.descricao ILIKE ${'%' + busca + '%'}
               OR p.marca ILIKE ${'%' + busca + '%'} OR p.cor ILIKE ${'%' + busca + '%'})
        ORDER BY
          CASE WHEN ${ordem} = 'menor' THEN p.valor_venda END ASC,
          CASE WHEN ${ordem} = 'maior' THEN p.valor_venda END DESC,
          p.created_at DESC
        LIMIT 300
      `.then((rows) => rows as PecaLoja[]),
      // Opções dos filtros: só tipos e tamanhos que existem entre as peças publicadas
      sql`
        SELECT
          ARRAY(SELECT DISTINCT p.descricao FROM products p JOIN product_photos pp ON pp.product_id = p.id
                WHERE p.canal = 'DIGITAL' AND p.status = 'DISPONIVEL' ORDER BY 1) as tipos,
          ARRAY(SELECT DISTINCT p.tamanho FROM products p JOIN product_photos pp ON pp.product_id = p.id
                WHERE p.canal = 'DIGITAL' AND p.status = 'DISPONIVEL' AND p.tamanho IS NOT NULL ORDER BY 1) as tamanhos
      `.then((rows) => rows as Array<{ tipos: string[]; tamanhos: string[] }>),
      getStoreSettings()
    ]);

    const base = `${baseUrl(req)}/loja`;
    const atual = { q: busca, tipo, tamanho, ordem: ordem === 'recentes' ? '' : ordem };
    const link = (mudar: Partial<typeof atual>) => {
      const params = new URLSearchParams(Object.entries({ ...atual, ...mudar }).filter(([, v]) => v) as Array<[string, string]>);
      const qs = params.toString();
      return `${base}${qs ? `?${qs}` : ''}#pecas`;
    };
    const filtrando = Boolean(tipo || tamanho || busca);

    const chips = opcoes[0].tipos.length > 1 ? `
      <nav class="chips" aria-label="Categorias">
        <a class="chip${tipo ? '' : ' ativo'}" href="${escapeHtml(link({ tipo: '' }))}">Tudo</a>
        ${opcoes[0].tipos.map((t) => `<a class="chip${t === tipo ? ' ativo' : ''}" href="${escapeHtml(link({ tipo: t === tipo ? '' : t }))}">${escapeHtml(rotuloTipo(t))}</a>`).join('')}
      </nav>` : '';

    const tamanhos = ordenarTamanhos(opcoes[0].tamanhos);
    const filtrosLinha = `
      <div class="filtros-linha">
        ${tamanhos.length > 1 ? `<div class="tamanhos"><span class="rotulo-filtro">Tamanho</span>
          ${tamanhos.map((t) => `<a class="tam${t === tamanho ? ' ativo' : ''}" href="${escapeHtml(link({ tamanho: t === tamanho ? '' : t }))}">${escapeHtml(t)}</a>`).join('')}
        </div>` : '<div></div>'}
        <div class="ordem"><span class="rotulo-filtro">Ordenar</span>
          ${(Object.keys(ORDENS) as Ordem[]).map((o) => `<a class="${o === ordem ? 'ativo' : ''}" href="${escapeHtml(link({ ordem: o === 'recentes' ? '' : o }))}">${ORDENS[o]}</a>`).join('')}
          ${filtrando ? `<a class="limpar" href="${base}#pecas">Limpar filtros</a>` : ''}
        </div>
      </div>`;

    const titulo = busca ? `Resultados para “${busca}”` : tipo ? rotuloTipo(tipo) : 'Novidades';
    const grade = pecas.length === 0
      ? `<div class="vazio">
          <h3>${filtrando ? 'Nada por aqui com esses filtros' : 'Novas peças chegando'}</h3>
          <p>${filtrando ? 'Tente outra busca ou veja todas as peças disponíveis.' : 'Estamos fotografando as próximas peças. Acompanhe as novidades no Instagram.'}</p>
          ${filtrando ? `<a class="botao secundario" style="display:inline-flex;width:auto" href="${base}#pecas">Ver todas as peças</a>`
            : INSTAGRAM ? `<a class="botao secundario" style="display:inline-flex;width:auto" href="https://instagram.com/${encodeURIComponent(INSTAGRAM)}" rel="noopener">${icone('instagram')} @${escapeHtml(INSTAGRAM)}</a>` : ''}
        </div>`
      : `<div class="grade">${pecas.map((peca, i) => cardPeca(req, peca, i < 4)).join('')}</div>`;

    const hero = filtrando || ordem !== 'recentes' ? '' : `
      <section class="hero">
        <div class="container hero-in">
          <div>
            <p class="sobrelinha">Brechó em Passo Fundo · RS</p>
            <h1>Moda sustentável é nosso modo de <em>mudar o mundo</em>.</h1>
            <p class="hero-lead">Peças selecionadas uma a uma, prontas para uma nova história. Cada uma é única: quando sai daqui, não volta mais.</p>
            <div class="hero-acoes">
              <a class="botao botao-claro" href="#pecas">Ver as peças ${icone('seta')}</a>
              ${INSTAGRAM ? `<a class="link-claro" href="https://instagram.com/${encodeURIComponent(INSTAGRAM)}" rel="noopener" target="_blank">${icone('instagram')} @${escapeHtml(INSTAGRAM)}</a>` : ''}
            </div>
          </div>
          <div class="hero-selo">${logoSvg()}</div>
        </div>
      </section>`;

    const conteudo = `${hero}
      <section class="container secao" id="pecas">
        <div class="secao-topo"><h2>${escapeHtml(titulo)}</h2><span class="contagem">${plural(pecas.length)}</span></div>
        <form class="busca" method="get" action="${base}#pecas" role="search">
          ${icone('busca')}
          <label class="oculto" for="q">Buscar</label>
          <input type="search" id="q" name="q" value="${escapeHtml(busca)}" placeholder="Buscar por peça, marca ou cor">
          ${tipo ? `<input type="hidden" name="tipo" value="${escapeHtml(tipo)}">` : ''}
          ${tamanho ? `<input type="hidden" name="tamanho" value="${escapeHtml(tamanho)}">` : ''}
          <button type="submit">Buscar</button>
        </form>
        ${chips}
        ${filtrosLinha}
        ${grade}
      </section>
      ${pilares(settings)}`;

    const primeira = pecas[0];
    const meta = `
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(LOJA_NOME)} · Peças únicas">
<meta property="og:description" content="Brechó em Passo Fundo/RS. Moda sustentável, peças selecionadas e compra online por Pix ou cartão.">
<meta property="og:url" content="${escapeHtml(base)}">
${primeira ? `<meta property="og:image" content="${escapeHtml(fotoUrl(req, primeira))}">` : ''}
${jsonLd(dadosLoja(req, settings))}`;

    res.setHeader('Cache-Control', 'public, max-age=60');
    res.send(layout(req, filtrando ? `${titulo} | ${LOJA_NOME}` : `${LOJA_NOME} · Brechó online em Passo Fundo`, conteudo, {
      settings,
      meta,
      canonical: base,
      indexar: !filtrando && ordem === 'recentes',
      descricao: `Brechó em Passo Fundo/RS: ${plural(pecas.length)} únicas, selecionadas uma a uma. Moda sustentável com compra online por Pix ou cartão em até 12x.`
    }));
  } catch (error) {
    console.error('Erro ao montar a vitrine:', error);
    res.status(500).send('Erro ao carregar a loja');
  }
}

async function naoEncontrada(req: Request, res: Response, mensagem = 'Peça não encontrada') {
  const settings = await getStoreSettings().catch(() => null);
  res.status(404).send(layout(req, `${mensagem} | ${LOJA_NOME}`, `
    <section class="container pagina">
      <div class="status">
        <div class="status-icone">${icone('etiqueta')}</div>
        <h1>${escapeHtml(mensagem)}</h1>
        <p class="sub">Ela pode ter sido vendida ou o link está incompleto. Veja as peças disponíveis agora.</p>
        <a class="botao" style="display:inline-flex;width:auto" href="${baseUrl(req)}/loja">Ver peças disponíveis ${icone('seta')}</a>
      </div>
    </section>`, { settings }));
}

// Página de uma peça (destino dos links do Instagram, do Google e do catálogo)
async function paginaPeca(req: Request, res: Response) {
  try {
    const peca = await buscarPecaDigital(req.params.id);
    if (!peca) return naoEncontrada(req, res);

    const titulo = tituloPeca(peca);
    const url = `${baseUrl(req)}/loja/p/${peca.id}`;
    const disponivel = peca.status === 'DISPONIVEL';
    const [settings, reservadaAte, relacionadas] = await Promise.all([
      getStoreSettings(),
      disponivel ? reservaAtivaAte(peca.id) : Promise.resolve(null),
      sql`
        SELECT p.id, p.codigo_barras, p.descricao, p.titulo_loja, p.descricao_loja, p.marca, p.cor, p.tamanho,
          p.condicao, p.defeitos, p.valor_venda, p.status, p.created_at as criado_em, pp.updated_at as foto_atualizada_em
        FROM products p JOIN product_photos pp ON pp.product_id = p.id
        WHERE p.canal = 'DIGITAL' AND p.status = 'DISPONIVEL' AND p.id <> ${peca.id}
        ORDER BY (p.descricao = ${peca.descricao}) DESC, (p.tamanho IS NOT DISTINCT FROM ${peca.tamanho}) DESC, p.created_at DESC
        LIMIT 4
      `.then((rows) => rows as PecaLoja[])
    ]);
    const compraOnline = checkoutAtivo(settings);

    const mensagem = `Olá! Tenho interesse na peça "${titulo}" (cód. ${peca.codigo_barras}): ${url}`;
    const contato = [
      WHATSAPP && `<a class="botao" href="https://wa.me/${WHATSAPP}?text=${encodeURIComponent(mensagem)}" rel="noopener">${icone('conversa')} Comprar pelo WhatsApp</a>`,
      INSTAGRAM && `<a class="botao secundario" href="https://ig.me/m/${encodeURIComponent(INSTAGRAM)}" rel="noopener">${icone('instagram')} Comprar pelo Instagram</a>`
    ].filter(Boolean).join('');

    let botoes: string;
    if (!disponivel) {
      botoes = '<p class="indisponivel">Esta peça já foi vendida</p>';
    } else if (reservadaAte) {
      botoes = '<p class="indisponivel">Reservada para outra pessoa que está finalizando o pagamento. Volte em alguns minutos.</p>';
    } else if (compraOnline) {
      botoes = `<a class="botao" href="${baseUrl(req)}/loja/comprar/${peca.id}">${icone('sacola')} Comprar agora</a>`;
    } else {
      botoes = contato || '<p class="indisponivel">Fale com a loja para comprar</p>';
    }

    const marca = marcaValida(peca.marca);
    const detalhes = [
      ['Tamanho', peca.tamanho],
      ['Condição', condicaoLabels[peca.condicao] ?? peca.condicao],
      ['Cor', peca.cor],
      ['Marca', marca],
      ['Código', peca.codigo_barras]
    ].filter(([, valor]) => valor).map(([rotulo, valor]) => `<div><dt>${rotulo}</dt><dd>${escapeHtml(valor)}</dd></div>`).join('');

    const entrega = [
      settings.retirada_ativa ? `retire na loja${settings.retirada_endereco ? ` (${settings.retirada_endereco.split(' - ')[0]})` : ''}` : null,
      settings.entrega_local_ativa ? `entrega em ${settings.entrega_local_cidade}` : null,
      settings.correios_ativo ? 'envio para todo o Brasil' : null
    ].filter(Boolean).join(', ');

    const garantias = `
      <ul class="garantias">
        <li>${icone('etiqueta')}<span><strong>Peça única.</strong> Existe só esta: quando ela sai, não volta mais.</span></li>
        ${compraOnline ? `<li>${icone('cadeado')}<span><strong>Pagamento seguro</strong> por Pix ou cartão em até 12x, processado pela InfinitePay.</span></li>` : ''}
        ${entrega ? `<li>${icone('caminhao')}<span><strong>Receba do seu jeito:</strong> ${escapeHtml(entrega)}.</span></li>` : ''}
      </ul>`;

    const tipoLink = `${baseUrl(req)}/loja?tipo=${encodeURIComponent(peca.descricao)}#pecas`;
    const conteudo = `
      <nav class="container migalhas" aria-label="Você está em">
        <a href="${baseUrl(req)}/loja">Loja</a><span>/</span>
        <a href="${escapeHtml(tipoLink)}">${escapeHtml(rotuloTipo(peca.descricao))}</a><span>/</span>
        <span>${escapeHtml(titulo)}</span>
      </nav>
      <article class="container peca">
        <div class="peca-foto"><img src="${escapeHtml(fotoUrl(req, peca))}" alt="${escapeHtml(titulo)}" width="1200" height="1500" fetchpriority="high"></div>
        <div class="peca-info">
          <p class="sobrelinha">${escapeHtml(marca || rotuloTipo(peca.descricao))}</p>
          <h1>${escapeHtml(titulo)}</h1>
          <p class="peca-preco">${formatBRL(peca.valor_venda)}</p>
          <p class="peca-pagamento">${compraOnline ? 'no Pix ou em até 12x no cartão' : 'peça única'}</p>
          <dl class="etiqueta">${detalhes}</dl>
          ${peca.descricao_loja ? `<p class="peca-desc">${escapeHtml(peca.descricao_loja)}</p>` : ''}
          ${peca.defeitos ? `<p class="peca-detalhe"><strong>Detalhe:</strong> ${escapeHtml(peca.defeitos)}</p>` : ''}
          ${botoes}
          ${garantias}
        </div>
      </article>
      ${relacionadas.length ? `
      <section class="container relacionadas">
        <h2>Você também pode gostar</h2>
        <div class="grade">${relacionadas.map((p) => cardPeca(req, p)).join('')}</div>
      </section>` : ''}`;

    const produto = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: titulo,
      description: descricaoPeca(peca),
      image: [fotoUrl(req, peca)],
      sku: peca.codigo_barras,
      ...(marca ? { brand: { '@type': 'Brand', name: marca } } : {}),
      ...(peca.cor ? { color: peca.cor } : {}),
      ...(peca.tamanho ? { size: peca.tamanho } : {}),
      offers: {
        '@type': 'Offer',
        url,
        price: peca.valor_venda.toFixed(2),
        priceCurrency: 'BRL',
        availability: disponivel ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut',
        itemCondition: peca.condicao === 'NOVA' ? 'https://schema.org/NewCondition' : 'https://schema.org/UsedCondition',
        seller: { '@type': 'Organization', name: LOJA_NOME }
      }
    };

    const meta = `
<meta property="og:type" content="product">
<meta property="og:title" content="${escapeHtml(titulo)}">
<meta property="og:description" content="${escapeHtml(`${formatBRL(peca.valor_venda)} · ${descricaoPeca(peca)}`)}">
<meta property="og:image" content="${escapeHtml(fotoUrl(req, peca))}">
<meta property="og:url" content="${escapeHtml(url)}">
<meta property="product:price:amount" content="${peca.valor_venda.toFixed(2)}">
<meta property="product:price:currency" content="BRL">
<meta property="product:availability" content="${disponivel ? 'in stock' : 'out of stock'}">
${jsonLd(produto)}`;

    res.setHeader('Cache-Control', 'public, max-age=60');
    res.send(layout(req, `${titulo} · ${formatBRL(peca.valor_venda)} | ${LOJA_NOME}`, conteudo, {
      settings,
      meta,
      canonical: url,
      indexar: disponivel,
      descricao: `${titulo} por ${formatBRL(peca.valor_venda)}. ${descricaoPeca(peca)}`.slice(0, 300)
    }));
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

// Sitemap para o Google: vitrine e peças disponíveis
async function sitemap(req: Request, res: Response) {
  try {
    const pecas = await sql`
      SELECT p.id, GREATEST(p.updated_at, pp.updated_at) as alterado
      FROM products p JOIN product_photos pp ON pp.product_id = p.id
      WHERE p.canal = 'DIGITAL' AND p.status = 'DISPONIVEL'
      ORDER BY p.created_at DESC
    ` as Array<{ id: number; alterado: Date }>;
    const base = `${baseUrl(req)}/loja`;
    const urls = [`<url><loc>${base}</loc><changefreq>daily</changefreq></url>`,
      ...pecas.map((p) => `<url><loc>${base}/p/${p.id}</loc><lastmod>${new Date(p.alterado).toISOString()}</lastmod></url>`)];
    res.setHeader('Cache-Control', 'public, max-age=600');
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`);
  } catch (error) {
    console.error('Erro ao gerar sitemap:', error);
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
      marcaValida(peca.marca) || LOJA_NOME,
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
lojaRouter.use('/assets', express.static(ASSETS, { maxAge: '365d', immutable: true, fallthrough: false }));
lojaRouter.get('/', vitrine);
lojaRouter.get('/p/:id', paginaPeca);
lojaRouter.get('/foto/:id', fotoPublica);
lojaRouter.get('/sitemap.xml', sitemap);
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
      dominio_verificacao_configurado: Boolean(process.env.FACEBOOK_DOMAIN_VERIFICATION),
      url_publica_configurada: Boolean(process.env.PUBLIC_URL),
      pecas_publicadas: contagem.publicadas,
      pecas_sem_foto: contagem.sem_foto,
      checkout_ativo: checkoutAtivo(await getStoreSettings())
    });
  } catch (error) {
    sendError(res, error, 'Erro ao carregar status da loja');
  }
}
