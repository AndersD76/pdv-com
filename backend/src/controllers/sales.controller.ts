import { Request, Response } from 'express';
import { sql } from '../database.js';
import { z } from 'zod';

// Helper para converter valores numéricos (Neon retorna DECIMAL como string)
function parseNumericFields(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string' && !isNaN(Number(value)) && value !== '') {
      result[key] = Number(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

const saleSchema = z.object({
  itens: z.array(z.object({
    produto_id: z.number().positive(),
    valor_unitario: z.number().positive()
  })).min(1, 'Pelo menos um item é obrigatório'),
  desconto: z.number().min(0).default(0),
  forma_pagamento: z.enum(['DINHEIRO', 'PIX', 'CARTAO_CREDITO', 'CARTAO_DEBITO']),
  cliente_nome: z.string().optional(),
  vendedora_id: z.number().positive().optional()
});

// Gerar próximo código de venda
async function getNextSaleCode(): Promise<string> {
  const [result] = await sql`
    SELECT codigo FROM sales ORDER BY id DESC LIMIT 1
  `;

  if (!result) {
    return 'V00001';
  }

  const lastNumber = parseInt(result.codigo.replace('V', ''));
  const nextNumber = lastNumber + 1;
  return `V${nextNumber.toString().padStart(5, '0')}`;
}

// Listar vendas
export async function getAll(req: Request, res: Response) {
  try {
    const { inicio, fim, vendedora_id, forma_pagamento } = req.query;

    let queryStr = `
      SELECT s.*,
        sl.nome as vendedora_nome,
        (SELECT COUNT(*) FROM sale_items WHERE venda_id = s.id) as total_itens
      FROM sales s
      LEFT JOIN sellers sl ON sl.id = s.vendedora_id
      WHERE 1=1
    `;

    const params: unknown[] = [];

    if (inicio && fim) {
      params.push(inicio, fim);
      queryStr += ` AND s.data_venda BETWEEN $${params.length - 1} AND $${params.length}`;
    }

    if (vendedora_id) {
      params.push(vendedora_id);
      queryStr += ` AND s.vendedora_id = $${params.length}`;
    }

    if (forma_pagamento) {
      params.push(forma_pagamento);
      queryStr += ` AND s.forma_pagamento = $${params.length}`;
    }

    queryStr += ' ORDER BY s.data_venda DESC LIMIT 500';

    const sales = await sql(queryStr, params);
    res.json(sales);
  } catch (error) {
    console.error('Erro ao listar vendas:', error);
    res.status(500).json({ error: 'Erro ao listar vendas' });
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
    console.error('Erro ao buscar venda:', error);
    res.status(500).json({ error: 'Erro ao buscar venda' });
  }
}

// Criar venda
export async function create(req: Request, res: Response) {
  try {
    const data = saleSchema.parse(req.body);

    // Verificar se todos os produtos estão disponíveis
    const productIds = data.itens.map(i => i.produto_id);

    const products = await sql`
      SELECT id, status, valor_venda FROM products WHERE id = ANY(${productIds}::int[])
    `;

    if (products.length !== productIds.length) {
      return res.status(400).json({ error: 'Um ou mais produtos não foram encontrados' });
    }

    const unavailableProducts = products.filter(p => p.status !== 'DISPONIVEL');
    if (unavailableProducts.length > 0) {
      return res.status(400).json({ error: 'Um ou mais produtos não estão disponíveis para venda' });
    }

    // Calcular valores
    const valorTotal = data.itens.reduce((sum, item) => sum + item.valor_unitario, 0);
    const valorFinal = valorTotal - data.desconto;

    if (valorFinal < 0) {
      return res.status(400).json({ error: 'Desconto não pode ser maior que o valor total' });
    }

    const codigo = await getNextSaleCode();

    // Criar venda
    const [sale] = await sql`
      INSERT INTO sales (codigo, valor_total, desconto, valor_final, forma_pagamento, cliente_nome, vendedora_id)
      VALUES (${codigo}, ${valorTotal}, ${data.desconto}, ${valorFinal}, ${data.forma_pagamento},
        ${data.cliente_nome || null}, ${data.vendedora_id || null})
      RETURNING *
    `;

    // Inserir itens da venda
    for (const item of data.itens) {
      await sql`
        INSERT INTO sale_items (venda_id, produto_id, valor_unitario)
        VALUES (${sale.id}, ${item.produto_id}, ${item.valor_unitario})
      `;

      // Atualizar status do produto para vendido
      await sql`
        UPDATE products SET status = 'VENDIDO', updated_at = CURRENT_TIMESTAMP
        WHERE id = ${item.produto_id}
      `;
    }

    // Se tem vendedora, calcular e registrar comissão
    if (data.vendedora_id) {
      const [seller] = await sql`SELECT * FROM sellers WHERE id = ${data.vendedora_id}`;

      if (seller) {
        const percentualComissao = Number(seller.comissao_percentual);
        const valorComissao = (valorFinal * percentualComissao) / 100;

        await sql`
          INSERT INTO seller_commissions (vendedora_id, venda_id, valor_venda, percentual_comissao, valor_comissao)
          VALUES (${data.vendedora_id}, ${sale.id}, ${valorFinal}, ${percentualComissao}, ${valorComissao})
        `;
      }
    }

    // Buscar venda completa para retornar
    const [completeSale] = await sql`
      SELECT s.*, sl.nome as vendedora_nome
      FROM sales s
      LEFT JOIN sellers sl ON sl.id = s.vendedora_id
      WHERE s.id = ${sale.id}
    `;

    res.status(201).json(completeSale);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Erro ao criar venda:', error);
    res.status(500).json({ error: 'Erro ao criar venda' });
  }
}

// Cancelar venda
export async function cancel(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const [sale] = await sql`SELECT * FROM sales WHERE id = ${id}`;
    if (!sale) {
      return res.status(404).json({ error: 'Venda não encontrada' });
    }

    // Buscar itens da venda
    const items = await sql`SELECT * FROM sale_items WHERE venda_id = ${id}`;

    // Retornar produtos para status disponível
    for (const item of items) {
      await sql`
        UPDATE products SET status = 'DISPONIVEL', updated_at = CURRENT_TIMESTAMP
        WHERE id = ${item.produto_id}
      `;
    }

    // Excluir comissões
    await sql`DELETE FROM seller_commissions WHERE venda_id = ${id}`;

    // Excluir itens da venda
    await sql`DELETE FROM sale_items WHERE venda_id = ${id}`;

    // Excluir venda
    await sql`DELETE FROM sales WHERE id = ${id}`;

    res.json({ message: 'Venda cancelada com sucesso' });
  } catch (error) {
    console.error('Erro ao cancelar venda:', error);
    res.status(500).json({ error: 'Erro ao cancelar venda' });
  }
}

// Relatório de vendas do dia
export async function getDailySalesReport(req: Request, res: Response) {
  try {
    const { data } = req.query;
    const targetDate = data || new Date().toISOString().split('T')[0];

    const sales = await sql`
      SELECT s.*, sl.nome as vendedora_nome,
        (SELECT COUNT(*) FROM sale_items WHERE venda_id = s.id) as total_itens
      FROM sales s
      LEFT JOIN sellers sl ON sl.id = s.vendedora_id
      WHERE DATE(s.data_venda) = ${targetDate}
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
      WHERE DATE(data_venda) = ${targetDate}
    `;

    res.json({
      date: targetDate,
      sales: sales.map((s: Record<string, unknown>) => parseNumericFields(s)),
      totals: parseNumericFields(totals)
    });
  } catch (error) {
    console.error('Erro ao gerar relatório diário:', error);
    res.status(500).json({ error: 'Erro ao gerar relatório' });
  }
}

// Relatório de vendas por período
export async function getSalesReport(req: Request, res: Response) {
  try {
    const { inicio, fim } = req.query;

    if (!inicio || !fim) {
      return res.status(400).json({ error: 'Período é obrigatório (inicio e fim)' });
    }

    // Adiciona fim do dia para incluir todas as vendas do dia final
    const fimDoDia = `${fim} 23:59:59`;

    const [totals] = await sql`
      SELECT
        COUNT(*) as total_vendas,
        COALESCE(SUM(valor_total), 0) as valor_bruto,
        COALESCE(SUM(desconto), 0) as total_descontos,
        COALESCE(SUM(valor_final), 0) as valor_liquido
      FROM sales
      WHERE data_venda >= ${inicio} AND data_venda <= ${fimDoDia}
    `;

    const byPaymentMethod = await sql`
      SELECT forma_pagamento, COUNT(*) as quantidade, COALESCE(SUM(valor_final), 0) as total
      FROM sales
      WHERE data_venda >= ${inicio} AND data_venda <= ${fimDoDia}
      GROUP BY forma_pagamento
    `;

    const bySeller = await sql`
      SELECT sl.nome as vendedora, COUNT(s.id) as quantidade, COALESCE(SUM(s.valor_final), 0) as total
      FROM sales s
      LEFT JOIN sellers sl ON sl.id = s.vendedora_id
      WHERE s.data_venda >= ${inicio} AND s.data_venda <= ${fimDoDia}
      GROUP BY sl.id, sl.nome
      ORDER BY total DESC
    `;

    const topProducts = await sql`
      SELECT p.descricao, p.cor, p.marca, COUNT(*) as quantidade, SUM(si.valor_unitario) as total
      FROM sale_items si
      JOIN products p ON p.id = si.produto_id
      JOIN sales s ON s.id = si.venda_id
      WHERE s.data_venda >= ${inicio} AND s.data_venda <= ${fimDoDia}
      GROUP BY p.descricao, p.cor, p.marca
      ORDER BY quantidade DESC
      LIMIT 20
    `;

    res.json({
      periodo: { inicio, fim },
      totals: parseNumericFields(totals),
      byPaymentMethod: byPaymentMethod.map((p: Record<string, unknown>) => parseNumericFields(p)),
      bySeller: bySeller.map((s: Record<string, unknown>) => parseNumericFields(s)),
      topProducts: topProducts.map((p: Record<string, unknown>) => parseNumericFields(p))
    });
  } catch (error) {
    console.error('Erro ao gerar relatório:', error);
    res.status(500).json({ error: 'Erro ao gerar relatório' });
  }
}
