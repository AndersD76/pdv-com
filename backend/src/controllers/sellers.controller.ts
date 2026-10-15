import { Request, Response } from 'express';
import { sql, query, APP_TIMEZONE } from '../database.js';
import { z } from 'zod';
import { sendError, parseDateParam } from '../utils/http.js';

const sellerSchema = z.object({
  nome: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  cpf: z.string().optional(),
  telefone: z.string().optional(),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  comissao_percentual: z.number().min(0).max(100).default(10)
});

const payCommissionsSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1, 'IDs das comissões são obrigatórios').max(1000)
});

// Listar todas as vendedoras
export async function getAll(req: Request, res: Response) {
  try {
    const { ativo } = req.query;

    let sellers;
    if (ativo !== undefined) {
      sellers = await sql`
        SELECT * FROM sellers WHERE ativo = ${ativo === 'true'} ORDER BY nome
      `;
    } else {
      sellers = await sql`SELECT * FROM sellers ORDER BY nome`;
    }

    res.json(sellers);
  } catch (error) {
    sendError(res, error, 'Erro ao listar vendedoras');
  }
}

// Buscar vendedora por ID
export async function getById(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const [seller] = await sql`SELECT * FROM sellers WHERE id = ${id}`;

    if (!seller) {
      return res.status(404).json({ error: 'Vendedora não encontrada' });
    }

    res.json(seller);
  } catch (error) {
    sendError(res, error, 'Erro ao buscar vendedora');
  }
}

// Criar vendedora
export async function create(req: Request, res: Response) {
  try {
    const data = sellerSchema.parse(req.body);

    const [seller] = await sql`
      INSERT INTO sellers (nome, cpf, telefone, email, comissao_percentual)
      VALUES (${data.nome}, ${data.cpf || null}, ${data.telefone || null}, ${data.email || null}, ${data.comissao_percentual})
      RETURNING *
    `;

    res.status(201).json(seller);
  } catch (error) {
    sendError(res, error, 'Erro ao criar vendedora');
  }
}

// Atualizar vendedora
export async function update(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const data = sellerSchema.parse(req.body);

    const [seller] = await sql`
      UPDATE sellers
      SET nome = ${data.nome},
          cpf = ${data.cpf || null},
          telefone = ${data.telefone || null},
          email = ${data.email || null},
          comissao_percentual = ${data.comissao_percentual},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *
    `;

    if (!seller) {
      return res.status(404).json({ error: 'Vendedora não encontrada' });
    }

    res.json(seller);
  } catch (error) {
    sendError(res, error, 'Erro ao atualizar vendedora');
  }
}

// Ativar/Desativar vendedora
export async function toggleActive(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const [seller] = await sql`
      UPDATE sellers
      SET ativo = NOT ativo, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *
    `;

    if (!seller) {
      return res.status(404).json({ error: 'Vendedora não encontrada' });
    }

    res.json(seller);
  } catch (error) {
    sendError(res, error, 'Erro ao alterar status da vendedora');
  }
}

// Excluir vendedora
export async function remove(req: Request, res: Response) {
  try {
    const { id } = req.params;

    // Verificar se tem vendas associadas
    const [hasSales] = await sql`SELECT COUNT(*) as count FROM sales WHERE vendedora_id = ${id}`;
    if (hasSales && Number(hasSales.count) > 0) {
      return res.status(400).json({ error: 'Não é possível excluir vendedora com vendas associadas. Desative-a em vez disso.' });
    }

    const [seller] = await sql`DELETE FROM sellers WHERE id = ${id} RETURNING *`;

    if (!seller) {
      return res.status(404).json({ error: 'Vendedora não encontrada' });
    }

    res.json({ message: 'Vendedora excluída com sucesso' });
  } catch (error) {
    sendError(res, error, 'Erro ao excluir vendedora');
  }
}

// Relatório de comissões da vendedora (lista e totais seguem os mesmos filtros)
export async function getCommissionReport(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    const inicio = parseDateParam(req.query.inicio, 'inicio');
    const fim = parseDateParam(req.query.fim, 'fim');
    const { pago } = req.query;

    const [seller] = await sql`SELECT * FROM sellers WHERE id = ${id}`;
    if (!seller) {
      return res.status(404).json({ error: 'Vendedora não encontrada' });
    }

    const params: unknown[] = [id];
    let where = 'sc.vendedora_id = $1';

    if (inicio || fim) {
      params.push(APP_TIMEZONE);
      const tz = `$${params.length}`;
      if (inicio) {
        params.push(inicio);
        where += ` AND (s.data_venda AT TIME ZONE ${tz})::date >= $${params.length}::date`;
      }
      if (fim) {
        params.push(fim);
        where += ` AND (s.data_venda AT TIME ZONE ${tz})::date <= $${params.length}::date`;
      }
    }

    if (pago !== undefined) {
      params.push(pago === 'true');
      where += ` AND sc.pago = $${params.length}`;
    }

    const commissions = await query(`
      SELECT sc.*, s.codigo as venda_codigo, s.data_venda
      FROM seller_commissions sc
      JOIN sales s ON s.id = sc.venda_id
      WHERE ${where}
      ORDER BY s.data_venda DESC
      ${inicio || fim ? '' : 'LIMIT 100'}
    `, params);

    const [totals] = await query(`
      SELECT
        COALESCE(SUM(sc.valor_comissao), 0) as total_comissao,
        COALESCE(SUM(CASE WHEN sc.pago = true THEN sc.valor_comissao ELSE 0 END), 0) as total_pago,
        COALESCE(SUM(CASE WHEN sc.pago = false THEN sc.valor_comissao ELSE 0 END), 0) as total_pendente,
        COUNT(*) as total_vendas
      FROM seller_commissions sc
      JOIN sales s ON s.id = sc.venda_id
      WHERE ${where}
    `, params);

    res.json({ seller, commissions, totals });
  } catch (error) {
    sendError(res, error, 'Erro ao gerar relatório de comissões');
  }
}

// Marcar comissões como pagas
export async function payCommissions(req: Request, res: Response) {
  try {
    const { ids } = payCommissionsSchema.parse(req.body);

    const updated = await sql`
      UPDATE seller_commissions
      SET pago = true, data_pagamento = CURRENT_TIMESTAMP
      WHERE id = ANY(${ids}::int[]) AND pago = false
      RETURNING id
    `;

    res.json({ message: `${updated.length} comissão(ões) marcada(s) como paga(s)`, quantidade: updated.length });
  } catch (error) {
    sendError(res, error, 'Erro ao marcar comissões como pagas');
  }
}
