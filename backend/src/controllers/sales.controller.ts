import { Request, Response } from 'express';
import { sql, query, withTransaction, APP_TIMEZONE } from '../database.js';
import { z } from 'zod';
import { HttpError, sendError, parseDateParam, todayInAppTimezone, round2 } from '../utils/http.js';

const saleSchema = z.object({
  // O preço de cada item vem do cadastro do produto; valores enviados pelo cliente são ignorados
  itens: z.array(z.object({
    produto_id: z.number().int().positive()
  })).min(1, 'Pelo menos um item é obrigatório'),
  desconto: z.number().min(0).default(0),
  forma_pagamento: z.enum(['DINHEIRO', 'PIX', 'CARTAO_CREDITO', 'CARTAO_DEBITO']),
  cliente_nome: z.string().max(255).optional(),
  vendedora_id: z.number().int().positive().optional()
});

const cancelSchema = z.object({
  motivo: z.string().trim().max(500).optional()
});

// Data local (fuso do negócio) de uma coluna TIMESTAMPTZ, para filtros por dia
const localSaleDate = (tzParam: string) => `(s.data_venda AT TIME ZONE ${tzParam})::date`;

// Listar vendas
export async function getAll(req: Request, res: Response) {
  try {
    const inicio = parseDateParam(req.query.inicio, 'inicio');
    const fim = parseDateParam(req.query.fim, 'fim');
    const { vendedora_id, forma_pagamento, status } = req.query;

    let queryStr = `
      SELECT s.*,
        sl.nome as vendedora_nome,
        (SELECT COUNT(*) FROM sale_items WHERE venda_id = s.id) as total_itens
      FROM sales s
      LEFT JOIN sellers sl ON sl.id = s.vendedora_id
      WHERE 1=1
    `;

    const params: unknown[] = [];

    if (inicio || fim) {
      params.push(APP_TIMEZONE);
      const tz = `$${params.length}`;
      if (inicio) {
        params.push(inicio);
        queryStr += ` AND ${localSaleDate(tz)} >= $${params.length}::date`;
      }
      if (fim) {
        params.push(fim);
        queryStr += ` AND ${localSaleDate(tz)} <= $${params.length}::date`;
      }
    }

    if (vendedora_id) {
      params.push(Number(vendedora_id));
      queryStr += ` AND s.vendedora_id = $${params.length}`;
    }

    if (forma_pagamento) {
      params.push(forma_pagamento);
      queryStr += ` AND s.forma_pagamento = $${params.length}`;
    }

    if (status) {
      params.push(status);
      queryStr += ` AND s.status = $${params.length}`;
    }

    queryStr += ' ORDER BY s.data_venda DESC LIMIT 500';

    const sales = await query(queryStr, params);
    res.json(sales);
  } catch (error) {
    sendError(res, error, 'Erro ao listar vendas');
  }
}

// Buscar venda por ID
export async function getById(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const [sale] = await sql`
      SELECT s.*, sl.nome as vendedora_nome
      FROM sales s
      LEFT JOIN sellers sl ON sl.id = s.vendedora_id
      WHERE s.id = ${id}
    `;

    if (!sale) {
      return res.status(404).json({ error: 'Venda não encontrada' });
    }

    const items = await sql`
      SELECT si.*, p.codigo_barras, p.descricao, p.cor, p.marca, p.tamanho,
        p.valor_compra, cl.codigo as lista_codigo, sup.nome as fornecedor_nome
      FROM sale_items si
      JOIN products p ON p.id = si.produto_id
      JOIN consignment_lists cl ON cl.id = p.lista_id
      JOIN suppliers sup ON sup.id = cl.fornecedor_id
      WHERE si.venda_id = ${id}
    `;

    res.json({ ...sale, items });
  } catch (error) {
    sendError(res, error, 'Erro ao buscar venda');
  }
}

