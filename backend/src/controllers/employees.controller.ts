import { Request, Response } from 'express';
import { sql } from '../database.js';
import { z } from 'zod';

const employeeSchema = z.object({
  nome: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  cpf: z.string().optional(),
  cargo: z.string().min(2, 'Cargo é obrigatório'),
  departamento: z.string().optional(),
  salario_base: z.number().positive('Salário deve ser positivo'),
  data_admissao: z.string(),
  dependentes: z.number().int().min(0).default(0),
  status: z.enum(['ativo', 'inativo']).default('ativo'),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  telefone: z.string().optional()
});

// Listar todos os funcionários
export async function getAll(req: Request, res: Response) {
  try {
    const { search, status } = req.query;

    let employees;
    if (search) {
      if (status && status !== 'todos') {
        employees = await sql`
          SELECT * FROM employees
          WHERE (nome ILIKE ${'%' + search + '%'} OR cpf ILIKE ${'%' + search + '%'})
          AND status = ${status}
          ORDER BY nome
        `;
      } else {
        employees = await sql`
          SELECT * FROM employees
          WHERE nome ILIKE ${'%' + search + '%'} OR cpf ILIKE ${'%' + search + '%'}
          ORDER BY nome
        `;
      }
    } else if (status && status !== 'todos') {
      employees = await sql`
        SELECT * FROM employees
        WHERE status = ${status}
        ORDER BY nome
      `;
    } else {
      employees = await sql`SELECT * FROM employees ORDER BY nome`;
    }

    // Converter DECIMAL para number
    const formatted = employees.map((emp: Record<string, unknown>) => ({
      ...emp,
      salario_base: emp.salario_base ? parseFloat(String(emp.salario_base)) : 0
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Erro ao listar funcionários:', error);
    res.status(500).json({ error: 'Erro ao listar funcionários' });
  }
}

// Buscar funcionário por ID
export async function getById(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const result = await sql`SELECT * FROM employees WHERE id = ${id}` as Record<string, unknown>[];
    const [employee] = result;

    if (!employee) {
      return res.status(404).json({ error: 'Funcionário não encontrado' });
    }

    // Converter DECIMAL para number
    const formatted = {
      ...employee,
      salario_base: employee.salario_base ? parseFloat(String(employee.salario_base)) : 0
    };

    res.json(formatted);
  } catch (error) {
    console.error('Erro ao buscar funcionário:', error);
    res.status(500).json({ error: 'Erro ao buscar funcionário' });
  }
}

// Criar funcionário
export async function create(req: Request, res: Response) {
  try {
    const data = employeeSchema.parse(req.body);

    const [employee] = await sql`
      INSERT INTO employees (nome, cpf, cargo, departamento, salario_base, data_admissao, dependentes, status, email, telefone)
      VALUES (${data.nome}, ${data.cpf || null}, ${data.cargo}, ${data.departamento || null}, ${data.salario_base}, ${data.data_admissao}, ${data.dependentes}, ${data.status}, ${data.email || null}, ${data.telefone || null})
      RETURNING *
    `;

    res.status(201).json(employee);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Erro ao criar funcionário:', error);
    res.status(500).json({ error: 'Erro ao criar funcionário' });
  }
}

// Atualizar funcionário
export async function update(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const data = employeeSchema.parse(req.body);

    const [employee] = await sql`
      UPDATE employees
      SET nome = ${data.nome},
          cpf = ${data.cpf || null},
          cargo = ${data.cargo},
          departamento = ${data.departamento || null},
          salario_base = ${data.salario_base},
          data_admissao = ${data.data_admissao},
          dependentes = ${data.dependentes},
          status = ${data.status},
          email = ${data.email || null},
          telefone = ${data.telefone || null},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *
    `;

    if (!employee) {
      return res.status(404).json({ error: 'Funcionário não encontrado' });
    }

    res.json(employee);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Erro ao atualizar funcionário:', error);
    res.status(500).json({ error: 'Erro ao atualizar funcionário' });
  }
}

// Excluir funcionário
export async function remove(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const [employee] = await sql`DELETE FROM employees WHERE id = ${id} RETURNING *`;

    if (!employee) {
      return res.status(404).json({ error: 'Funcionário não encontrado' });
    }

    res.json({ message: 'Funcionário excluído com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir funcionário:', error);
    res.status(500).json({ error: 'Erro ao excluir funcionário' });
  }
}

// Toggle status ativo/inativo
export async function toggleStatus(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const [current] = await sql`SELECT status FROM employees WHERE id = ${id}`;
    if (!current) {
      return res.status(404).json({ error: 'Funcionário não encontrado' });
    }

    const newStatus = current.status === 'ativo' ? 'inativo' : 'ativo';

    const [employee] = await sql`
      UPDATE employees
      SET status = ${newStatus}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *
    `;

    res.json(employee);
  } catch (error) {
    console.error('Erro ao alterar status:', error);
    res.status(500).json({ error: 'Erro ao alterar status' });
  }
}

// Estatísticas dos funcionários
export async function getStats(req: Request, res: Response) {
  try {
    const [stats] = await sql`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'ativo') as ativos,
        COUNT(*) FILTER (WHERE status = 'inativo') as inativos,
        COALESCE(SUM(salario_base) FILTER (WHERE status = 'ativo'), 0) as folha_total
      FROM employees
    `;

    res.json({
      total: parseInt(String(stats.total)) || 0,
      ativos: parseInt(String(stats.ativos)) || 0,
      inativos: parseInt(String(stats.inativos)) || 0,
      folha_total: parseFloat(String(stats.folha_total)) || 0
    });
  } catch (error) {
    console.error('Erro ao buscar estatísticas:', error);
    res.status(500).json({ error: 'Erro ao buscar estatísticas' });
  }
}
