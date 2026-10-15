import { Request, Response } from 'express';
import { sql, APP_TIMEZONE } from '../database.js';
import { sendError, todayInAppTimezone, addDays } from '../utils/http.js';

// Dashboard principal (datas calculadas no fuso do negócio; vendas canceladas não entram)
export async function getDashboard(req: Request, res: Response) {
  try {
    const today = todayInAppTimezone();
    const firstDayOfMonth = `${today.slice(0, 8)}01`;
    const nextWeek = addDays(today, 7);

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
      WHERE status = 'CONCLUIDA'
        AND (data_venda AT TIME ZONE ${APP_TIMEZONE})::date = ${today}::date
    `;

    // Vendas do mês
    const [salesMonth] = await sql`
      SELECT
        COUNT(*) as quantidade,
        COALESCE(SUM(valor_final), 0) as valor_total
      FROM sales
      WHERE status = 'CONCLUIDA'
        AND (data_venda AT TIME ZONE ${APP_TIMEZONE})::date >= ${firstDayOfMonth}::date
    `;

    // Listas próximas do vencimento (próximos 7 dias)
    const expiringLists = await sql`
      SELECT cl.*, sup.nome as fornecedor_nome,
        (SELECT COUNT(*) FROM products WHERE lista_id = cl.id AND status = 'DISPONIVEL') as pecas_disponiveis
      FROM consignment_lists cl
      JOIN suppliers sup ON sup.id = cl.fornecedor_id
      WHERE cl.status != 'FINALIZADA'
        AND cl.prazo_retirada <= ${nextWeek}::date
        AND cl.prazo_retirada >= ${today}::date
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
        AND cl.prazo_retirada < ${today}::date
      ORDER BY cl.prazo_retirada ASC
      LIMIT 10
    `;

    // Últimas vendas
    const recentSales = await sql`
      SELECT s.*, sl.nome as vendedora_nome,
        (SELECT COUNT(*) FROM sale_items WHERE venda_id = s.id) as total_itens
      FROM sales s
      LEFT JOIN sellers sl ON sl.id = s.vendedora_id
      WHERE s.status = 'CONCLUIDA'
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
      WHERE status = 'CONCLUIDA'
        AND (data_venda AT TIME ZONE ${APP_TIMEZONE})::date >= ${firstDayOfMonth}::date
      GROUP BY forma_pagamento
    `;

    // Top vendedoras (mês atual)
    const topSellers = await sql`
      SELECT sl.id, sl.nome,
        COUNT(s.id) as total_vendas,
        COALESCE(SUM(s.valor_final), 0) as valor_vendido,
        COALESCE(SUM(sc.valor_comissao), 0) as comissao
      FROM sellers sl
      LEFT JOIN sales s ON s.vendedora_id = sl.id
        AND s.status = 'CONCLUIDA'
        AND (s.data_venda AT TIME ZONE ${APP_TIMEZONE})::date >= ${firstDayOfMonth}::date
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
      productStats,
      salesToday,
      salesMonth,
      expiringLists,
      expiredLists,
      recentSales,
      topSuppliers,
      salesByPayment,
      topSellers,
      pendingCommissions
    });
  } catch (error) {
    sendError(res, error, 'Erro ao carregar dashboard');
  }
}

// Estatísticas rápidas para cabeçalho
export async function getQuickStats(req: Request, res: Response) {
  try {
    const today = todayInAppTimezone();

    const [stats] = await sql`
      SELECT
        (SELECT COUNT(*) FROM products WHERE status = 'DISPONIVEL') as pecas_disponiveis,
        (SELECT COALESCE(SUM(valor_final), 0) FROM sales
          WHERE status = 'CONCLUIDA' AND (data_venda AT TIME ZONE ${APP_TIMEZONE})::date = ${today}::date) as vendas_hoje,
        (SELECT COUNT(*) FROM consignment_lists WHERE status = 'DIGITADA') as listas_pendentes
    `;

    res.json(stats);
  } catch (error) {
    sendError(res, error, 'Erro ao carregar estatísticas');
  }
}

// Gráfico de vendas por dia (últimos 30 dias)
export async function getSalesChart(req: Request, res: Response) {
  try {
    const thirtyDaysAgo = addDays(todayInAppTimezone(), -30);

    const data = await sql`
      SELECT
        (data_venda AT TIME ZONE ${APP_TIMEZONE})::date as data,
        COUNT(*) as quantidade,
        COALESCE(SUM(valor_final), 0) as valor
      FROM sales
      WHERE status = 'CONCLUIDA'
        AND (data_venda AT TIME ZONE ${APP_TIMEZONE})::date >= ${thirtyDaysAgo}::date
      GROUP BY 1
      ORDER BY 1
    `;

    res.json(data);
  } catch (error) {
    sendError(res, error, 'Erro ao carregar gráfico');
  }
}
