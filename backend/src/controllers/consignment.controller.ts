import { Request, Response } from 'express';
import { sql, query } from '../database.js';
import { z } from 'zod';

const listSchema = z.object({
  fornecedor_id: z.number().positive('Fornecedor é obrigatório'),
  data_recebimento: z.string(),
  prazo_retirada: z.string(),
  observacoes: z.string().optional()
});

const productSchema = z.object({
  descricao: z.string().min(1, 'Descrição é obrigatória'),
  cor: z.string().optional(),
  marca: z.string().optional(),
  tamanho: z.string().optional(),
  condicao: z.enum(['NOVA', 'SEMI_NOVA', 'USADA']).default('SEMI_NOVA'),
  defeitos: z.string().optional(),
  valor_compra: z.number().positive('Valor de compra é obrigatório'),
  valor_venda: z.number().positive('Valor de venda é obrigatório')
});

// Gerar próximo código de lista
async function getNextListCode(): Promise<string> {
  const [result] = await sql`
    SELECT codigo FROM consignment_lists
    ORDER BY id DESC LIMIT 1
  `;

  if (!result) {
    return 'L0001';
  }

  const lastNumber = parseInt(result.codigo.replace('L', ''));
  const nextNumber = lastNumber + 1;
  return `L${nextNumber.toString().padStart(4, '0')}`;
}

// Gerar código de barras para produto
function generateBarcode(listCode: string, itemNumber: number): string {
  const listNum = listCode.replace('L', '');
  const itemNum = itemNumber.toString().padStart(4, '0');
  return `${listNum}${itemNum}`;
}

