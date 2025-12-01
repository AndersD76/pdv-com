import { Request, Response } from 'express';
import { sql } from '../database.js';
import { z } from 'zod';

const supplierSchema = z.object({
  nome: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  cpf: z.string().optional(),
  telefone: z.string().optional(),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  endereco: z.string().optional()
});

// Listar todos os fornecedores
export async function getAll(req: Request, res: Response) {
  try {
    const { search } = req.query;

    let suppliers;
    if (search) {
      suppliers = await sql`
        SELECT * FROM suppliers
        WHERE nome ILIKE ${'%' + search + '%'} OR cpf ILIKE ${'%' + search + '%'}
        ORDER BY nome
      `;
    } else {
      suppliers = await sql`SELECT * FROM suppliers ORDER BY nome`;
    }

    res.json(suppliers);
  } catch (error) {
    console.error('Erro ao listar fornecedores:', error);
    res.status(500).json({ error: 'Erro ao listar fornecedores' });
  }
}

// Buscar fornecedor por ID
export async function getById(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const result = await sql`SELECT * FROM suppliers WHERE id = ${id}` as Record<string, unknown>[];
    const [supplier] = result;

    if (!supplier) {
      return res.status(404).json({ error: 'Fornecedor não encontrado' });
    }

    res.json(supplier);
  } catch (error) {
    console.error('Erro ao buscar fornecedor:', error);
    res.status(500).json({ error: 'Erro ao buscar fornecedor' });
  }
}

// Criar fornecedor
export async function create(req: Request, res: Response) {
  try {
    const data = supplierSchema.parse(req.body);

    const [supplier] = await sql`
      INSERT INTO suppliers (nome, cpf, telefone, email, endereco)
      VALUES (${data.nome}, ${data.cpf || null}, ${data.telefone || null}, ${data.email || null}, ${data.endereco || null})
      RETURNING *
    `;

    res.status(201).json(supplier);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Erro ao criar fornecedor:', error);
    res.status(500).json({ error: 'Erro ao criar fornecedor' });
  }
}

// Atualizar fornecedor
export async function update(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const data = supplierSchema.parse(req.body);

    const [supplier] = await sql`
      UPDATE suppliers
      SET nome = ${data.nome},
          cpf = ${data.cpf || null},
          telefone = ${data.telefone || null},
          email = ${data.email || null},
          endereco = ${data.endereco || null},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *
    `;

    if (!supplier) {
      return res.status(404).json({ error: 'Fornecedor não encontrado' });
    }

    res.json(supplier);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Erro ao atualizar fornecedor:', error);
    res.status(500).json({ error: 'Erro ao atualizar fornecedor' });
  }
}

// Excluir fornecedor
export async function remove(req: Request, res: Response) {
  try {
    const { id } = req.params;

    // Verificar se tem listas associadas
    const [hasLists] = await sql`SELECT COUNT(*) as count FROM consignment_lists WHERE fornecedor_id = ${id}`;
    if (hasLists && Number(hasLists.count) > 0) {
      return res.status(400).json({ error: 'Não é possível excluir fornecedor com listas de consignação associadas' });
    }

    const [supplier] = await sql`DELETE FROM suppliers WHERE id = ${id} RETURNING *`;

    if (!supplier) {
      return res.status(404).json({ error: 'Fornecedor não encontrado' });
    }

    res.json({ message: 'Fornecedor excluído com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir fornecedor:', error);
    res.status(500).json({ error: 'Erro ao excluir fornecedor' });
  }
}

// Relatório de peças do fornecedor
export async function getSupplierReport(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const [supplier] = await sql`SELECT * FROM suppliers WHERE id = ${id}`;
    if (!supplier) {
      return res.status(404).json({ error: 'Fornecedor não encontrado' });
    }

    const lists = await sql`
      SELECT cl.*,
        (SELECT COUNT(*) FROM products WHERE lista_id = cl.id) as total_pecas,
        (SELECT COUNT(*) FROM products WHERE lista_id = cl.id AND status = 'VENDIDO') as pecas_vendidas,
        (SELECT COALESCE(SUM(valor_compra), 0) FROM products WHERE lista_id = cl.id AND status = 'VENDIDO') as valor_a_pagar,
        (SELECT COALESCE(SUM(valor_venda), 0) FROM products WHERE lista_id = cl.id AND status = 'VENDIDO') as valor_vendido
      FROM consignment_lists cl
      WHERE cl.fornecedor_id = ${id}
      ORDER BY cl.data_recebimento DESC
    `;

    res.json({ supplier, lists });
  } catch (error) {
    console.error('Erro ao gerar relatório:', error);
    res.status(500).json({ error: 'Erro ao gerar relatório' });
  }
}
