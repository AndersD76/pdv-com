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

const sellerSchema = z.object({
  nome: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  cpf: z.string().optional(),
  telefone: z.string().optional(),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  comissao_percentual: z.number().min(0).max(100).default(10)
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
    console.error('Erro ao listar vendedoras:', error);
    res.status(500).json({ error: 'Erro ao listar vendedoras' });
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
    console.error('Erro ao buscar vendedora:', error);
    res.status(500).json({ error: 'Erro ao buscar vendedora' });
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
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Erro ao criar vendedora:', error);
    res.status(500).json({ error: 'Erro ao criar vendedora' });
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
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Erro ao atualizar vendedora:', error);
    res.status(500).json({ error: 'Erro ao atualizar vendedora' });
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
    console.error('Erro ao alterar status da vendedora:', error);
    res.status(500).json({ error: 'Erro ao alterar status da vendedora' });
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
    console.error('Erro ao excluir vendedora:', error);
    res.status(500).json({ error: 'Erro ao excluir vendedora' });
  }
}

// Relatório de comissões da vendedora
export async function getCommissionReport(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { inicio, fim, pago } = req.query;

    const [seller] = await sql`SELECT * FROM sellers WHERE id = ${id}`;
    if (!seller) {
      return res.status(404).json({ error: 'Vendedora não encontrada' });
    }

    let commissions;
    const fimDoDia = fim ? `${fim} 23:59:59` : null;

    if (inicio && fimDoDia) {
      if (pago !== undefined) {
        commissions = await sql`
          SELECT sc.*, s.codigo as venda_codigo, s.data_venda
          FROM seller_commissions sc
          JOIN sales s ON s.id = sc.venda_id
          WHERE sc.vendedora_id = ${id}
            AND s.data_venda >= ${inicio} AND s.data_venda <= ${fimDoDia}
            AND sc.pago = ${pago === 'true'}
          ORDER BY s.data_venda DESC
        `;
      } else {
        commissions = await sql`
          SELECT sc.*, s.codigo as venda_codigo, s.data_venda
          FROM seller_commissions sc
          JOIN sales s ON s.id = sc.venda_id
          WHERE sc.vendedora_id = ${id}
            AND s.data_venda >= ${inicio} AND s.data_venda <= ${fimDoDia}
          ORDER BY s.data_venda DESC
        `;
      }
    } else {
      commissions = await sql`
        SELECT sc.*, s.codigo as venda_codigo, s.data_venda
        FROM seller_commissions sc
        JOIN sales s ON s.id = sc.venda_id
        WHERE sc.vendedora_id = ${id}
        ORDER BY s.data_venda DESC
        LIMIT 100
      `;
    }

    // Calcular totais
    const [totals] = await sql`
      SELECT
        COALESCE(SUM(valor_comissao), 0) as total_comissao,
        COALESCE(SUM(CASE WHEN pago = true THEN valor_comissao ELSE 0 END), 0) as total_pago,
        COALESCE(SUM(CASE WHEN pago = false THEN valor_comissao ELSE 0 END), 0) as total_pendente,
        COUNT(*) as total_vendas
      FROM seller_commissions
      WHERE vendedora_id = ${id}
    `;

    res.json({
      seller: parseNumericFields(seller as Record<string, unknown>),
      commissions: (commissions as Record<string, unknown>[]).map((c) => parseNumericFields(c)),
      totals: parseNumericFields(totals as Record<string, unknown>)
    });
  } catch (error) {
    console.error('Erro ao gerar relatório de comissões:', error);
    res.status(500).json({ error: 'Erro ao gerar relatório de comissões' });
  }
}

// Marcar comissões como pagas
export async function payCommissions(req: Request, res: Response) {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'IDs das comissões são obrigatórios' });
    }

    await sql`
      UPDATE seller_commissions
      SET pago = true, data_pagamento = CURRENT_TIMESTAMP
      WHERE id = ANY(${ids}::int[])
    `;

    res.json({ message: 'Comissões marcadas como pagas' });
  } catch (error) {
    console.error('Erro ao marcar comissões como pagas:', error);
    res.status(500).json({ error: 'Erro ao marcar comissões como pagas' });
  }
}
