import { Request, Response } from 'express';
import { sql } from '../database.js';

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

// Dashboard principal
export async function getDashboard(req: Request, res: Response) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString().split('T')[0];

    // Estatísticas gerais de produtos
    const [productStats] = await sql`
      SELECT
        COUNT(*) as total_pecas,
        COUNT(CASE WHEN status = 'DISPONIVEL' THEN 1 END) as pecas_disponiveis,
        COUNT(CASE WHEN status = 'VENDIDO' THEN 1 END) as pecas_vendidas,
        COUNT(CASE WHEN status = 'DEVOLVIDO' THEN 1 END) as pecas_devolvidas,
        COALESCE(SUM(CASE WHEN status = 'DISPONIVEL' THEN valor_venda ELSE 0 END), 0) as valor_estoque
      FROM products
    `;

    // Vendas do dia
    const [salesToday] = await sql`
      SELECT
        COUNT(*) as quantidade,
        COALESCE(SUM(valor_final), 0) as valor_total
      FROM sales
      WHERE DATE(data_venda) = ${today}
    `;

    // Vendas do mês
    const [salesMonth] = await sql`
      SELECT
        COUNT(*) as quantidade,
        COALESCE(SUM(valor_final), 0) as valor_total
      FROM sales
      WHERE data_venda >= ${firstDayOfMonth}
    `;

    // Listas próximas do vencimento (próximos 7 dias)
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);

    const expiringLists = await sql`
      SELECT cl.*, sup.nome as fornecedor_nome,
        (SELECT COUNT(*) FROM products WHERE lista_id = cl.id AND status = 'DISPONIVEL') as pecas_disponiveis
      FROM consignment_lists cl
      JOIN suppliers sup ON sup.id = cl.fornecedor_id
      WHERE cl.status != 'FINALIZADA'
        AND cl.prazo_retirada <= ${nextWeek.toISOString().split('T')[0]}
        AND cl.prazo_retirada >= ${today}
      ORDER BY cl.prazo_retirada ASC
      LIMIT 10
    `;

    // Listas já vencidas (não finalizadas)
    const expiredLists = await sql`
      SELECT cl.*, sup.nome as fornecedor_nome,
        (SELECT COUNT(*) FROM products WHERE lista_id = cl.id AND status = 'DISPONIVEL') as pecas_disponiveis
      FROM consignment_lists cl
      JOIN suppliers sup ON sup.id = cl.fornecedor_id
      WHERE cl.status != 'FINALIZADA'
        AND cl.prazo_retirada < ${today}
      ORDER BY cl.prazo_retirada ASC
      LIMIT 10
    `;

    // Últimas vendas
    const recentSales = await sql`
      SELECT s.*, sl.nome as vendedora_nome,
        (SELECT COUNT(*) FROM sale_items WHERE venda_id = s.id) as total_itens
      FROM sales s
      LEFT JOIN sellers sl ON sl.id = s.vendedora_id
      ORDER BY s.data_venda DESC
      LIMIT 10
    `;

    // Top fornecedores (por valor vendido)
    const topSuppliers = await sql`
      SELECT sup.id, sup.nome,
        COUNT(DISTINCT cl.id) as total_listas,
        COUNT(p.id) as total_pecas,
        COUNT(CASE WHEN p.status = 'VENDIDO' THEN 1 END) as pecas_vendidas,
        COALESCE(SUM(CASE WHEN p.status = 'VENDIDO' THEN p.valor_venda ELSE 0 END), 0) as valor_vendido
      FROM suppliers sup
      JOIN consignment_lists cl ON cl.fornecedor_id = sup.id
      JOIN products p ON p.lista_id = cl.id
      GROUP BY sup.id, sup.nome
      ORDER BY valor_vendido DESC
      LIMIT 10
    `;

    // Vendas por forma de pagamento (mês atual)
    const salesByPayment = await sql`
      SELECT forma_pagamento, COUNT(*) as quantidade, COALESCE(SUM(valor_final), 0) as total
      FROM sales
      WHERE data_venda >= ${firstDayOfMonth}
      GROUP BY forma_pagamento
    `;

    // Top vendedoras (mês atual)
    const topSellers = await sql`
      SELECT sl.id, sl.nome,
        COUNT(s.id) as total_vendas,
        COALESCE(SUM(s.valor_final), 0) as valor_vendido,
        COALESCE(SUM(sc.valor_comissao), 0) as comissao
      FROM sellers sl
      LEFT JOIN sales s ON s.vendedora_id = sl.id AND s.data_venda >= ${firstDayOfMonth}
      LEFT JOIN seller_commissions sc ON sc.venda_id = s.id
      WHERE sl.ativo = true
      GROUP BY sl.id, sl.nome
      ORDER BY valor_vendido DESC
      LIMIT 5
    `;

    // Comissões pendentes
    const [pendingCommissions] = await sql`
      SELECT
        COUNT(*) as quantidade,
        COALESCE(SUM(valor_comissao), 0) as valor_total
      FROM seller_commissions
      WHERE pago = false
    `;

    res.json({
      productStats: parseNumericFields(productStats as Record<string, unknown>),
      salesToday: parseNumericFields(salesToday as Record<string, unknown>),
      salesMonth: parseNumericFields(salesMonth as Record<string, unknown>),
      expiringLists: (expiringLists as Record<string, unknown>[]).map((l) => parseNumericFields(l)),
      expiredLists: (expiredLists as Record<string, unknown>[]).map((l) => parseNumericFields(l)),
      recentSales: (recentSales as Record<string, unknown>[]).map((s) => parseNumericFields(s)),
      topSuppliers: (topSuppliers as Record<string, unknown>[]).map((s) => parseNumericFields(s)),
      salesByPayment: (salesByPayment as Record<string, unknown>[]).map((s) => parseNumericFields(s)),
      topSellers: (topSellers as Record<string, unknown>[]).map((s) => parseNumericFields(s)),
      pendingCommissions: parseNumericFields(pendingCommissions as Record<string, unknown>)
    });
  } catch (error) {
    console.error('Erro ao carregar dashboard:', error);
    res.status(500).json({ error: 'Erro ao carregar dashboard' });
  }
}

// Estatísticas rápidas para cabeçalho
export async function getQuickStats(req: Request, res: Response) {
  try {
    const today = new Date().toISOString().split('T')[0];

    const [stats] = await sql`
      SELECT
        (SELECT COUNT(*) FROM products WHERE status = 'DISPONIVEL') as pecas_disponiveis,
        (SELECT COALESCE(SUM(valor_final), 0) FROM sales WHERE DATE(data_venda) = ${today}) as vendas_hoje,
        (SELECT COUNT(*) FROM consignment_lists WHERE status = 'DIGITADA') as listas_pendentes
    `;

    res.json(stats);
  } catch (error) {
    console.error('Erro ao carregar estatísticas:', error);
    res.status(500).json({ error: 'Erro ao carregar estatísticas' });
  }
}

// Gráfico de vendas por dia (últimos 30 dias)
export async function getSalesChart(req: Request, res: Response) {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const data = await sql`
      SELECT
        DATE(data_venda) as data,
        COUNT(*) as quantidade,
        COALESCE(SUM(valor_final), 0) as valor
      FROM sales
      WHERE data_venda >= ${thirtyDaysAgo.toISOString()}
      GROUP BY DATE(data_venda)
      ORDER BY data
    `;

    res.json(data);
  } catch (error) {
    console.error('Erro ao carregar gráfico de vendas:', error);
    res.status(500).json({ error: 'Erro ao carregar gráfico' });
  }
}