// Criar venda
export async function create(req: Request, res: Response) {
  try {
    const data = saleSchema.parse(req.body);
    const productIds = data.itens.map(i => i.produto_id);

    if (new Set(productIds).size !== productIds.length) {
      return res.status(400).json({ error: 'O mesmo produto foi informado mais de uma vez' });
    }

    const saleId = await withTransaction(async (tx) => {
      // FOR UPDATE trava as peças: uma segunda venda simultânea espera esta terminar
      // e então enxerga o status VENDIDO
      const products = await tx.query<{ id: number; codigo_barras: string; status: string; valor_venda: number }>(
        'SELECT id, codigo_barras, status, valor_venda FROM products WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE',
        [productIds]
      );

      if (products.length !== productIds.length) {
        throw new HttpError(400, 'Um ou mais produtos não foram encontrados');
      }

      const unavailable = products.filter((p) => p.status !== 'DISPONIVEL');
      if (unavailable.length > 0) {
        throw new HttpError(409, `Produto(s) não disponível(is) para venda: ${unavailable.map(p => p.codigo_barras).join(', ')}`);
      }

      // Peça reservada por um cliente que está pagando na loja online não pode ser vendida no balcão
      const reservadas = await tx.query<{ codigo_barras: string }>(
        `SELECT p.codigo_barras FROM online_orders o JOIN products p ON p.id = o.product_id
         WHERE o.product_id = ANY($1::int[]) AND o.status = 'AGUARDANDO_PAGAMENTO' AND o.expira_em > now()`,
        [productIds]
      );
      if (reservadas.length > 0) {
        throw new HttpError(409, `Peça(s) reservada(s) para um pedido online em pagamento: ${reservadas.map(p => p.codigo_barras).join(', ')}`);
      }

      const desconto = round2(data.desconto);
      const valorTotal = round2(products.reduce((sum, p) => sum + p.valor_venda, 0));
      const valorFinal = round2(valorTotal - desconto);

      if (valorFinal < 0) {
        throw new HttpError(400, 'Desconto não pode ser maior que o valor total');
      }

      let seller: { id: number; comissao_percentual: number } | null = null;
      if (data.vendedora_id) {
        seller = await tx.queryOne<{ id: number; comissao_percentual: number }>(
          'SELECT id, comissao_percentual FROM sellers WHERE id = $1 AND ativo = TRUE',
          [data.vendedora_id]
        );
        if (!seller) {
          throw new HttpError(400, 'Vendedora não encontrada ou inativa');
        }
      }

      const sale = await tx.queryOne<{ id: number }>(
        `INSERT INTO sales (codigo, valor_total, desconto, valor_final, forma_pagamento, cliente_nome, vendedora_id, usuario_id)
         VALUES ('V' || LPAD(nextval('sales_codigo_seq')::text, 5, '0'), $1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [valorTotal, desconto, valorFinal, data.forma_pagamento, data.cliente_nome || null, seller?.id ?? null, req.user!.id]
      );

      await tx.query(
        `INSERT INTO sale_items (venda_id, produto_id, valor_unitario)
         SELECT $1, id, valor_venda FROM products WHERE id = ANY($2::int[])`,
        [sale!.id, productIds]
      );

      await tx.query(
        `UPDATE products SET status = 'VENDIDO', updated_at = CURRENT_TIMESTAMP WHERE id = ANY($1::int[])`,
        [productIds]
      );

      if (seller) {
        const valorComissao = round2((valorFinal * seller.comissao_percentual) / 100);
        await tx.query(
          `INSERT INTO seller_commissions (vendedora_id, venda_id, valor_venda, percentual_comissao, valor_comissao)
           VALUES ($1, $2, $3, $4, $5)`,
          [seller.id, sale!.id, valorFinal, seller.comissao_percentual, valorComissao]
        );
      }

      return sale!.id;
    });

    // Buscar venda completa para retornar
    const [completeSale] = await sql`
      SELECT s.*, sl.nome as vendedora_nome
      FROM sales s
      LEFT JOIN sellers sl ON sl.id = s.vendedora_id
      WHERE s.id = ${saleId}
    `;

    res.status(201).json(completeSale);
  } catch (error) {
    sendError(res, error, 'Erro ao criar venda');
  }
}

// Cancelar venda (mantém o registro com status CANCELADA)
export async function cancel(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    const { motivo } = cancelSchema.parse(req.body ?? {});

    await withTransaction(async (tx) => {
      const sale = await tx.queryOne<{ status: string }>('SELECT status FROM sales WHERE id = $1 FOR UPDATE', [id]);
      if (!sale) {
        throw new HttpError(404, 'Venda não encontrada');
      }
      if (sale.status === 'CANCELADA') {
        throw new HttpError(400, 'Esta venda já foi cancelada');
      }

      const items = await tx.query<{ id: number; codigo_barras: string; pago_fornecedor: boolean; lista_status: string }>(
        `SELECT p.id, p.codigo_barras, p.pago_fornecedor, cl.status AS lista_status
         FROM sale_items si
         JOIN products p ON p.id = si.produto_id
         JOIN consignment_lists cl ON cl.id = p.lista_id
         WHERE si.venda_id = $1
         FOR UPDATE OF p`,
        [id]
      );

      // Se o dinheiro já foi repassado, devolver a peça ao estoque deixaria o caixa inconsistente
      const pagasAoFornecedor = items.filter((i) => i.pago_fornecedor);
      if (pagasAoFornecedor.length > 0) {
        throw new HttpError(409, `Não é possível cancelar: peça(s) já paga(s) ao fornecedor (${pagasAoFornecedor.map(i => i.codigo_barras).join(', ')})`);
      }

      const emListaFinalizada = items.filter((i) => i.lista_status === 'FINALIZADA');
      if (emListaFinalizada.length > 0) {
        throw new HttpError(409, `Não é possível cancelar: peça(s) de lista já finalizada (${emListaFinalizada.map(i => i.codigo_barras).join(', ')})`);
      }

      const comissaoPaga = await tx.queryOne('SELECT 1 FROM seller_commissions WHERE venda_id = $1 AND pago = TRUE', [id]);
      if (comissaoPaga) {
        throw new HttpError(409, 'Não é possível cancelar: a comissão desta venda já foi paga');
      }

      await tx.query(
        `UPDATE products SET status = 'DISPONIVEL', updated_at = CURRENT_TIMESTAMP
         WHERE id = ANY($1::int[]) AND status = 'VENDIDO'`,
        [items.map((i) => i.id)]
      );

      await tx.query('DELETE FROM seller_commissions WHERE venda_id = $1', [id]);

      await tx.query(
        `UPDATE sales
         SET status = 'CANCELADA', cancelada_em = CURRENT_TIMESTAMP, cancelada_por = $2, motivo_cancelamento = $3
         WHERE id = $1`,
        [id, req.user!.id, motivo || null]
      );
    });

    res.json({ message: 'Venda cancelada com sucesso' });
  } catch (error) {
    sendError(res, error, 'Erro ao cancelar venda');
  }
}

// Relatório de vendas do dia
export async function getDailySalesReport(req: Request, res: Response) {
  try {
    const targetDate = parseDateParam(req.query.data, 'data') || todayInAppTimezone();

    // A lista inclui as canceladas (para conferência); os totais consideram só as concluídas
    const sales = await sql`
      SELECT s.*, sl.nome as vendedora_nome,
        (SELECT COUNT(*) FROM sale_items WHERE venda_id = s.id) as total_itens
      FROM sales s
      LEFT JOIN sellers sl ON sl.id = s.vendedora_id
      WHERE (s.data_venda AT TIME ZONE ${APP_TIMEZONE})::date = ${targetDate}::date
      ORDER BY s.data_venda DESC
    `;

    const [totals] = await sql`
      SELECT
        COUNT(*) as total_vendas,
        COALESCE(SUM(valor_total), 0) as valor_bruto,
        COALESCE(SUM(desconto), 0) as total_descontos,
        COALESCE(SUM(valor_final), 0) as valor_liquido,
        COALESCE(SUM(CASE WHEN forma_pagamento = 'DINHEIRO' THEN valor_final ELSE 0 END), 0) as total_dinheiro,
        COALESCE(SUM(CASE WHEN forma_pagamento = 'PIX' THEN valor_final ELSE 0 END), 0) as total_pix,
        COALESCE(SUM(CASE WHEN forma_pagamento = 'CARTAO_CREDITO' THEN valor_final ELSE 0 END), 0) as total_credito,
        COALESCE(SUM(CASE WHEN forma_pagamento = 'CARTAO_DEBITO' THEN valor_final ELSE 0 END), 0) as total_debito
      FROM sales
      WHERE status = 'CONCLUIDA'
        AND (data_venda AT TIME ZONE ${APP_TIMEZONE})::date = ${targetDate}::date
    `;

    res.json({ date: targetDate, sales, totals });
  } catch (error) {
    sendError(res, error, 'Erro ao gerar relatório');
  }
}

// Relatório de vendas por período (datas inclusivas, no fuso do negócio)
export async function getSalesReport(req: Request, res: Response) {
  try {
    const inicio = parseDateParam(req.query.inicio, 'inicio');
    const fim = parseDateParam(req.query.fim, 'fim');

    if (!inicio || !fim) {
      return res.status(400).json({ error: 'Período é obrigatório (inicio e fim)' });
    }

    const [totals] = await sql`
      SELECT
        COUNT(*) as total_vendas,
        COALESCE(SUM(valor_total), 0) as valor_bruto,
        COALESCE(SUM(desconto), 0) as total_descontos,
        COALESCE(SUM(valor_final), 0) as valor_liquido
      FROM sales
      WHERE status = 'CONCLUIDA'
        AND (data_venda AT TIME ZONE ${APP_TIMEZONE})::date BETWEEN ${inicio}::date AND ${fim}::date
    `;

    const byPaymentMethod = await sql`
      SELECT forma_pagamento, COUNT(*) as quantidade, COALESCE(SUM(valor_final), 0) as total
      FROM sales
      WHERE status = 'CONCLUIDA'
        AND (data_venda AT TIME ZONE ${APP_TIMEZONE})::date BETWEEN ${inicio}::date AND ${fim}::date
      GROUP BY forma_pagamento
    `;

    const bySeller = await sql`
      SELECT sl.nome as vendedora, COUNT(s.id) as quantidade, COALESCE(SUM(s.valor_final), 0) as total
      FROM sales s
      LEFT JOIN sellers sl ON sl.id = s.vendedora_id
      WHERE s.status = 'CONCLUIDA'
        AND (s.data_venda AT TIME ZONE ${APP_TIMEZONE})::date BETWEEN ${inicio}::date AND ${fim}::date
      GROUP BY sl.id, sl.nome
      ORDER BY total DESC
    `;

    const topProducts = await sql`
      SELECT p.descricao, p.cor, p.marca, COUNT(*) as quantidade, SUM(si.valor_unitario) as total
      FROM sale_items si
      JOIN products p ON p.id = si.produto_id
      JOIN sales s ON s.id = si.venda_id
      WHERE s.status = 'CONCLUIDA'
        AND (s.data_venda AT TIME ZONE ${APP_TIMEZONE})::date BETWEEN ${inicio}::date AND ${fim}::date
      GROUP BY p.descricao, p.cor, p.marca
      ORDER BY quantidade DESC
      LIMIT 20
    `;

    res.json({
      periodo: { inicio, fim },
      totals,
      byPaymentMethod,
      bySeller,
      topProducts
    });
  } catch (error) {
    sendError(res, error, 'Erro ao gerar relatório');
  }
}
