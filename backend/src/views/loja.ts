import { Request } from 'express';
import { checkoutAtivo, StoreSettings } from '../services/storeSettings.js';

// Aparência da loja online pública (vitrine, peça, compra e pedido), seguindo o MIV do Apega Desapega:
// verde-sálvia, logo circular, títulos em Libre Baskerville. HTML gerado no servidor, sem JavaScript.

export const LOJA_NOME = process.env.LOJA_NOME || 'Apega Desapega Brechó';
export const INSTAGRAM = (process.env.LOJA_INSTAGRAM || '').replace(/^@/, '').trim();
export const WHATSAPP = (process.env.LOJA_WHATSAPP || '').replace(/\D/g, '');
export const CNPJ = process.env.LOJA_CNPJ ?? '33.597.136/0001-80';
const DOMAIN_VERIFICATION = process.env.FACEBOOK_DOMAIN_VERIFICATION || '';
const SLOGAN = 'Moda sustentável é nosso modo de mudar o mundo';

export const condicaoLabels: Record<string, string> = { NOVA: 'Nova', SEMI_NOVA: 'Seminova', USADA: 'Usada' };

export interface PecaLoja {
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
  criado_em?: Date;
}

export function baseUrl(req: Request): string {
  return (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const formatBRL = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

const formatTelefone = (numero: string) => {
  const local = numero.replace(/^55/, '');
  return local.length === 11 ? `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}` : numero;
};

// "VESTIDO MIDI" -> "Vestido midi" (nomes das categorias vindos do cadastro)
export const rotuloTipo = (tipo: string) => tipo.charAt(0).toUpperCase() + tipo.slice(1).toLowerCase();

export const marcaValida = (marca: string | null) => (marca && !/^sem marca/i.test(marca.trim()) ? marca.trim() : null);

export function tituloPeca(peca: PecaLoja): string {
  return peca.titulo_loja
    || [rotuloTipo(peca.descricao), marcaValida(peca.marca), peca.tamanho ? `Tam. ${peca.tamanho}` : null].filter(Boolean).join(' - ');
}

export function descricaoPeca(peca: PecaLoja): string {
  const partes = [peca.descricao_loja || tituloPeca(peca)];
  if (peca.defeitos && !peca.descricao_loja) partes.push(`Detalhes: ${peca.defeitos}`);
  return partes.join(' ');
}

export function fotoUrl(req: Request, peca: PecaLoja): string {
  return `${baseUrl(req)}/loja/foto/${peca.id}?v=${new Date(peca.foto_atualizada_em).getTime()}`;
}

const ehNova = (peca: PecaLoja) => Boolean(peca.criado_em && Date.now() - new Date(peca.criado_em).getTime() < 7 * 86_400_000);

// Ícones de traço (Lucide, licença ISC)
const ICONES: Record<string, string> = {
  busca: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  instagram: '<rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>',
  conversa: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  local: '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
  escudo: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  caminhao: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  folha: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>',
  etiqueta: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
  cartao: '<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>',
  voltar: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  seta: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  relogio: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  alerta: '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
  cadeado: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  sacola: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
};

export const icone = (nome: keyof typeof ICONES | string, classe = '') =>
  `<svg class="icone ${classe}" viewBox="0 0 24 24" aria-hidden="true">${ICONES[nome] ?? ''}</svg>`;

// Logo circular do MIV: "APEGA DESAPEGA" em arco, traço circular e "BRECHÓ" no centro
const LOGO_LETRAS = (() => {
  const letras = 'APEGA DESAPEGA'.split('');
  const inicio = 196;
  const fim = 391;
  const raio = 84;
  const passo = (fim - inicio) / (letras.length - 1);
  return letras.map((letra, i) => {
    if (letra === ' ') return '';
    const angulo = inicio + i * passo;
    const rad = (angulo * Math.PI) / 180;
    const x = (100 + raio * Math.cos(rad)).toFixed(2);
    const y = (100 + raio * Math.sin(rad)).toFixed(2);
    return `<text x="${x}" y="${y}" transform="rotate(${(angulo + 90).toFixed(2)} ${x} ${y})">${letra}</text>`;
  }).join('');
})();

export function logoSvg(classe = ''): string {
  const fim = { x: (100 + 84 * Math.cos((44 * Math.PI) / 180)).toFixed(2), y: (100 + 84 * Math.sin((44 * Math.PI) / 180)).toFixed(2) };
  return `<svg class="logo ${classe}" viewBox="0 0 200 200" role="img" aria-label="${escapeHtml(LOJA_NOME)}">
  <g fill="currentColor" font-family="Barlow, 'Arial Black', sans-serif" font-weight="700" font-size="15" text-anchor="middle">${LOGO_LETRAS}</g>
  <path d="M15.6 103 A84 84 0 0 0 ${fim.x} ${fim.y}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
  <text x="101" y="113.5" fill="currentColor" font-family="Barlow, 'Arial Black', sans-serif" font-weight="800" font-size="41" text-anchor="middle" textLength="128" lengthAdjust="spacingAndGlyphs">BRECHÓ</text>
</svg>`;
}

const FAVICON = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#557f6d"/>'
  + '<path d="M13 34a19 19 0 0 0 36 8" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/>'
  + '<text x="32" y="38" fill="#fff" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="17" text-anchor="middle">AD</text></svg>'
)}`;

const CSS = `
@font-face { font-family: 'Barlow'; font-weight: 400; font-style: normal; font-display: swap; src: url(/loja/assets/fonts/barlow-400.woff2) format('woff2'); }
@font-face { font-family: 'Barlow'; font-weight: 500; font-style: normal; font-display: swap; src: url(/loja/assets/fonts/barlow-500.woff2) format('woff2'); }
@font-face { font-family: 'Barlow'; font-weight: 600; font-style: normal; font-display: swap; src: url(/loja/assets/fonts/barlow-600.woff2) format('woff2'); }
@font-face { font-family: 'Barlow'; font-weight: 700; font-style: normal; font-display: swap; src: url(/loja/assets/fonts/barlow-700.woff2) format('woff2'); }
@font-face { font-family: 'Barlow'; font-weight: 800; font-style: normal; font-display: swap; src: url(/loja/assets/fonts/barlow-800.woff2) format('woff2'); }
@font-face { font-family: 'Libre Baskerville'; font-weight: 400 700; font-style: normal; font-display: swap; src: url(/loja/assets/fonts/libre-baskerville.woff2) format('woff2'); }
@font-face { font-family: 'Libre Baskerville'; font-weight: 400; font-style: italic; font-display: swap; src: url(/loja/assets/fonts/libre-baskerville-italic.woff2) format('woff2'); }

