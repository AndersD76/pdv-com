import { Request, Response } from 'express';
import { sql } from '../database.js';

// Buscar produto por código de barras (usado no PDV)
export async function getByBarcode(req: Request, res: Response) {
  try {
    const { codigo } = req.params;

    const [product] = await sql`
      SELECT p.*, cl.codigo as lista_codigo, sup.nome as fornecedor_nome
      FROM products p
      JOIN consignment_lists cl ON cl.id = p.lista_id
      JOIN suppliers sup ON sup.id = cl.fornecedor_id
      WHERE p.codigo_barras = ${codigo}
    `;

    if (!product) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    res.json(product);
  } catch (error) {
    console.error('Erro ao buscar produto:', error);
    res.status(500).json({ error: 'Erro ao buscar produto' });
  }
}

// Buscar produtos disponíveis (para busca no PDV)
export async function searchAvailable(req: Request, res: Response) {
  try {
    const { q } = req.query;

    if (!q || String(q).length < 2) {
      return res.status(400).json({ error: 'Termo de busca deve ter pelo menos 2 caracteres' });
    }

    const searchTerm = `%${q}%`;

    const products = await sql`
      SELECT p.*, cl.codigo as lista_codigo, sup.nome as fornecedor_nome
      FROM products p
      JOIN consignment_lists cl ON cl.id = p.lista_id
      JOIN suppliers sup ON sup.id = cl.fornecedor_id
      WHERE p.status = 'DISPONIVEL'
        AND (
          p.codigo_barras ILIKE ${searchTerm}
          OR p.descricao ILIKE ${searchTerm}
          OR p.marca ILIKE ${searchTerm}
          OR p.cor ILIKE ${searchTerm}
        )
      ORDER BY p.descricao
      LIMIT 50
    `;

    res.json(products);
  } catch (error) {
    console.error('Erro ao buscar produtos:', error);
    res.status(500).json({ error: 'Erro ao buscar produtos' });
  }
}

// Listar todos os produtos com filtros
export async function getAll(req: Request, res: Response) {
  try {
    const { status, lista_id, fornecedor_id, search } = req.query;

    let queryStr = `
      SELECT p.*, cl.codigo as lista_codigo, sup.nome as fornecedor_nome
      FROM products p
      JOIN consignment_lists cl ON cl.id = p.lista_id
      JOIN suppliers sup ON sup.id = cl.fornecedor_id
      WHERE 1=1
    `;

    const params: unknown[] = [];

    if (status) {
      params.push(status);
      queryStr += ` AND p.status = $${params.length}`;
    }

    if (lista_id) {
      params.push(lista_id);
      queryStr += ` AND p.lista_id = $${params.length}`;
    }

    if (fornecedor_id) {
      params.push(fornecedor_id);
      queryStr += ` AND cl.fornecedor_id = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      queryStr += ` AND (p.descricao ILIKE $${params.length} OR p.codigo_barras ILIKE $${params.length} OR p.marca ILIKE $${params.length})`;
    }

    queryStr += ' ORDER BY p.created_at DESC LIMIT 500';

    const products = await sql(queryStr, params);
    res.json(products);
  } catch (error) {
    console.error('Erro ao listar produtos:', error);
    res.status(500).json({ error: 'Erro ao listar produtos' });
  }
}

// Buscar produto por ID
export async function getById(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const [product] = await sql`
      SELECT p.*, cl.codigo as lista_codigo, sup.nome as fornecedor_nome,
        cl.fornecedor_id, cl.data_recebimento, cl.prazo_retirada
      FROM products p
      JOIN consignment_lists cl ON cl.id = p.lista_id
      JOIN suppliers sup ON sup.id = cl.fornecedor_id
      WHERE p.id = ${id}
    `;

    if (!product) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    res.json(product);
  } catch (error) {
    console.error('Erro ao buscar produto:', error);
    res.status(500).json({ error: 'Erro ao buscar produto' });
  }
}

// Dados para etiquetas de uma lista
export async function getLabelsData(req: Request, res: Response) {
  try {
    const { lista_id } = req.params;

    const [list] = await sql`
      SELECT cl.*, sup.nome as fornecedor_nome
      FROM consignment_lists cl
      JOIN suppliers sup ON sup.id = cl.fornecedor_id
      WHERE cl.id = ${lista_id}
    `;

    if (!list) {
      return res.status(404).json({ error: 'Lista não encontrada' });
    }

    const products = await sql`
      SELECT id, codigo_barras, descricao, cor, marca, tamanho, valor_venda
      FROM products
      WHERE lista_id = ${lista_id}
      ORDER BY id
    `;

    res.json({ list, products });
  } catch (error) {
    console.error('Erro ao buscar dados para etiquetas:', error);
    res.status(500).json({ error: 'Erro ao buscar dados' });
  }
}
