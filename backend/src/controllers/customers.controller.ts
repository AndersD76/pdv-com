import { Request, Response } from 'express';
import { sql } from '../database.js';
import { z } from 'zod';

const customerSchema = z.object({
  nome: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  cpf: z.string().optional(),
  telefone: z.string().optional(),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  endereco: z.string().optional(),
  cidade: z.string().optional(),
  estado: z.string().max(2).optional(),
  cep: z.string().optional(),
  data_nascimento: z.string().optional().nullable(),
  observacoes: z.string().optional()
});

// Listar todos os clientes
export async function getAll(req: Request, res: Response) {
  try {
    const { search } = req.query;

    let customers;
    if (search) {
      customers = await sql`
        SELECT * FROM customers
        WHERE nome ILIKE ${'%' + search + '%'}
           OR cpf ILIKE ${'%' + search + '%'}
           OR telefone ILIKE ${'%' + search + '%'}
        ORDER BY nome
      `;
    } else {
      customers = await sql`SELECT * FROM customers ORDER BY nome`;
    }

    res.json(customers);
  } catch (error) {
    console.error('Erro ao listar clientes:', error);
    res.status(500).json({ error: 'Erro ao listar clientes' });
  }
}

// Buscar cliente por ID
export async function getById(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const result = await sql`SELECT * FROM customers WHERE id = ${id}` as Record<string, unknown>[];
    const [customer] = result;

    if (!customer) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }

    res.json(customer);
  } catch (error) {
    console.error('Erro ao buscar cliente:', error);
    res.status(500).json({ error: 'Erro ao buscar cliente' });
  }
}

// Criar cliente
export async function create(req: Request, res: Response) {
  try {
    const data = customerSchema.parse(req.body);

    const [customer] = await sql`
      INSERT INTO customers (nome, cpf, telefone, email, endereco, cidade, estado, cep, data_nascimento, observacoes)
      VALUES (${data.nome}, ${data.cpf || null}, ${data.telefone || null}, ${data.email || null}, ${data.endereco || null}, ${data.cidade || null}, ${data.estado || null}, ${data.cep || null}, ${data.data_nascimento || null}, ${data.observacoes || null})
      RETURNING *
    `;

    res.status(201).json(customer);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Erro ao criar cliente:', error);
    res.status(500).json({ error: 'Erro ao criar cliente' });
  }
}

// Atualizar cliente
export async function update(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const data = customerSchema.parse(req.body);

    const [customer] = await sql`
      UPDATE customers
      SET nome = ${data.nome},
          cpf = ${data.cpf || null},
          telefone = ${data.telefone || null},
          email = ${data.email || null},
          endereco = ${data.endereco || null},
          cidade = ${data.cidade || null},
          estado = ${data.estado || null},
          cep = ${data.cep || null},
          data_nascimento = ${data.data_nascimento || null},
          observacoes = ${data.observacoes || null},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *
    `;

    if (!customer) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }

    res.json(customer);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Erro ao atualizar cliente:', error);
    res.status(500).json({ error: 'Erro ao atualizar cliente' });
  }
}

// Excluir cliente
export async function remove(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const [customer] = await sql`DELETE FROM customers WHERE id = ${id} RETURNING *`;

    if (!customer) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }

    res.json({ message: 'Cliente excluído com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir cliente:', error);
    res.status(500).json({ error: 'Erro ao excluir cliente' });
  }
}

// Estatísticas dos clientes
export async function getStats(req: Request, res: Response) {
  try {
    const [stats] = await sql`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE data_nascimento IS NOT NULL) as com_aniversario
      FROM customers
    `;

    // Aniversariantes do mês
    const aniversariantes = await sql`
      SELECT nome, data_nascimento
      FROM customers
      WHERE EXTRACT(MONTH FROM data_nascimento) = EXTRACT(MONTH FROM CURRENT_DATE)
      ORDER BY EXTRACT(DAY FROM data_nascimento)
    `;

    res.json({
      total: parseInt(String(stats.total)) || 0,
      com_aniversario: parseInt(String(stats.com_aniversario)) || 0,
      aniversariantes_mes: aniversariantes
    });
  } catch (error) {
    console.error('Erro ao buscar estatísticas:', error);
    res.status(500).json({ error: 'Erro ao buscar estatísticas' });
  }
}