// Listar todas as listas
export async function getAll(req: Request, res: Response) {
  try {
    const { status, fornecedor_id, search } = req.query;

    let queryStr = `
      SELECT cl.*,
        s.nome as fornecedor_nome,
        (SELECT COUNT(*) FROM products WHERE lista_id = cl.id) as total_pecas,
        (SELECT COUNT(*) FROM products WHERE lista_id = cl.id AND status = 'DISPONIVEL') as pecas_disponiveis,
        (SELECT COUNT(*) FROM products WHERE lista_id = cl.id AND status = 'VENDIDO') as pecas_vendidas,
        (SELECT COUNT(*) FROM products WHERE lista_id = cl.id AND status = 'DEVOLVIDO') as pecas_devolvidas,
        (SELECT COALESCE(SUM(valor_venda), 0) FROM products WHERE lista_id = cl.id) as valor_total,
        (SELECT COALESCE(SUM(valor_compra), 0) FROM products WHERE lista_id = cl.id AND status = 'VENDIDO') as valor_a_pagar,
        (SELECT COALESCE(SUM(valor_venda), 0) FROM products WHERE lista_id = cl.id AND status = 'VENDIDO') as valor_vendido
      FROM consignment_lists cl
      JOIN suppliers s ON s.id = cl.fornecedor_id
      WHERE 1=1
    `;

    const params: unknown[] = [];

    if (status) {
      params.push(status);
      queryStr += ` AND cl.status = $${params.length}`;
    }

    if (fornecedor_id) {
      params.push(fornecedor_id);
      queryStr += ` AND cl.fornecedor_id = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      queryStr += ` AND (cl.codigo ILIKE $${params.length} OR s.nome ILIKE $${params.length})`;
    }

    queryStr += ' ORDER BY cl.created_at DESC';

    const lists = await query(queryStr, params);
    res.json(lists);
  } catch (error) {
    console.error('Erro ao listar consignações:', error);
    res.status(500).json({ error: 'Erro ao listar consignações' });
  }
}

// Buscar lista por ID com produtos
export async function getById(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const [list] = await sql`
      SELECT cl.*, s.nome as fornecedor_nome, s.cpf as fornecedor_cpf,
        s.telefone as fornecedor_telefone, s.email as fornecedor_email
      FROM consignment_lists cl
      JOIN suppliers s ON s.id = cl.fornecedor_id
      WHERE cl.id = ${id}
    `;

    if (!list) {
      return res.status(404).json({ error: 'Lista não encontrada' });
    }

    const products = await sql`
      SELECT * FROM products WHERE lista_id = ${id} ORDER BY id
    `;

    res.json({ ...list, products });
  } catch (error) {
    console.error('Erro ao buscar lista:', error);
    res.status(500).json({ error: 'Erro ao buscar lista' });
  }
}

// Criar nova lista
export async function create(req: Request, res: Response) {
  try {
    const data = listSchema.parse(req.body);
    const codigo = await getNextListCode();

    const [list] = await sql`
      INSERT INTO consignment_lists (codigo, fornecedor_id, data_recebimento, prazo_retirada, observacoes)
      VALUES (${codigo}, ${data.fornecedor_id}, ${data.data_recebimento}, ${data.prazo_retirada}, ${data.observacoes || null})
      RETURNING *
    `;

    res.status(201).json(list);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Erro ao criar lista:', error);
    res.status(500).json({ error: 'Erro ao criar lista' });
  }
}

// Atualizar lista
export async function update(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const data = listSchema.parse(req.body);

    const [list] = await sql`
      UPDATE consignment_lists
      SET fornecedor_id = ${data.fornecedor_id},
          data_recebimento = ${data.data_recebimento},
          prazo_retirada = ${data.prazo_retirada},
          observacoes = ${data.observacoes || null},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *
    `;

    if (!list) {
      return res.status(404).json({ error: 'Lista não encontrada' });
    }

    res.json(list);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Erro ao atualizar lista:', error);
    res.status(500).json({ error: 'Erro ao atualizar lista' });
  }
}

// Alterar status da lista
export async function updateStatus(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['DIGITADA', 'EXPORTADA', 'FINALIZADA'].includes(status)) {
      return res.status(400).json({ error: 'Status inválido' });
    }

    // Se for finalizar, verificar se todas as peças foram resolvidas
    if (status === 'FINALIZADA') {
      const [pendingProducts] = await sql`
        SELECT COUNT(*) as count FROM products WHERE lista_id = ${id} AND status = 'DISPONIVEL'
      `;
      if (pendingProducts && Number(pendingProducts.count) > 0) {
        return res.status(400).json({ error: 'Existem peças disponíveis. Venda ou devolva todas as peças antes de finalizar.' });
      }
    }

    const [list] = await sql`
      UPDATE consignment_lists
      SET status = ${status}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *
    `;

    if (!list) {
      return res.status(404).json({ error: 'Lista não encontrada' });
    }

    res.json(list);
  } catch (error) {
    console.error('Erro ao atualizar status:', error);
    res.status(500).json({ error: 'Erro ao atualizar status' });
  }
}

// Excluir lista
export async function remove(req: Request, res: Response) {
  try {
    const { id } = req.params;

    // Verificar se tem produtos vendidos
    const [soldProducts] = await sql`
      SELECT COUNT(*) as count FROM products WHERE lista_id = ${id} AND status = 'VENDIDO'
    `;
    if (soldProducts && Number(soldProducts.count) > 0) {
      return res.status(400).json({ error: 'Não é possível excluir lista com produtos vendidos' });
    }

    // Excluir produtos da lista primeiro
    await sql`DELETE FROM products WHERE lista_id = ${id}`;

    const [list] = await sql`DELETE FROM consignment_lists WHERE id = ${id} RETURNING *`;

    if (!list) {
      return res.status(404).json({ error: 'Lista não encontrada' });
    }

    res.json({ message: 'Lista excluída com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir lista:', error);
    res.status(500).json({ error: 'Erro ao excluir lista' });
  }
}

// Adicionar produto à lista
export async function addProduct(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const data = productSchema.parse(req.body);

    // Buscar lista
    const [list] = await sql`SELECT * FROM consignment_lists WHERE id = ${id}`;
    if (!list) {
      return res.status(404).json({ error: 'Lista não encontrada' });
    }

    if (list.status === 'FINALIZADA') {
      return res.status(400).json({ error: 'Não é possível adicionar produtos a uma lista finalizada' });
    }

    // Contar produtos existentes para gerar código
    const [countResult] = await sql`SELECT COUNT(*) as count FROM products WHERE lista_id = ${id}`;
    const itemNumber = Number(countResult?.count || 0) + 1;
    const codigoBarras = generateBarcode(list.codigo, itemNumber);

    const [product] = await sql`
      INSERT INTO products (codigo_barras, descricao, cor, marca, tamanho, condicao, defeitos, valor_compra, valor_venda, lista_id)
      VALUES (${codigoBarras}, ${data.descricao}, ${data.cor || null}, ${data.marca || null}, ${data.tamanho || null},
        ${data.condicao}, ${data.defeitos || null}, ${data.valor_compra}, ${data.valor_venda}, ${id})
      RETURNING *
    `;

    res.status(201).json(product);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Erro ao adicionar produto:', error);
    res.status(500).json({ error: 'Erro ao adicionar produto' });
  }
}

// Atualizar produto
export async function updateProduct(req: Request, res: Response) {
  try {
    const { id, productId } = req.params;
    const data = productSchema.parse(req.body);

    // Verificar se produto pertence à lista
    const [existingProduct] = await sql`
      SELECT p.*, cl.status as lista_status
      FROM products p
      JOIN consignment_lists cl ON cl.id = p.lista_id
      WHERE p.id = ${productId} AND p.lista_id = ${id}
    `;

    if (!existingProduct) {
      return res.status(404).json({ error: 'Produto não encontrado nesta lista' });
    }

    if (existingProduct.lista_status === 'FINALIZADA') {
      return res.status(400).json({ error: 'Não é possível editar produtos de uma lista finalizada' });
    }

    if (existingProduct.status === 'VENDIDO') {
      return res.status(400).json({ error: 'Não é possível editar produto já vendido' });
    }

    const [product] = await sql`
      UPDATE products
      SET descricao = ${data.descricao},
          cor = ${data.cor || null},
          marca = ${data.marca || null},
          tamanho = ${data.tamanho || null},
          condicao = ${data.condicao},
          defeitos = ${data.defeitos || null},
          valor_compra = ${data.valor_compra},
          valor_venda = ${data.valor_venda},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${productId}
      RETURNING *
    `;

    res.json(product);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Erro ao atualizar produto:', error);
    res.status(500).json({ error: 'Erro ao atualizar produto' });
  }
}

// Remover produto da lista
export async function removeProduct(req: Request, res: Response) {
  try {
    const { id, productId } = req.params;

    const [product] = await sql`
      SELECT p.*, cl.status as lista_status
      FROM products p
      JOIN consignment_lists cl ON cl.id = p.lista_id
      WHERE p.id = ${productId} AND p.lista_id = ${id}
    `;

    if (!product) {
      return res.status(404).json({ error: 'Produto não encontrado nesta lista' });
    }

    if (product.lista_status === 'FINALIZADA') {
      return res.status(400).json({ error: 'Não é possível remover produtos de uma lista finalizada' });
    }

    if (product.status === 'VENDIDO') {
      return res.status(400).json({ error: 'Não é possível remover produto já vendido' });
    }

    await sql`DELETE FROM products WHERE id = ${productId}`;

    res.json({ message: 'Produto removido com sucesso' });
  } catch (error) {
    console.error('Erro ao remover produto:', error);
    res.status(500).json({ error: 'Erro ao remover produto' });
  }
}

// Devolver produto
export async function returnProduct(req: Request, res: Response) {
  try {
    const { productId } = req.params;

    const [product] = await sql`
      SELECT * FROM products WHERE id = ${productId}
    `;

    if (!product) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    if (product.status !== 'DISPONIVEL') {
      return res.status(400).json({ error: 'Apenas produtos disponíveis podem ser devolvidos' });
    }

    const [updated] = await sql`
      UPDATE products
      SET status = 'DEVOLVIDO', updated_at = CURRENT_TIMESTAMP
      WHERE id = ${productId}
      RETURNING *
    `;

    res.json(updated);
  } catch (error) {
    console.error('Erro ao devolver produto:', error);
    res.status(500).json({ error: 'Erro ao devolver produto' });
  }
}

// Devolver todos os produtos disponíveis de uma lista
export async function returnAllProducts(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const result = await sql`
      UPDATE products
      SET status = 'DEVOLVIDO', updated_at = CURRENT_TIMESTAMP
      WHERE lista_id = ${id} AND status = 'DISPONIVEL'
      RETURNING *
    ` as Record<string, unknown>[];

    res.json({ message: `${result.length} produtos devolvidos` });
  } catch (error) {
    console.error('Erro ao devolver produtos:', error);
    res.status(500).json({ error: 'Erro ao devolver produtos' });
  }
}

// Marcar lista como paga
export async function markAsPaid(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { valor_pago } = req.body;

    // Buscar lista
    const [list] = await sql`SELECT * FROM consignment_lists WHERE id = ${id}`;
    if (!list) {
      return res.status(404).json({ error: 'Lista não encontrada' });
    }

    if (list.pago) {
      return res.status(400).json({ error: 'Esta lista já foi paga' });
    }

    // Calcular valor a pagar (soma do valor_compra dos produtos vendidos)
    const [totalResult] = await sql`
      SELECT COALESCE(SUM(valor_compra), 0) as valor_a_pagar
      FROM products
      WHERE lista_id = ${id} AND status = 'VENDIDO'
    `;

    const valorAPagar = Number(totalResult?.valor_a_pagar) || 0;
    const valorPago = valor_pago !== undefined ? Number(valor_pago) : valorAPagar;

    const [updated] = await sql`
      UPDATE consignment_lists
      SET pago = TRUE,
          data_pagamento = CURRENT_TIMESTAMP,
          valor_pago = ${valorPago},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *
    `;

    res.json(updated);
  } catch (error) {
    console.error('Erro ao marcar lista como paga:', error);
    res.status(500).json({ error: 'Erro ao marcar lista como paga' });
  }
}

// Relatório de pagamentos de fornecedores
export async function getPaymentReport(req: Request, res: Response) {
  try {
    const { inicio, fim, pago, fornecedor_id } = req.query;

    let queryStr = `
      SELECT cl.*,
        s.nome as fornecedor_nome,
        s.cpf as fornecedor_cpf,
        (SELECT COUNT(*) FROM products WHERE lista_id = cl.id AND status = 'VENDIDO') as pecas_vendidas,
        (SELECT COALESCE(SUM(valor_compra), 0) FROM products WHERE lista_id = cl.id AND status = 'VENDIDO') as valor_a_pagar
      FROM consignment_lists cl
      JOIN suppliers s ON s.id = cl.fornecedor_id
      WHERE 1=1
    `;

    const params: unknown[] = [];

    if (inicio && fim) {
      params.push(inicio, fim);
      queryStr += ` AND cl.data_recebimento BETWEEN $${params.length - 1} AND $${params.length}`;
    }

    if (pago !== undefined) {
      params.push(pago === 'true');
      queryStr += ` AND cl.pago = $${params.length}`;
    }

    if (fornecedor_id) {
      params.push(fornecedor_id);
      queryStr += ` AND cl.fornecedor_id = $${params.length}`;
    }

    queryStr += ' ORDER BY cl.data_recebimento DESC';

    const lists = await query<{
      valor_a_pagar: string | number;
      valor_pago: string | number;
      pago: boolean;
      [key: string]: unknown;
    }>(queryStr, params);

    // Totais
    const totalAPagar = lists.reduce((sum, l) => sum + (Number(l.valor_a_pagar) || 0), 0);
    const totalPago = lists.filter(l => l.pago)
      .reduce((sum, l) => sum + (Number(l.valor_pago) || 0), 0);
    const totalPendente = lists.filter(l => !l.pago)
      .reduce((sum, l) => sum + (Number(l.valor_a_pagar) || 0), 0);

    res.json({
      lists,
      totals: {
        total_listas: lists.length,
        listas_pagas: lists.filter(l => l.pago).length,
        listas_pendentes: lists.filter(l => !l.pago).length,
        total_a_pagar: totalAPagar,
        total_pago: totalPago,
        total_pendente: totalPendente
      }
    });
  } catch (error) {
    console.error('Erro ao gerar relatório de pagamentos:', error);
    res.status(500).json({ error: 'Erro ao gerar relatório de pagamentos' });
  }
}
