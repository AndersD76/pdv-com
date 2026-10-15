import express, { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { sql, query, withTransaction } from '../database.js';
import { HttpError, sendError, round2 } from '../utils/http.js';
import { getStoreSettings, saveStoreSettings, storeSettingsSchema, checkoutAtivo, StoreSettings } from '../services/storeSettings.js';
import { createCheckoutLink, checkPayment } from '../services/infinitepay.js';
import { reservaAtivaAte } from '../services/reservas.js';
import {
  layout, escapeHtml, formatBRL, tituloPeca, fotoUrl, baseUrl, buscarPecaDigital, WHATSAPP, LOJA_NOME, PecaLoja
} from './loja.controller.js';

// Checkout da loja online: o cliente paga pela InfinitePay (Pix ou cartão) e o sistema
// confirma sozinho, registra a venda e avisa a loja para separar a peça.

type Entrega = 'RETIRADA' | 'ENTREGA_LOCAL' | 'CORREIOS';

interface OnlineOrder {
  id: number;
  codigo: string;
  order_nsu: string;
  product_id: number;
  status: string;
  valor_produto: number;
  valor_frete: number;
  valor_total: number;
  entrega: Entrega;
  cliente_nome: string;
  cliente_telefone: string;
  checkout_url: string | null;
  expira_em: Date;
  receipt_url: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function opcoesEntrega(settings: StoreSettings): Array<{ valor: Entrega; titulo: string; detalhe: string; frete: number }> {
  const opcoes: Array<{ valor: Entrega; titulo: string; detalhe: string; frete: number }> = [];
  if (settings.retirada_ativa) {
    opcoes.push({
      valor: 'RETIRADA',
      titulo: 'Retirar na loja',
      detalhe: [settings.retirada_endereco, settings.retirada_horario].filter(Boolean).join(' · '),
      frete: 0
    });
  }
  if (settings.entrega_local_ativa) {
    opcoes.push({ valor: 'ENTREGA_LOCAL', titulo: `Entrega em ${settings.entrega_local_cidade}`, detalhe: 'Levamos até você', frete: settings.entrega_local_taxa });
  }
  if (settings.correios_ativo) {
    opcoes.push({ valor: 'CORREIOS', titulo: 'Envio pelos Correios', detalhe: 'Para todo o Brasil', frete: settings.correios_taxa });
  }
  return opcoes;
}

const normalizarCidade = (cidade: string) => cidade.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

const formSchema = z.object({
  nome: z.string().trim().min(3, 'Informe seu nome completo').max(120),
  telefone: z.string().transform((v) => v.replace(/\D/g, '')).refine((v) => v.length >= 10 && v.length <= 13, 'Informe um WhatsApp válido com DDD'),
  email: z.string().trim().email('E-mail inválido').max(200).optional().or(z.literal('')),
  entrega: z.enum(['RETIRADA', 'ENTREGA_LOCAL', 'CORREIOS'], { errorMap: () => ({ message: 'Escolha como quer receber a peça' }) }),
  cep: z.string().transform((v) => v.replace(/\D/g, '')).optional(),
  endereco: z.string().trim().max(255).optional(),
  numero: z.string().trim().max(20).optional(),
  complemento: z.string().trim().max(100).optional(),
  bairro: z.string().trim().max(100).optional(),
  cidade: z.string().trim().max(100).optional(),
  uf: z.string().trim().toUpperCase().max(2).optional()
}).superRefine((data, ctx) => {
  if (data.entrega === 'RETIRADA') return;
  if (!data.cep || data.cep.length !== 8) ctx.addIssue({ code: 'custom', message: 'Informe o CEP (8 números)', path: ['cep'] });
  if (!data.endereco) ctx.addIssue({ code: 'custom', message: 'Informe a rua', path: ['endereco'] });
  if (!data.numero) ctx.addIssue({ code: 'custom', message: 'Informe o número', path: ['numero'] });
  if (!data.bairro) ctx.addIssue({ code: 'custom', message: 'Informe o bairro', path: ['bairro'] });
  if (!data.cidade) ctx.addIssue({ code: 'custom', message: 'Informe a cidade', path: ['cidade'] });
  if (!data.uf || data.uf.length !== 2) ctx.addIssue({ code: 'custom', message: 'Informe o estado (UF)', path: ['uf'] });
});

type FormData = Partial<Record<keyof z.input<typeof formSchema>, string>>;

// Limite de pedidos por IP: evita que alguém reserve todas as peças sem pagar
const MAX_PEDIDOS_POR_IP = 6;
const JANELA_PEDIDOS_MS = 10 * 60 * 1000;
const pedidosPorIp = new Map<string, number[]>();

function registrarTentativa(ip: string) {
  const agora = Date.now();
  if (pedidosPorIp.size > 10_000) pedidosPorIp.clear();
  const recentes = (pedidosPorIp.get(ip) ?? []).filter((t) => t > agora - JANELA_PEDIDOS_MS);
  if (recentes.length >= MAX_PEDIDOS_POR_IP) {
    throw new HttpError(429, 'Muitas tentativas de compra. Aguarde alguns minutos.');
  }
  recentes.push(agora);
  pedidosPorIp.set(ip, recentes);
}

// ==================== PÁGINAS PÚBLICAS ====================

function resumoPeca(req: Request, peca: PecaLoja): string {
  return `
    <div class="resumo">
      <img src="${escapeHtml(fotoUrl(req, peca))}" alt="">
      <div><strong>${escapeHtml(tituloPeca(peca))}</strong><br><span class="preco">${formatBRL(peca.valor_venda)}</span></div>
    </div>`;
}

function formularioCompra(req: Request, peca: PecaLoja, settings: StoreSettings, valores: FormData = {}, erro = ''): string {
  const campo = (nome: keyof FormData, rotulo: string, tipo = 'text', extra = '') =>
    `<label for="${nome}">${rotulo}</label><input type="${tipo}" id="${nome}" name="${nome}" value="${escapeHtml(valores[nome] ?? '')}" ${extra}>`;

  const opcoes = opcoesEntrega(settings).map((opcao, index) => `
    <label class="opcao">
      <input type="radio" name="entrega" value="${opcao.valor}" ${valores.entrega === opcao.valor || (!valores.entrega && index === 0) ? 'checked' : ''}>
      <span>
        <strong>${escapeHtml(opcao.titulo)}</strong> · ${opcao.frete > 0 ? `+ ${formatBRL(opcao.frete)}` : 'grátis'}
        <small>${escapeHtml(opcao.detalhe)}</small>
        <small>Total: <strong>${formatBRL(round2(peca.valor_venda + opcao.frete))}</strong></small>
      </span>
    </label>`).join('');

  const precisaEndereco = settings.entrega_local_ativa || settings.correios_ativo;

  return `
    <div class="caixa">
      <h1>Finalizar compra</h1>
      ${resumoPeca(req, peca)}
    </div>
    <form class="caixa form" method="post" action="${baseUrl(req)}/loja/comprar/${peca.id}">
      ${erro ? `<p class="erro">${escapeHtml(erro)}</p>` : ''}
      <h2>Seus dados</h2>
      ${campo('nome', 'Nome completo', 'text', 'required autocomplete="name"')}
      ${campo('telefone', 'WhatsApp com DDD', 'tel', 'required autocomplete="tel" inputmode="tel"')}
      ${campo('email', 'E-mail (opcional, para o comprovante)', 'email', 'autocomplete="email"')}
      <h2 style="margin-top:20px">Como quer receber?</h2>
      ${opcoes}
      ${precisaEndereco ? `
        <h2 style="margin-top:20px">Endereço de entrega</h2>
        <p class="total">Preencha apenas se escolheu entrega ou Correios.</p>
        <div class="linha">
          <div>${campo('cep', 'CEP', 'text', 'inputmode="numeric" autocomplete="postal-code"')}</div>
          <div>${campo('uf', 'Estado (UF)', 'text', 'maxlength="2" autocomplete="address-level1"')}</div>
        </div>
        ${campo('cidade', 'Cidade', 'text', 'autocomplete="address-level2"')}
        ${campo('endereco', 'Rua', 'text', 'autocomplete="address-line1"')}
        <div class="linha">
          <div>${campo('numero', 'Número')}</div>
          <div>${campo('complemento', 'Complemento')}</div>
        </div>
        ${campo('bairro', 'Bairro')}` : ''}
      <p class="total" style="margin-top:16px">A peça fica reservada para você por ${settings.reserva_minutos} minutos enquanto o pagamento é concluído.</p>
      <button class="botao" type="submit">Ir para o pagamento · Pix ou cartão</button>
    </form>`;
}

async function paginaCompra(req: Request, res: Response) {
  try {
    const peca = await buscarPecaDigital(req.params.id);
    if (!peca) return res.status(404).send(layout(req, LOJA_NOME, '<p class="vazio">Peça não encontrada.</p>'));

    const settings = await getStoreSettings();
    let aviso = '';
    if (!checkoutAtivo(settings)) aviso = 'A compra online está temporariamente indisponível.';
    else if (peca.status !== 'DISPONIVEL') aviso = 'Esta peça já foi vendida.';
    else if (await reservaAtivaAte(peca.id)) aviso = 'Esta peça está reservada para outro cliente que está finalizando o pagamento. Volte em alguns minutos.';

    if (aviso) {
      const contato = WHATSAPP ? `<a class="botao whatsapp" href="https://wa.me/${WHATSAPP}" rel="noopener">Falar com a loja</a>` : '';
      return res.send(layout(req, LOJA_NOME, `<div class="caixa">${resumoPeca(req, peca)}<p class="aviso">${escapeHtml(aviso)}</p>${contato}</div>`));
    }

    res.setHeader('Cache-Control', 'no-store');
    res.send(layout(req, `Comprar | ${LOJA_NOME}`, formularioCompra(req, peca, settings)));
  } catch (error) {
    console.error('Erro ao abrir a compra:', error);
    res.status(500).send('Erro ao carregar a página de compra');
  }
}

async function criarPedido(req: Request, res: Response) {
  const valores = (req.body ?? {}) as FormData;
  let peca: PecaLoja | null = null;
  let settings: StoreSettings | null = null;

  try {
    peca = await buscarPecaDigital(req.params.id);
    if (!peca) return res.status(404).send(layout(req, LOJA_NOME, '<p class="vazio">Peça não encontrada.</p>'));

    settings = await getStoreSettings();
    if (!checkoutAtivo(settings)) throw new HttpError(503, 'A compra online está temporariamente indisponível.');

    const dados = formSchema.parse(valores);
    const opcao = opcoesEntrega(settings).find((o) => o.valor === dados.entrega);
    if (!opcao) throw new HttpError(400, 'Forma de entrega indisponível. Escolha outra.');
    if (dados.entrega === 'ENTREGA_LOCAL' && normalizarCidade(dados.cidade || '') !== normalizarCidade(settings.entrega_local_cidade)) {
      throw new HttpError(400, `A entrega local é só em ${settings.entrega_local_cidade}. Para outras cidades, escolha os Correios.`);
    }

    registrarTentativa(req.ip || 'desconhecido');
    const reservaMinutos = settings.reserva_minutos;
    const pecaId = peca.id;

    // Reserva a peça dentro de uma transação: duas compras simultâneas não pegam a mesma peça
    const pedido = await withTransaction(async (tx) => {
      const produto = await tx.queryOne<{ status: string; canal: string; valor_venda: number }>(
        'SELECT status, canal, valor_venda FROM products WHERE id = $1 FOR UPDATE',
        [pecaId]
      );
      if (!produto || produto.canal !== 'DIGITAL') throw new HttpError(404, 'Peça não encontrada.');
      if (produto.status !== 'DISPONIVEL') throw new HttpError(409, 'Esta peça acabou de ser vendida.');

      const reservada = await tx.queryOne(
        `SELECT 1 FROM online_orders WHERE product_id = $1 AND status = 'AGUARDANDO_PAGAMENTO' AND expira_em > now()`,
        [pecaId]
      );
      if (reservada) throw new HttpError(409, 'Esta peça está reservada para outro cliente. Volte em alguns minutos.');

      const frete = round2(opcao.frete);
      return tx.queryOne<OnlineOrder>(
        `INSERT INTO online_orders (
           codigo, order_nsu, product_id, valor_produto, valor_frete, valor_total, entrega,
           cliente_nome, cliente_telefone, cliente_email, cep, endereco, numero, complemento, bairro, cidade, uf,
           expira_em, ip
         ) VALUES (
           'P' || LPAD(nextval('online_orders_codigo_seq')::text, 5, '0'), $1, $2, $3, $4, $5, $6,
           $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
           now() + make_interval(mins => $17), $18
         ) RETURNING *`,
        [
          crypto.randomUUID(), pecaId, produto.valor_venda, frete, round2(produto.valor_venda + frete), dados.entrega,
          dados.nome, dados.telefone, dados.email || null,
          dados.entrega === 'RETIRADA' ? null : dados.cep, dados.entrega === 'RETIRADA' ? null : dados.endereco,
          dados.entrega === 'RETIRADA' ? null : dados.numero, dados.entrega === 'RETIRADA' ? null : (dados.complemento || null),
          dados.entrega === 'RETIRADA' ? null : dados.bairro, dados.entrega === 'RETIRADA' ? null : dados.cidade,
          dados.entrega === 'RETIRADA' ? null : dados.uf,
          reservaMinutos, req.ip || null
        ]
      );
    });

    // Link de pagamento na InfinitePay (fora da transação: chamada de rede)
    const telefone = dados.telefone.startsWith('55') ? dados.telefone : `55${dados.telefone}`;
    const itens = [{ description: tituloPeca(peca).slice(0, 100), quantity: 1, price: Math.round(pedido!.valor_produto * 100) }];
    if (pedido!.valor_frete > 0) {
      itens.push({ description: opcao.titulo, quantity: 1, price: Math.round(pedido!.valor_frete * 100) });
    }

    let link;
    try {
      link = await createCheckoutLink({
        handle: settings.infinitepay_handle,
        orderNsu: pedido!.order_nsu,
        items: itens,
        redirectUrl: `${baseUrl(req)}/loja/pedido/${pedido!.order_nsu}`,
        webhookUrl: `${baseUrl(req)}/loja/webhook/infinitepay`,
        customer: { name: dados.nome, phone_number: `+${telefone}`, ...(dados.email ? { email: dados.email } : {}) },
        ...(dados.entrega !== 'RETIRADA' ? {
          address: {
            cep: dados.cep!, street: dados.endereco!, neighborhood: dados.bairro!, number: dados.numero!,
            ...(dados.complemento ? { complement: dados.complemento } : {})
          }
        } : {})
      });
    } catch (error) {
      // Sem link de pagamento, libera a peça na hora
      await sql`UPDATE online_orders SET status = 'CANCELADO', updated_at = CURRENT_TIMESTAMP WHERE id = ${pedido!.id}`;
      throw error;
    }

    await sql`
      UPDATE online_orders SET checkout_url = ${link.url}, invoice_slug = ${link.slug}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${pedido!.id}
    `;

    res.redirect(303, link.url);
  } catch (error) {
    let status = 500;
    let mensagem = 'Não foi possível iniciar a compra. Tente novamente.';
    if (error instanceof z.ZodError) {
      status = 400;
      mensagem = error.errors.map((e) => e.message).join(' · ');
    } else if (error instanceof HttpError) {
      status = error.status;
      mensagem = error.message;
    } else {
      console.error('Erro ao criar pedido online:', error);
    }

    if (peca && settings && checkoutAtivo(settings) && status === 400) {
      return res.status(400).send(layout(req, `Comprar | ${LOJA_NOME}`, formularioCompra(req, peca, settings, valores, mensagem)));
    }
    res.status(status).send(layout(req, LOJA_NOME, `<div class="caixa"><p class="erro">${escapeHtml(mensagem)}</p><a class="botao secundario" href="${baseUrl(req)}/loja">Voltar à loja</a></div>`));
  }
}

const formaPagamento = (captureMethod: string | null) => (captureMethod === 'pix' ? 'PIX' : 'CARTAO_CREDITO');

// Confirma o pagamento consultando a InfinitePay e, se pago, registra a venda e marca a peça como vendida.
// Pode ser chamada várias vezes (webhook repetido, retorno do cliente): só a primeira registra a venda.
async function confirmarPagamento(orderNsu: string, info: { transactionNsu: string; slug: string; receiptUrl?: string | null }) {
  const [pedido] = await sql`SELECT * FROM online_orders WHERE order_nsu = ${orderNsu}` as OnlineOrder[];
  if (!pedido || pedido.status !== 'AGUARDANDO_PAGAMENTO') return pedido ?? null;

  const settings = await getStoreSettings();
  const pagamento = await checkPayment({
    handle: settings.infinitepay_handle,
    orderNsu,
    transactionNsu: info.transactionNsu,
    slug: info.slug
  });
  if (!pagamento.paid) return pedido;

  const esperado = Math.round(pedido.valor_total * 100);
  if (pagamento.amount < esperado) {
    console.error(`Pedido ${pedido.codigo}: valor pago (${pagamento.amount}) menor que o esperado (${esperado}); não confirmado`);
    return pedido;
  }

  const dadosPagamento = [
    formaPagamento(pagamento.captureMethod), pagamento.installments, round2(pagamento.paidAmount / 100),
    info.transactionNsu, info.slug, info.receiptUrl || null
  ];

  return withTransaction(async (tx) => {
    const atual = await tx.queryOne<OnlineOrder>('SELECT * FROM online_orders WHERE id = $1 FOR UPDATE', [pedido.id]);
    if (!atual || atual.status !== 'AGUARDANDO_PAGAMENTO') return atual;

    const produto = await tx.queryOne<{ status: string }>('SELECT status FROM products WHERE id = $1 FOR UPDATE', [atual.product_id]);

    // Pagou depois que a reserva venceu e a peça já tinha sido vendida: a loja precisa estornar
    if (!produto || produto.status !== 'DISPONIVEL') {
      return tx.queryOne<OnlineOrder>(
        `UPDATE online_orders SET status = 'PAGO_SEM_ESTOQUE', pago_em = now(), forma_pagamento = $2, parcelas = $3,
           valor_pago = $4, transaction_nsu = $5, invoice_slug = $6, receipt_url = $7, updated_at = now()
         WHERE id = $1 RETURNING *`,
        [atual.id, ...dadosPagamento]
      );
    }

    const venda = await tx.queryOne<{ id: number }>(
      `INSERT INTO sales (codigo, valor_total, desconto, valor_final, forma_pagamento, cliente_nome, origem)
       VALUES ('V' || LPAD(nextval('sales_codigo_seq')::text, 5, '0'), $1, 0, $1, $2, $3, 'ONLINE')
       RETURNING id`,
      [atual.valor_produto, dadosPagamento[0], atual.cliente_nome]
    );
    await tx.query(
      'INSERT INTO sale_items (venda_id, produto_id, valor_unitario) VALUES ($1, $2, $3)',
      [venda!.id, atual.product_id, atual.valor_produto]
    );
    await tx.query(`UPDATE products SET status = 'VENDIDO', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [atual.product_id]);

    return tx.queryOne<OnlineOrder>(
      `UPDATE online_orders SET status = 'PAGO', pago_em = now(), forma_pagamento = $2, parcelas = $3,
         valor_pago = $4, transaction_nsu = $5, invoice_slug = $6, receipt_url = $7, venda_id = $8, updated_at = now()
       WHERE id = $1 RETURNING *`,
      [atual.id, ...dadosPagamento, venda!.id]
    );
  });
}

// Webhook da InfinitePay (pagamento aprovado). Não é assinado: por isso o pagamento é sempre conferido na API.
async function webhookInfinitepay(req: Request, res: Response) {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const orderNsu = String(body.order_nsu ?? '');
  const transactionNsu = String(body.transaction_nsu ?? '');
  const slug = String(body.invoice_slug ?? body.slug ?? '');

  if (!UUID_RE.test(orderNsu) || !transactionNsu || !slug) {
    return res.status(400).json({ success: false, message: 'Dados incompletos' });
  }

  try {
    const pedido = await confirmarPagamento(orderNsu, {
      transactionNsu, slug, receiptUrl: typeof body.receipt_url === 'string' ? body.receipt_url : null
    });
    // Pedido desconhecido também responde 200 para a InfinitePay não ficar reenviando
    res.status(200).json({ success: true, status: pedido?.status ?? 'IGNORADO' });
  } catch (error) {
    console.error('Erro no webhook da InfinitePay:', error);
    res.status(400).json({ success: false, message: 'Erro ao processar; tente novamente' });
  }
}

// Página para onde o cliente volta depois de pagar (também confirma, caso o webhook atrase)
async function paginaPedido(req: Request, res: Response) {
  try {
    const orderNsu = req.params.nsu;
    if (!UUID_RE.test(orderNsu)) return res.status(404).send(layout(req, LOJA_NOME, '<p class="vazio">Pedido não encontrado.</p>'));

    const transactionNsu = typeof req.query.transaction_nsu === 'string' ? req.query.transaction_nsu : '';
    const slug = typeof req.query.slug === 'string' ? req.query.slug : '';
    if (transactionNsu && slug) {
      await confirmarPagamento(orderNsu, {
        transactionNsu, slug, receiptUrl: typeof req.query.receipt_url === 'string' ? req.query.receipt_url : null
      }).catch((error) => console.error('Erro ao confirmar pagamento no retorno do cliente:', error));
    }

    const [pedido] = await sql`
      SELECT o.*, p.descricao, p.titulo_loja, p.marca, p.tamanho
      FROM online_orders o JOIN products p ON p.id = o.product_id
      WHERE o.order_nsu = ${orderNsu}
    ` as Array<OnlineOrder & { descricao: string; titulo_loja: string | null; marca: string | null; tamanho: string | null; pago_em: Date | null }>;
    if (!pedido) return res.status(404).send(layout(req, LOJA_NOME, '<p class="vazio">Pedido não encontrado.</p>'));

    const settings = await getStoreSettings();
    const titulo = pedido.titulo_loja || pedido.descricao;
    const entrega = {
      RETIRADA: `Retire na loja: ${[settings.retirada_endereco, settings.retirada_horario].filter(Boolean).join(' · ')}. Leve o número do pedido.`,
      ENTREGA_LOCAL: 'Vamos entregar no endereço informado. A loja vai combinar o horário pelo WhatsApp.',
      CORREIOS: 'Vamos postar pelos Correios e enviar o código de rastreio pelo WhatsApp.'
    }[pedido.entrega];
    const expirado = pedido.status === 'AGUARDANDO_PAGAMENTO' && new Date(pedido.expira_em).getTime() < Date.now();

    let corpo: string;
    let refresh = '';
    if (['PAGO', 'SEPARADO', 'ENTREGUE'].includes(pedido.status)) {
      corpo = `<p class="ok"><strong>Pagamento confirmado!</strong> Obrigado pela compra.</p>
        <p>Pedido <strong>${escapeHtml(pedido.codigo)}</strong> · ${escapeHtml(titulo)} · ${formatBRL(pedido.valor_total)}</p>
        <p>${escapeHtml(entrega)}</p>
        ${pedido.receipt_url ? `<a class="botao secundario" href="${escapeHtml(pedido.receipt_url)}" rel="noopener">Ver comprovante</a>` : ''}`;
    } else if (pedido.status === 'PAGO_SEM_ESTOQUE') {
      corpo = `<p class="aviso">Recebemos seu pagamento, mas a peça foi vendida antes da confirmação. A loja vai entrar em contato pelo WhatsApp para devolver o valor.</p>
        <p>Pedido <strong>${escapeHtml(pedido.codigo)}</strong></p>`;
    } else if (pedido.status === 'CANCELADO' || expirado) {
      corpo = `<p class="aviso">Este pedido não foi pago a tempo e a reserva expirou.</p>
        <a class="botao" href="${baseUrl(req)}/loja/p/${pedido.product_id}">Ver a peça novamente</a>`;
    } else {
      refresh = '<meta http-equiv="refresh" content="10">';
      corpo = `<p class="aviso">Aguardando a confirmação do pagamento… Esta página atualiza sozinha.</p>
        <p>Pedido <strong>${escapeHtml(pedido.codigo)}</strong> · ${formatBRL(pedido.valor_total)}</p>
        ${pedido.checkout_url ? `<a class="botao" href="${escapeHtml(pedido.checkout_url)}" rel="noopener">Voltar ao pagamento</a>` : ''}`;
    }

    const contato = WHATSAPP ? `<a class="botao whatsapp" href="https://wa.me/${WHATSAPP}?text=${encodeURIComponent(`Olá! Sobre o pedido ${pedido.codigo}`)}" rel="noopener">Falar com a loja</a>` : '';
    res.setHeader('Cache-Control', 'no-store');
    res.send(layout(req, `Pedido ${pedido.codigo} | ${LOJA_NOME}`, `<div class="caixa"><h1>Pedido ${escapeHtml(pedido.codigo)}</h1>${corpo}${contato}</div>`, refresh));
  } catch (error) {
    console.error('Erro ao exibir pedido:', error);
    res.status(500).send('Erro ao carregar o pedido');
  }
}

export const checkoutRouter = Router();
checkoutRouter.get('/comprar/:id', paginaCompra);
checkoutRouter.post('/comprar/:id', express.urlencoded({ extended: false, limit: '20kb' }), criarPedido);
checkoutRouter.get('/pedido/:nsu', paginaPedido);
checkoutRouter.post('/webhook/infinitepay', webhookInfinitepay);

// ==================== API INTERNA (usuários logados) ====================

const statusSchema = z.object({
  status: z.enum(['SEPARADO', 'ENTREGUE', 'CANCELADO'])
});

// Transições permitidas a partir de cada status
const TRANSICOES: Record<string, string[]> = {
  AGUARDANDO_PAGAMENTO: ['CANCELADO'],
  PAGO: ['SEPARADO', 'ENTREGUE'],
  SEPARADO: ['ENTREGUE'],
  PAGO_SEM_ESTOQUE: ['CANCELADO']
};

export async function listarPedidos(req: Request, res: Response) {
  try {
    const { status } = req.query;
    const params: unknown[] = [];
    let where = '';
    if (typeof status === 'string' && status) {
      params.push(status.split(','));
      where = `WHERE o.status = ANY($1::text[])`;
    }

    const pedidos = await query(`
      SELECT o.*, p.codigo_barras, p.descricao, p.titulo_loja, p.tamanho, p.marca,
        (o.status = 'AGUARDANDO_PAGAMENTO' AND o.expira_em < now()) as expirado,
        pp.updated_at as foto_atualizada_em
      FROM online_orders o
      JOIN products p ON p.id = o.product_id
      LEFT JOIN product_photos pp ON pp.product_id = p.id
      ${where}
      ORDER BY
        CASE o.status WHEN 'PAGO' THEN 0 WHEN 'PAGO_SEM_ESTOQUE' THEN 1 WHEN 'SEPARADO' THEN 2 ELSE 3 END,
        o.created_at DESC
      LIMIT 300
    `, params);

    res.json(pedidos);
  } catch (error) {
    sendError(res, error, 'Erro ao listar pedidos');
  }
}

// Contagem para o alerta no topo do sistema
export async function resumoPedidos(_req: Request, res: Response) {
  try {
    const [resumo] = await sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'PAGO') as para_separar,
        COUNT(*) FILTER (WHERE status = 'PAGO_SEM_ESTOQUE') as sem_estoque,
        COUNT(*) FILTER (WHERE status = 'AGUARDANDO_PAGAMENTO' AND expira_em > now()) as aguardando
      FROM online_orders
    `;
    res.json(resumo);
  } catch (error) {
    sendError(res, error, 'Erro ao carregar pedidos');
  }
}

export async function atualizarStatusPedido(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    const { status } = statusSchema.parse(req.body);

    const [pedido] = await sql`SELECT status FROM online_orders WHERE id = ${id}`;
    if (!pedido) throw new HttpError(404, 'Pedido não encontrado');
    if (!(TRANSICOES[String(pedido.status)] ?? []).includes(status)) {
      throw new HttpError(400, `Não é possível mudar de ${pedido.status} para ${status}`);
    }
    if (status === 'CANCELADO' && req.user?.perfil !== 'admin') {
      throw new HttpError(403, 'Só o administrador pode cancelar pedidos');
    }

    const [atualizado] = await sql`
      UPDATE online_orders
      SET status = ${status},
          separado_em = CASE WHEN ${status} = 'SEPARADO' THEN now() ELSE separado_em END,
          entregue_em = CASE WHEN ${status} = 'ENTREGUE' THEN now() ELSE entregue_em END,
          updated_at = now()
      WHERE id = ${id} AND status = ${String(pedido.status)}
      RETURNING *
    `;
    if (!atualizado) throw new HttpError(409, 'O pedido mudou de status; atualize a tela');

    res.json(atualizado);
  } catch (error) {
    sendError(res, error, 'Erro ao atualizar pedido');
  }
}

export async function getConfiguracaoLoja(_req: Request, res: Response) {
  try {
    const settings = await getStoreSettings();
    res.json({ ...settings, checkout_ativo: checkoutAtivo(settings) });
  } catch (error) {
    sendError(res, error, 'Erro ao carregar configurações da loja');
  }
}

export async function salvarConfiguracaoLoja(req: Request, res: Response) {
  try {
    const dados = storeSettingsSchema.parse({
      ...req.body,
      infinitepay_handle: String(req.body?.infinitepay_handle ?? '').replace(/^\$/, '').trim()
    });
    const settings = await saveStoreSettings(dados);
    res.json({ ...settings, checkout_ativo: checkoutAtivo(settings) });
  } catch (error) {
    sendError(res, error, 'Erro ao salvar configurações da loja');
  }
}
