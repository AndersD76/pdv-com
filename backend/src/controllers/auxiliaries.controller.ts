import { Request, Response } from 'express';
import { sql } from '../database.js';
import { z } from 'zod';

// Schema genérico para nome
const nameSchema = z.object({
  nome: z.string().min(1, 'Nome é obrigatório')
});

const sizeSchema = z.object({
  nome: z.string().min(1, 'Nome é obrigatório'),
  categoria: z.enum(['roupa', 'calcado', 'unico']).default('roupa')
});

// ==================== DESCRIÇÕES ====================
export async function getDescriptions(req: Request, res: Response) {
  try {
    const descriptions = await sql`SELECT * FROM descriptions ORDER BY nome`;
    res.json(descriptions);
  } catch (error) {
    console.error('Erro ao listar descrições:', error);
    res.status(500).json({ error: 'Erro ao listar descrições' });
  }
}

export async function createDescription(req: Request, res: Response) {
  try {
    const { nome } = nameSchema.parse(req.body);
    const [description] = await sql`
      INSERT INTO descriptions (nome) VALUES (${nome}) RETURNING *
    `;
    res.status(201).json(description);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Erro ao criar descrição:', error);
    res.status(500).json({ error: 'Erro ao criar descrição' });
  }
}

export async function deleteDescription(req: Request, res: Response) {
  try {
    const { id } = req.params;
    await sql`DELETE FROM descriptions WHERE id = ${id}`;
    res.json({ message: 'Descrição excluída' });
  } catch (error) {
    console.error('Erro ao excluir descrição:', error);
    res.status(500).json({ error: 'Erro ao excluir descrição' });
  }
}

// ==================== CORES ====================
export async function getColors(req: Request, res: Response) {
  try {
    const colors = await sql`SELECT * FROM colors ORDER BY nome`;
    res.json(colors);
  } catch (error) {
    console.error('Erro ao listar cores:', error);
    res.status(500).json({ error: 'Erro ao listar cores' });
  }
}

export async function createColor(req: Request, res: Response) {
  try {
    const { nome } = nameSchema.parse(req.body);
    const [color] = await sql`
      INSERT INTO colors (nome) VALUES (${nome}) RETURNING *
    `;
    res.status(201).json(color);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Erro ao criar cor:', error);
    res.status(500).json({ error: 'Erro ao criar cor' });
  }
}

export async function deleteColor(req: Request, res: Response) {
  try {
    const { id } = req.params;
    await sql`DELETE FROM colors WHERE id = ${id}`;
    res.json({ message: 'Cor excluída' });
  } catch (error) {
    console.error('Erro ao excluir cor:', error);
    res.status(500).json({ error: 'Erro ao excluir cor' });
  }
}

// ==================== TAMANHOS ====================
export async function getSizes(req: Request, res: Response) {
  try {
    const { categoria } = req.query;
    let sizes;

    if (categoria) {
      sizes = await sql`SELECT * FROM sizes WHERE categoria = ${categoria} ORDER BY nome`;
    } else {
      sizes = await sql`SELECT * FROM sizes ORDER BY categoria, nome`;
    }

    res.json(sizes);
  } catch (error) {
    console.error('Erro ao listar tamanhos:', error);
    res.status(500).json({ error: 'Erro ao listar tamanhos' });
  }
}

export async function createSize(req: Request, res: Response) {
  try {
    const data = sizeSchema.parse(req.body);
    const [size] = await sql`
      INSERT INTO sizes (nome, categoria) VALUES (${data.nome}, ${data.categoria}) RETURNING *
    `;
    res.status(201).json(size);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Erro ao criar tamanho:', error);
    res.status(500).json({ error: 'Erro ao criar tamanho' });
  }
}

export async function deleteSize(req: Request, res: Response) {
  try {
    const { id } = req.params;
    await sql`DELETE FROM sizes WHERE id = ${id}`;
    res.json({ message: 'Tamanho excluído' });
  } catch (error) {
    console.error('Erro ao excluir tamanho:', error);
    res.status(500).json({ error: 'Erro ao excluir tamanho' });
  }
}

// ==================== MARCAS ====================
export async function getBrands(req: Request, res: Response) {
  try {
    const brands = await sql`SELECT * FROM brands ORDER BY nome`;
    res.json(brands);
  } catch (error) {
    console.error('Erro ao listar marcas:', error);
    res.status(500).json({ error: 'Erro ao listar marcas' });
  }
}

export async function createBrand(req: Request, res: Response) {
  try {
    const { nome } = nameSchema.parse(req.body);
    const [brand] = await sql`
      INSERT INTO brands (nome) VALUES (${nome}) RETURNING *
    `;
    res.status(201).json(brand);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Erro ao criar marca:', error);
    res.status(500).json({ error: 'Erro ao criar marca' });
  }
}

export async function deleteBrand(req: Request, res: Response) {
  try {
    const { id } = req.params;
    await sql`DELETE FROM brands WHERE id = ${id}`;
    res.json({ message: 'Marca excluída' });
  } catch (error) {
    console.error('Erro ao excluir marca:', error);
    res.status(500).json({ error: 'Erro ao excluir marca' });
  }
}

// ==================== TODOS OS CADASTROS (para autocomplete) ====================
export async function getAllAuxiliaries(req: Request, res: Response) {
  try {
    const [descriptions, colors, sizes, brands] = await Promise.all([
      sql`SELECT * FROM descriptions ORDER BY nome`,
      sql`SELECT * FROM colors ORDER BY nome`,
      sql`SELECT * FROM sizes ORDER BY categoria, nome`,
      sql`SELECT * FROM brands ORDER BY nome`
    ]);

    res.json({ descriptions, colors, sizes, brands });
  } catch (error) {
    console.error('Erro ao buscar cadastros auxiliares:', error);
    res.status(500).json({ error: 'Erro ao buscar cadastros auxiliares' });
  }
}
