import { Request, Response } from 'express';
import { sql } from '../database.js';
import { sendError } from '../utils/http.js';
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
    sendError(res, error, 'Erro ao listar descrições');
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
    sendError(res, error, 'Erro ao criar descrição');
  }
}

export async function deleteDescription(req: Request, res: Response) {
  try {
    const { id } = req.params;
    await sql`DELETE FROM descriptions WHERE id = ${id}`;
    res.json({ message: 'Descrição excluída' });
  } catch (error) {
    sendError(res, error, 'Erro ao excluir descrição');
  }
}

// ==================== CORES ====================
export async function getColors(req: Request, res: Response) {
  try {
    const colors = await sql`SELECT * FROM colors ORDER BY nome`;
    res.json(colors);
  } catch (error) {
    sendError(res, error, 'Erro ao listar cores');
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
    sendError(res, error, 'Erro ao criar cor');
  }
}

export async function deleteColor(req: Request, res: Response) {
  try {
    const { id } = req.params;
    await sql`DELETE FROM colors WHERE id = ${id}`;
    res.json({ message: 'Cor excluída' });
  } catch (error) {
    sendError(res, error, 'Erro ao excluir cor');
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
    sendError(res, error, 'Erro ao listar tamanhos');
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
    sendError(res, error, 'Erro ao criar tamanho');
  }
}

export async function deleteSize(req: Request, res: Response) {
  try {
    const { id } = req.params;
    await sql`DELETE FROM sizes WHERE id = ${id}`;
    res.json({ message: 'Tamanho excluído' });
  } catch (error) {
    sendError(res, error, 'Erro ao excluir tamanho');
  }
}

// ==================== MARCAS ====================
export async function getBrands(req: Request, res: Response) {
  try {
    const brands = await sql`SELECT * FROM brands ORDER BY nome`;
    res.json(brands);
  } catch (error) {
    sendError(res, error, 'Erro ao listar marcas');
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
    sendError(res, error, 'Erro ao criar marca');
  }
}

export async function deleteBrand(req: Request, res: Response) {
  try {
    const { id } = req.params;
    await sql`DELETE FROM brands WHERE id = ${id}`;
    res.json({ message: 'Marca excluída' });
  } catch (error) {
    sendError(res, error, 'Erro ao excluir marca');
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
    sendError(res, error, 'Erro ao buscar cadastros auxiliares');
  }
}