:root {
  --verde: #648f7c; --verde-hero: #557f6d; --verde-escuro: #3e6455; --verde-noite: #2c4a3e; --bruma: #eef3f0;
  --tinta: #1d1d1b; --texto: #3a3a36; --suave: #6b6b65; --linha: #e5e2db; --papel: #f2efe9; --fundo: #fbfaf7;
  --serif: 'Libre Baskerville', Georgia, 'Times New Roman', serif;
  --sans: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  --raio: 3px;
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; scroll-behavior: smooth; }
body { margin: 0; background: var(--fundo); color: var(--texto); font: 400 16px/1.55 var(--sans); -webkit-font-smoothing: antialiased; }
img { max-width: 100%; display: block; }
a { color: inherit; }
:focus-visible { outline: 2px solid var(--verde-escuro); outline-offset: 2px; }
.container { width: 100%; max-width: 1240px; margin: 0 auto; padding: 0 20px; }
@media (min-width: 768px) { .container { padding: 0 40px; } }
.icone { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; flex: none; }
.sobrelinha { font-size: 12px; font-weight: 600; letter-spacing: .22em; text-transform: uppercase; margin: 0 0 14px; color: var(--verde-escuro); }
.oculto { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

/* Faixa e topo */
.faixa { background: var(--verde-noite); color: #e3ece7; font-size: 12px; font-weight: 500; letter-spacing: .16em; text-transform: uppercase; text-align: center; padding: 9px 16px; }
.faixa span + span::before { content: '·'; margin: 0 12px; opacity: .55; }
@media (max-width: 640px) { .faixa span:nth-child(n+3) { display: none; } .faixa { font-size: 11px; letter-spacing: .1em; padding: 8px 12px; } .faixa span + span::before { margin: 0 8px; } }
.topo { position: sticky; top: 0; z-index: 20; background: rgb(251 250 247 / .94); backdrop-filter: saturate(1.4) blur(10px); border-bottom: 1px solid var(--linha); }
.topo-in { display: flex; align-items: center; justify-content: space-between; height: 76px; gap: 16px; }
.marca { display: flex; align-items: center; gap: 12px; text-decoration: none; color: var(--tinta); }
.marca .logo { width: 54px; height: 54px; color: var(--verde-escuro); }
.marca-nome { font-family: var(--serif); font-size: 18px; line-height: 1.15; }
.marca-nome small { display: block; font-family: var(--sans); font-size: 11px; font-weight: 600; letter-spacing: .3em; text-transform: uppercase; color: var(--verde-escuro); margin-top: 3px; }
.topo-links { display: flex; align-items: center; gap: 26px; }
.topo-links a { display: inline-flex; align-items: center; gap: 7px; font-size: 13px; font-weight: 500; letter-spacing: .14em; text-transform: uppercase; text-decoration: none; color: var(--tinta); }
.topo-links a:hover { color: var(--verde-escuro); }
@media (max-width: 720px) { .topo-in { height: 66px; } .marca .logo { width: 46px; height: 46px; } .marca-nome { font-size: 16px; } .topo-links { gap: 18px; } .topo-links .rotulo { display: none; } .topo-links .icone { width: 22px; height: 22px; } }

/* Abertura */
.hero { background: var(--verde-hero); color: #fff; position: relative; overflow: hidden; }
.hero::after { content: ''; position: absolute; right: -180px; bottom: -260px; width: 620px; height: 620px; border: 1.5px solid rgb(255 255 255 / .14); border-radius: 50%; pointer-events: none; }
.hero-in { position: relative; z-index: 1; display: grid; gap: 40px; align-items: center; padding-top: 64px; padding-bottom: 72px; }
@media (min-width: 900px) { .hero-in { grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); padding-top: 96px; padding-bottom: 104px; } }
.hero .sobrelinha { color: #dce8e1; }
.hero h1 { font-family: var(--serif); font-weight: 400; font-size: clamp(32px, 5.2vw, 58px); line-height: 1.12; letter-spacing: -.01em; margin: 0 0 22px; max-width: 15ch; text-wrap: balance; }
.hero h1 em { font-style: italic; }
.hero-lead { font-size: clamp(17px, 1.6vw, 19px); line-height: 1.6; color: #f1f6f3; margin: 0 0 34px; max-width: 44ch; }
.hero-acoes { display: flex; flex-wrap: wrap; align-items: center; gap: 14px 28px; }
.botao-claro { background: #fff; color: var(--verde-noite); }
.botao-claro:hover { background: var(--bruma); color: var(--verde-noite); }
.link-claro { display: inline-flex; align-items: center; gap: 8px; color: #fff; font-size: 14px; font-weight: 500; letter-spacing: .1em; text-transform: uppercase; text-decoration: none; border-bottom: 1px solid rgb(255 255 255 / .5); padding-bottom: 3px; }
.hero-selo { justify-self: center; width: min(360px, 80%); color: #fff; }
.hero-selo .logo { width: 100%; height: auto; }
@media (max-width: 899px) { .hero-selo { display: none; } }

/* Seção de peças */
.secao { padding-top: 56px; padding-bottom: 80px; }
.secao-topo { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px 24px; flex-wrap: wrap; margin-bottom: 26px; }
.secao-topo h2 { font-family: var(--serif); font-weight: 400; font-size: clamp(26px, 3vw, 34px); line-height: 1.2; color: var(--tinta); margin: 0; }
.contagem { color: var(--suave); font-size: 15px; }
.busca { position: relative; margin-bottom: 18px; }
.busca input { width: 100%; height: 54px; padding: 0 128px 0 50px; border: 1px solid var(--linha); border-radius: var(--raio); background: #fff; font: inherit; color: var(--tinta); -webkit-appearance: none; }
.busca input::placeholder { color: #9a9a93; }
.busca input:focus { outline: 2px solid var(--verde); outline-offset: -1px; border-color: transparent; }
.busca > .icone { position: absolute; left: 18px; top: 50%; transform: translateY(-50%); width: 20px; height: 20px; color: var(--suave); }
.busca button { position: absolute; top: 6px; right: 6px; bottom: 6px; padding: 0 22px; border: 0; border-radius: var(--raio); background: var(--verde-escuro); color: #fff; font: 600 12px/1 var(--sans); letter-spacing: .18em; text-transform: uppercase; cursor: pointer; }
.busca button:hover { background: var(--verde-noite); }
.chips { display: flex; gap: 8px; overflow-x: auto; margin: 0 -20px 14px; padding: 2px 20px 6px; scrollbar-width: none; }
.chips::-webkit-scrollbar { display: none; }
@media (min-width: 768px) { .chips { flex-wrap: wrap; margin: 0 0 14px; padding: 2px 0 6px; } }
.chip { flex: none; padding: 9px 17px; border: 1px solid var(--linha); border-radius: 999px; background: #fff; font-size: 14px; color: var(--texto); text-decoration: none; white-space: nowrap; transition: border-color .15s, background .15s; }
.chip:hover { border-color: var(--verde); }
.chip.ativo { background: var(--tinta); border-color: var(--tinta); color: #fff; }
.filtros-linha { display: flex; justify-content: space-between; align-items: center; gap: 14px 24px; flex-wrap: wrap; margin-bottom: 34px; padding-bottom: 18px; border-bottom: 1px solid var(--linha); }
.rotulo-filtro { font-size: 12px; font-weight: 600; letter-spacing: .18em; text-transform: uppercase; color: var(--suave); margin-right: 4px; }
.tamanhos { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.tam { min-width: 40px; height: 36px; padding: 0 10px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--linha); border-radius: var(--raio); background: #fff; font-size: 14px; text-decoration: none; color: var(--texto); }
.tam:hover { border-color: var(--verde); }
.tam.ativo { background: var(--tinta); border-color: var(--tinta); color: #fff; }
.ordem { display: flex; align-items: center; gap: 16px; font-size: 14px; }
.ordem a { color: var(--suave); text-decoration: none; }
.ordem a:hover { color: var(--tinta); }
.ordem a.ativo { color: var(--tinta); text-decoration: underline; text-underline-offset: 5px; }
.limpar { font-size: 14px; color: var(--verde-escuro); }

/* Grade e cartões */
.grade { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 32px 14px; }
@media (min-width: 768px) { .grade { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 44px 24px; } }
@media (min-width: 1100px) { .grade { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
.card { display: block; color: inherit; text-decoration: none; }
.card-foto { position: relative; aspect-ratio: 4 / 5; overflow: hidden; border-radius: var(--raio); background: var(--papel); }
.card-foto img { width: 100%; height: 100%; object-fit: cover; transition: transform .7s cubic-bezier(.2, .7, .2, 1); }
.card:hover .card-foto img { transform: scale(1.045); }
.selo { position: absolute; top: 10px; left: 10px; padding: 5px 9px; border-radius: var(--raio); background: #fff; color: var(--verde-noite); font-size: 11px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; }
.card-info { padding-top: 14px; }
.card-marca { display: block; margin-bottom: 5px; font-size: 11px; font-weight: 600; letter-spacing: .2em; text-transform: uppercase; color: var(--suave); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.card-titulo { margin: 0 0 9px; font-size: 15px; font-weight: 400; line-height: 1.4; color: var(--tinta); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.card-rodape { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.card-preco { font-size: 17px; font-weight: 600; color: var(--tinta); font-variant-numeric: tabular-nums; }
.card-tam { padding: 2px 9px; border: 1px solid var(--linha); border-radius: 999px; font-size: 12px; color: var(--suave); white-space: nowrap; }
.vazio { padding: 72px 24px; border: 1px dashed #d6d2c9; border-radius: var(--raio); text-align: center; color: var(--suave); }
.vazio h3 { margin: 0 0 8px; font-family: var(--serif); font-size: 22px; font-weight: 400; color: var(--tinta); }
.vazio p { margin: 0 auto 22px; max-width: 42ch; }

/* Pilares */
.pilares { background: #fff; border-top: 1px solid var(--linha); }
.pilares-in { display: grid; gap: 28px; padding-top: 52px; padding-bottom: 52px; }
@media (min-width: 768px) { .pilares-in { grid-template-columns: repeat(3, 1fr); gap: 40px; } }
.pilar { display: flex; gap: 16px; align-items: flex-start; }
.pilar .icone { width: 30px; height: 30px; color: var(--verde-escuro); stroke-width: 1.3; }
.pilar h3 { margin: 0 0 5px; font-family: var(--serif); font-size: 17px; font-weight: 400; color: var(--tinta); }
.pilar p { margin: 0; font-size: 15px; color: var(--suave); }

/* Rodapé */
.rodape { background: var(--verde-noite); color: #dfe8e3; }
.rodape-in { display: grid; gap: 36px; padding-top: 60px; padding-bottom: 40px; }
@media (min-width: 768px) { .rodape-in { grid-template-columns: 1.4fr 1fr 1fr 1fr; gap: 40px; } }
.rodape .logo { width: 104px; height: 104px; color: #fff; }
.rodape-slogan { margin: 18px 0 0; font-family: var(--serif); font-size: 13px; line-height: 1.75; letter-spacing: .08em; text-transform: uppercase; color: #fff; max-width: 26ch; }
.rodape h4 { margin: 0 0 14px; font-size: 12px; font-weight: 600; letter-spacing: .22em; text-transform: uppercase; color: #a9c2b5; }
.rodape p, .rodape li { margin: 0 0 6px; font-size: 15px; line-height: 1.6; }
.rodape ul { list-style: none; margin: 0; padding: 0; }
.rodape a { color: #dfe8e3; text-decoration: none; }
.rodape a:hover { color: #fff; text-decoration: underline; text-underline-offset: 3px; }
.rodape-base { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px 24px; padding-top: 22px; padding-bottom: 30px; border-top: 1px solid rgb(255 255 255 / .12); font-size: 13px; color: #a9c2b5; }

/* Página da peça */
.migalhas { display: flex; flex-wrap: wrap; gap: 8px; padding-top: 22px; padding-bottom: 22px; font-size: 13px; color: var(--suave); }
.migalhas a { text-decoration: none; }
.migalhas a:hover { color: var(--tinta); }
.peca { display: grid; gap: 30px; padding-bottom: 72px; }
@media (min-width: 900px) { .peca { grid-template-columns: minmax(0, 1.12fr) minmax(0, 1fr); gap: 72px; align-items: start; } .peca-foto { position: sticky; top: 100px; } }
.peca-foto { aspect-ratio: 4 / 5; overflow: hidden; border-radius: var(--raio); background: var(--papel); }
.peca-foto img { width: 100%; height: 100%; object-fit: cover; }
@media (max-width: 899px) { .peca-foto { margin: 0 -20px; border-radius: 0; } }
.peca-info h1 { margin: 0 0 18px; font-family: var(--serif); font-size: clamp(26px, 3.2vw, 38px); font-weight: 400; line-height: 1.2; color: var(--tinta); text-wrap: balance; }
.peca-preco { margin: 0; font-size: 30px; font-weight: 600; color: var(--tinta); font-variant-numeric: tabular-nums; }
.peca-pagamento { margin: 4px 0 30px; font-size: 15px; color: var(--suave); }
.etiqueta { display: grid; grid-template-columns: 1fr 1fr; gap: 0 28px; margin: 0 0 28px; padding: 0; }
.etiqueta div { padding: 14px 0 12px; border-top: 1px solid var(--verde); }
.etiqueta dt { margin-bottom: 3px; font-family: var(--serif); font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: var(--verde-escuro); }
.etiqueta dd { margin: 0; font-size: 16px; color: var(--tinta); }
.peca-desc { margin: 0 0 18px; font-size: 16px; line-height: 1.75; color: var(--texto); }
.peca-detalhe { margin: 0 0 26px; padding: 13px 16px; border-radius: var(--raio); background: var(--bruma); font-size: 14px; color: var(--verde-noite); }
.botao { display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; min-height: 58px; padding: 0 26px; border: 0; border-radius: var(--raio); background: var(--verde-escuro); color: #fff; font: 600 14px/1 var(--sans); letter-spacing: .18em; text-transform: uppercase; text-decoration: none; cursor: pointer; transition: background .2s, color .2s; }
.botao:hover { background: var(--verde-noite); }
.botao .icone { width: 18px; height: 18px; }
.hero-acoes .botao { width: auto; }
.botao.secundario { background: transparent; color: var(--tinta); border: 1px solid var(--tinta); }
.botao.secundario:hover { background: var(--tinta); color: #fff; }
.botao + .botao { margin-top: 10px; }
.indisponivel { padding: 18px; border-radius: var(--raio); background: var(--papel); text-align: center; font-weight: 500; color: var(--suave); }
.garantias { display: grid; gap: 15px; margin: 30px 0 0; padding: 26px 0 0; list-style: none; border-top: 1px solid var(--linha); }
.garantias li { display: flex; gap: 13px; align-items: flex-start; font-size: 15px; color: var(--texto); }
.garantias .icone { width: 21px; height: 21px; margin-top: 1px; color: var(--verde-escuro); }
.garantias strong { font-weight: 600; color: var(--tinta); }
.relacionadas { padding-top: 56px; padding-bottom: 80px; border-top: 1px solid var(--linha); }
.relacionadas h2 { margin: 0 0 28px; font-family: var(--serif); font-size: clamp(24px, 2.6vw, 30px); font-weight: 400; color: var(--tinta); }

/* Compra e pedido */
.pagina { padding-top: 34px; padding-bottom: 80px; }
.voltar { display: inline-flex; align-items: center; gap: 8px; margin-bottom: 18px; font-size: 14px; color: var(--suave); text-decoration: none; }
.voltar:hover { color: var(--tinta); }
.titulo-pagina { margin: 0 0 28px; font-family: var(--serif); font-size: clamp(28px, 3vw, 36px); font-weight: 400; color: var(--tinta); }
.checkout { display: grid; gap: 28px; align-items: start; }
@media (min-width: 900px) { .checkout { grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr); gap: 48px; } .checkout-lateral { position: sticky; top: 100px; } }
@media (max-width: 899px) { .checkout-lateral { order: -1; } }
.bloco { margin-bottom: 16px; padding: 26px; border: 1px solid var(--linha); border-radius: var(--raio); background: #fff; }
.bloco h2 { display: flex; align-items: center; gap: 12px; margin: 0 0 6px; font-family: var(--serif); font-size: 20px; font-weight: 400; color: var(--tinta); }
.passo { flex: none; width: 28px; height: 28px; border-radius: 50%; background: var(--verde-escuro); color: #fff; font: 600 13px/28px var(--sans); text-align: center; }
.ajuda { margin: 0 0 4px; font-size: 14px; color: var(--suave); }
.campo { margin-top: 16px; }
.campo label { display: block; margin-bottom: 7px; font-size: 12px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; color: var(--suave); }
.campo input { width: 100%; height: 50px; padding: 0 14px; border: 1px solid var(--linha); border-radius: var(--raio); background: var(--fundo); font: inherit; font-size: 16px; color: var(--tinta); -webkit-appearance: none; }
.campo input:focus { outline: 2px solid var(--verde); outline-offset: -1px; background: #fff; }
.linha { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.opcao { display: flex; gap: 14px; align-items: flex-start; margin-top: 12px; padding: 16px; border: 1px solid var(--linha); border-radius: var(--raio); background: var(--fundo); cursor: pointer; transition: border-color .15s, background .15s; }
.opcao:hover { border-color: var(--verde); }
.opcao:has(input:checked) { border-color: var(--verde-escuro); background: var(--bruma); box-shadow: inset 0 0 0 1px var(--verde-escuro); }
.opcao input { width: 18px; height: 18px; margin: 2px 0 0; accent-color: var(--verde-escuro); }
form:has(input[name="entrega"][value="RETIRADA"]:checked) .bloco-endereco { display: none; }
.totais .total-op { display: none; }
.checkout:has(input[name="entrega"]:checked) .total-generico { display: none; }
.checkout:has(input[value="RETIRADA"]:checked) .totais .total-op[data-op="RETIRADA"],
.checkout:has(input[value="ENTREGA_LOCAL"]:checked) .totais .total-op[data-op="ENTREGA_LOCAL"],
.checkout:has(input[value="CORREIOS"]:checked) .totais .total-op[data-op="CORREIOS"] { display: flex; }
.totais .total-final { margin-top: 6px; padding-top: 12px; border-top: 1px solid var(--linha); font-size: 17px; font-weight: 600; }
.totais .total-final dt { color: var(--tinta); }
.opcao-corpo { flex: 1; min-width: 0; }
.opcao-topo { display: flex; justify-content: space-between; gap: 12px; font-weight: 600; color: var(--tinta); }
.opcao small { display: block; margin-top: 4px; font-size: 14px; color: var(--suave); }
.resumo { display: flex; gap: 16px; align-items: center; }
.resumo img { flex: none; width: 88px; height: 110px; object-fit: cover; border-radius: var(--raio); background: var(--papel); }
.resumo strong { display: block; font-weight: 500; line-height: 1.4; color: var(--tinta); }
.resumo .preco { display: block; margin-top: 6px; font-size: 17px; font-weight: 600; color: var(--tinta); }
.totais { display: grid; gap: 8px; margin: 20px 0 0; padding-top: 16px; border-top: 1px solid var(--linha); font-size: 15px; }
.totais div { display: flex; justify-content: space-between; gap: 12px; }
.totais dt { color: var(--suave); }
.totais dd { margin: 0; color: var(--tinta); text-align: right; }
.nota { display: flex; gap: 10px; align-items: flex-start; margin: 14px 0 0; font-size: 13px; color: var(--suave); }
.nota .icone { width: 16px; height: 16px; margin-top: 2px; color: var(--verde-escuro); }
.erro, .ok, .aviso { margin: 0 0 16px; padding: 14px 16px; border-radius: var(--raio); font-size: 15px; }
.erro { background: #fbefec; border: 1px solid #f0d2ca; color: #8f2f1f; }
.ok { background: var(--bruma); border: 1px solid #cfdfd6; color: var(--verde-noite); }
.aviso { background: #faf5e8; border: 1px solid #efe2bd; color: #6e5212; }
.status { max-width: 580px; margin: 0 auto; text-align: center; }
.status-icone { display: grid; place-items: center; width: 68px; height: 68px; margin: 0 auto 22px; border-radius: 50%; background: var(--bruma); color: var(--verde-escuro); }
.status-icone .icone { width: 32px; height: 32px; stroke-width: 1.7; }
.status-icone.alerta { background: #faf5e8; color: #6e5212; }
.status h1 { margin: 0 0 10px; font-family: var(--serif); font-size: clamp(28px, 3vw, 34px); font-weight: 400; color: var(--tinta); }
.status .sub { margin: 0 0 30px; color: var(--suave); }
.status .bloco { text-align: left; }
`;

function faixa(settings?: StoreSettings | null): string {
  const itens = ['Peças únicas'];
  if (settings && checkoutAtivo(settings)) itens.push('Pix ou cartão em até 12x');
  if (settings?.correios_ativo) itens.push('Enviamos para todo o Brasil');
  else if (settings?.entrega_local_ativa) itens.push(`Entrega em ${settings.entrega_local_cidade}`);
  if (settings?.retirada_ativa) itens.push('Retire na loja');
  if (itens.length === 1) itens.push(SLOGAN);
  return `<div class="faixa">${itens.map((i) => `<span>${escapeHtml(i)}</span>`).join('')}</div>`;
}

function topo(req: Request): string {
  return `<header class="topo">
  <div class="container topo-in">
    <a class="marca" href="${baseUrl(req)}/loja" aria-label="${escapeHtml(LOJA_NOME)}, página inicial">
      ${logoSvg()}
      <span class="marca-nome">Apega Desapega<small>Brechó</small></span>
    </a>
    <nav class="topo-links" aria-label="Principal">
      <a href="${baseUrl(req)}/loja#pecas">${icone('sacola')}<span class="rotulo">Peças</span></a>
      ${INSTAGRAM ? `<a href="https://instagram.com/${encodeURIComponent(INSTAGRAM)}" rel="noopener" target="_blank">${icone('instagram')}<span class="rotulo">Instagram</span></a>` : ''}
    </nav>
  </div>
</header>`;
}

export function pilares(settings?: StoreSettings | null): string {
  const entrega = settings?.correios_ativo
    ? 'Retire na loja em Passo Fundo ou receba em qualquer lugar do Brasil.'
    : 'Retire na loja em Passo Fundo ou receba em casa.';
  return `<section class="pilares" aria-label="Por que comprar aqui">
  <div class="container pilares-in">
    <div class="pilar">${icone('folha')}<div><h3>Moda que circula</h3><p>Cada peça ganha uma nova história e deixa de virar desperdício.</p></div></div>
    ${settings && checkoutAtivo(settings)
      ? `<div class="pilar">${icone('escudo')}<div><h3>Compra segura</h3><p>Pague com Pix ou cartão em até 12x pela InfinitePay. A confirmação é automática.</p></div></div>`
      : `<div class="pilar">${icone('conversa')}<div><h3>Atendimento de perto</h3><p>Ficou com dúvida sobre uma peça? Fale com a gente pelo Instagram ou WhatsApp.</p></div></div>`}
    <div class="pilar">${icone('caminhao')}<div><h3>Do seu jeito</h3><p>${escapeHtml(entrega)}</p></div></div>
  </div>
</section>`;
}

function rodape(req: Request, settings?: StoreSettings | null): string {
  const endereco = settings?.retirada_endereco;
  const horario = settings?.retirada_horario;
  return `<footer class="rodape">
  <div class="container rodape-in">
    <div>
      ${logoSvg()}
      <p class="rodape-slogan">${SLOGAN}</p>
    </div>
    <div>
      <h4>Visite a loja</h4>
      ${endereco ? `<p>${escapeHtml(endereco)}</p>` : '<p>Passo Fundo · RS</p>'}
      ${horario ? `<p>${escapeHtml(horario)}</p>` : ''}
    </div>
    <div>
      <h4>Atendimento</h4>
      <ul>
        ${INSTAGRAM ? `<li><a href="https://instagram.com/${encodeURIComponent(INSTAGRAM)}" rel="noopener" target="_blank">@${escapeHtml(INSTAGRAM)}</a></li>` : ''}
        ${WHATSAPP ? `<li><a href="https://wa.me/${WHATSAPP}" rel="noopener" target="_blank">WhatsApp ${formatTelefone(WHATSAPP)}</a></li>` : ''}
      </ul>
    </div>
    <div>
      <h4>${settings && checkoutAtivo(settings) ? 'Compra segura' : 'Como comprar'}</h4>
      <ul>${settings && checkoutAtivo(settings)
        ? '<li>Pix</li><li>Cartão em até 12x</li><li>Pagamento pela InfinitePay</li>'
        : '<li>Na loja física</li><li>Pelo Instagram ou WhatsApp</li>'}</ul>
    </div>
  </div>
  <div class="container rodape-base">
    <span>© ${new Date().getFullYear()} ${escapeHtml(LOJA_NOME)} · Passo Fundo/RS${CNPJ ? ` · CNPJ ${escapeHtml(CNPJ)}` : ''}</span>
    <a href="${baseUrl(req)}/loja">Ver todas as peças</a>
  </div>
</footer>`;
}

export interface OpcoesPagina {
  descricao?: string;
  meta?: string;
  settings?: StoreSettings | null;
  canonical?: string;
  indexar?: boolean;
}

export function layout(req: Request, titulo: string, conteudo: string, opcoes: OpcoesPagina | string = {}): string {
  const o: OpcoesPagina = typeof opcoes === 'string' ? { meta: opcoes } : opcoes;
  const descricao = o.descricao || `${SLOGAN}. Peças únicas de brechó em Passo Fundo/RS, com compra online por Pix ou cartão.`;
  const indexar = o.indexar ?? false;
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escapeHtml(titulo)}</title>
<meta name="description" content="${escapeHtml(descricao.slice(0, 300))}">
<meta name="robots" content="${indexar ? 'index, follow, max-image-preview:large' : 'noindex, follow'}">
${o.canonical ? `<link rel="canonical" href="${escapeHtml(o.canonical)}">` : ''}
<meta name="theme-color" content="#557f6d">
<meta property="og:site_name" content="${escapeHtml(LOJA_NOME)}">
<meta property="og:locale" content="pt_BR">
<meta name="twitter:card" content="summary_large_image">
${DOMAIN_VERIFICATION ? `<meta name="facebook-domain-verification" content="${escapeHtml(DOMAIN_VERIFICATION)}">` : ''}
<link rel="icon" href="${FAVICON}">
<link rel="preload" href="/loja/assets/fonts/barlow-400.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/loja/assets/fonts/libre-baskerville.woff2" as="font" type="font/woff2" crossorigin>
${o.meta ?? ''}
<style>${CSS}</style>
</head>
<body>
${faixa(o.settings)}
${topo(req)}
<main>${conteudo}</main>
${rodape(req, o.settings)}
</body>
</html>`;
}

export function cardPeca(req: Request, peca: PecaLoja, prioridade = false): string {
  const titulo = tituloPeca(peca);
  const marca = marcaValida(peca.marca);
  return `<a class="card" href="${baseUrl(req)}/loja/p/${peca.id}">
  <div class="card-foto">
    <img src="${escapeHtml(fotoUrl(req, peca))}" alt="${escapeHtml(titulo)}" width="800" height="1000" ${prioridade ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">
    ${ehNova(peca) ? '<span class="selo">Novo</span>' : ''}
  </div>
  <div class="card-info">
    <span class="card-marca">${escapeHtml(marca || rotuloTipo(peca.descricao))}</span>
    <h3 class="card-titulo">${escapeHtml(titulo)}</h3>
    <div class="card-rodape">
      <span class="card-preco">${formatBRL(peca.valor_venda)}</span>
      ${peca.tamanho ? `<span class="card-tam">${escapeHtml(peca.tamanho)}</span>` : ''}
    </div>
  </div>
</a>`;
}

// Dados estruturados (schema.org) para o Google mostrar preço, disponibilidade e a loja
export function jsonLd(dados: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(dados).replace(/</g, '\\u003c')}</script>`;
}

export function dadosLoja(req: Request, settings?: StoreSettings | null) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ClothingStore',
    name: LOJA_NOME,
    slogan: SLOGAN,
    url: `${baseUrl(req)}/loja`,
    ...(WHATSAPP ? { telephone: `+${WHATSAPP}` } : {}),
    ...(settings?.retirada_endereco ? {
      address: { '@type': 'PostalAddress', streetAddress: settings.retirada_endereco, addressLocality: 'Passo Fundo', addressRegion: 'RS', addressCountry: 'BR' }
    } : {}),
    ...(INSTAGRAM ? { sameAs: [`https://instagram.com/${INSTAGRAM}`] } : {}),
  };
}
