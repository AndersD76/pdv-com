import { Request, Response } from 'express';
import { sql, query, APP_TIMEZONE } from '../database.js';
import { sendError, parseDateParam } from '../utils/http.js';
import { detectImageMime } from '../utils/images.js';
import { ean13ToStoredCode } from '../utils/barcode.js';

const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

// Buscar produto por código de barras (usado no PDV)
export async function getByBarcode(req: Request, res: Response) {
  try {
    const { codigo } = req.params;
    // A etiqueta EAN-13 tem o dígito verificador a mais; o cadastro guarda os 12 dígitos de dados
    const semVerificador = ean13ToStoredCode(codigo);

    const [product] = await sql`
      SELECT p.*, cl.codigo as lista_codigo, sup.nome as fornecedor_nome
      FROM products p
      JOIN consignment_lists cl ON cl.id = p.lista_id
      JOIN suppliers sup ON sup.id = cl.fornecedor_id
      WHERE p.codigo_barras = ${codigo} OR p.codigo_barras = ${semVerificador}
      ORDER BY (p.codigo_barras = ${codigo}) DESC
      LIMIT 1
    `;

    if (!product) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    res.json(product);
  } catch (error) {
    sendError(res, error, 'Erro ao buscar produto');
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
    sendError(res, error, 'Erro ao buscar produtos');
  }
}

// Listar todos os produtos com filtros
export async function getAll(req: Request, res: Response) {
  try {
    const { status, lista_id, fornecedor_id, search, canal } = req.query;
    const criadoDesde = parseDateParam(req.query.criado_desde, 'criado_desde');

    let queryStr = `
      SELECT p.*, cl.codigo as lista_codigo, sup.nome as fornecedor_nome,
        pp.updated_at as foto_atualizada_em
      FROM products p
      JOIN consignment_lists cl ON cl.id = p.lista_id
      JOIN suppliers sup ON sup.id = cl.fornecedor_id
      LEFT JOIN product_photos pp ON pp.product_id = p.id
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

    if (canal) {
      params.push(canal);
      queryStr += ` AND p.canal = $${params.length}`;
    }

    // Peças cadastradas a partir de uma data (no fuso do negócio), ex.: etiquetas do dia
    if (criadoDesde) {
      params.push(APP_TIMEZONE);
      params.push(criadoDesde);
      queryStr += ` AND (p.created_at AT TIME ZONE $${params.length - 1})::date >= $${params.length}::date`;
    }

    if (search) {
      params.push(`%${search}%`);
      queryStr += ` AND (p.descricao ILIKE $${params.length} OR p.codigo_barras ILIKE $${params.length} OR p.marca ILIKE $${params.length})`;
    }

    queryStr += ' ORDER BY p.created_at DESC LIMIT 500';

    const products = await query(queryStr, params);
    res.json(products);
  } catch (error) {
    sendError(res, error, 'Erro ao listar produtos');
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
    sendError(res, error, 'Erro ao buscar produto');
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
    sendError(res, error, 'Erro ao buscar dados');
  }
}

// Foto da peça (para usuários logados; a loja pública só mostra fotos de peças digitais)
export async function getPhoto(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const [photo] = await sql`
      SELECT mime, encode(dados, 'base64') as base64 FROM product_photos WHERE product_id = ${id}
    `;

    if (!photo) {
      return res.status(404).json({ error: 'Peça sem foto' });
    }

    // A URL leva a data da foto (?v=), então pode ficar em cache até a foto mudar
    res.setHeader('Cache-Control', req.query.v ? 'private, max-age=31536000, immutable' : 'private, no-cache');
    res.type(String(photo.mime)).send(Buffer.from(String(photo.base64), 'base64'));
  } catch (error) {
    sendError(res, error, 'Erro ao buscar foto');
  }
}

// Envia ou substitui a foto da peça (corpo da requisição = arquivo JPEG, PNG ou WebP)
export async function uploadPhoto(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const data = req.body;

    if (!Buffer.isBuffer(data) || data.length === 0) {
      return res.status(400).json({ error: 'Envie a foto no corpo da requisição' });
    }
    if (data.length > MAX_PHOTO_BYTES) {
      return res.status(413).json({ error: 'Foto muito grande (máximo 3 MB)' });
    }

    const mime = detectImageMime(data);
    if (!mime) {
      return res.status(400).json({ error: 'Formato de foto não suportado (use JPEG, PNG ou WebP)' });
    }

    const [product] = await sql`SELECT id FROM products WHERE id = ${id}`;
    if (!product) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    const [photo] = await sql`
      INSERT INTO product_photos (product_id, mime, dados, updated_at)
      VALUES (${id}, ${mime}, decode(${data.toString('base64')}, 'base64'), CURRENT_TIMESTAMP)
      ON CONFLICT (product_id) DO UPDATE
        SET mime = EXCLUDED.mime, dados = EXCLUDED.dados, updated_at = CURRENT_TIMESTAMP
      RETURNING updated_at as foto_atualizada_em
    `;

    res.json(photo);
  } catch (error) {
    sendError(res, error, 'Erro ao salvar foto');
  }
}

export async function deletePhoto(req: Request, res: Response) {
  try {
    const { id } = req.params;
    await sql`DELETE FROM product_photos WHERE product_id = ${id}`;
    res.json({ message: 'Foto removida' });
  } catch (error) {
    sendError(res, error, 'Erro ao remover foto');
  }
}
