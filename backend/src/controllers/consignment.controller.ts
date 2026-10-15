import { Request, Response } from 'express';
import { sql, query, withTransaction, Tx } from '../database.js';
import { z } from 'zod';
import { HttpError, sendError, parseDateParam, dateString, round2 } from '../utils/http.js';

const listSchema = z.object({
  fornecedor_id: z.number().positive('Fornecedor é obrigatório'),
  data_recebimento: dateString,
  prazo_retirada: dateString,
  observacoes: z.string().optional()
}).refine((data) => data.prazo_retirada >= data.data_recebimento, {
  message: 'O prazo de retirada não pode ser anterior ao recebimento',
  path: ['prazo_retirada']
});

const statusSchema = z.object({
  status: z.enum(['DIGITADA', 'EXPORTADA', 'FINALIZADA'])
});

const productSchema = z.object({
  descricao: z.string().min(1, 'Descrição é obrigatória'),
  cor: z.string().optional(),
  marca: z.string().optional(),
  tamanho: z.string().optional(),
  condicao: z.enum(['NOVA', 'SEMI_NOVA', 'USADA']).default('SEMI_NOVA'),
  defeitos: z.string().optional(),
  valor_compra: z.number().positive('Valor de compra é obrigatório'),
  valor_venda: z.number().positive('Valor de venda é obrigatório'),
  // Onde a peça é vendida: loja física ou loja digital (vitrine online / Instagram)
  canal: z.enum(['FISICA', 'DIGITAL']).default('FISICA'),
  titulo_loja: z.string().max(150).optional(),
  descricao_loja: z.string().max(5000).optional()
});

// Códigos de barras novos têm 12 dígitos (impressos como EAN-13, como os importados, que
// começam por 1, 2 ou 3): "8" + número da lista (5) + número da peça (6) nas listas do sistema
const MAX_ITEMS_PER_LIST = 999999;
const MAX_STANDARD_LIST_NUMBER = 99999;

// Listas criadas pelo sistema (L0001, L0002...)
const STANDARD_LIST_CODE = /^L\d+$/;

// Gerar código de barras para produto
function generateBarcode(listCode: string, itemNumber: number): string {
  const listNum = listCode.replace('L', '').padStart(5, '0');
  const itemNum = itemNumber.toString().padStart(6, '0');
  return `8${listNum}${itemNum}`;
}

// Listas importadas (código fora do padrão, ex.: LOJA001) ou muito grandes:
// sequência geral "9" + 11 dígitos, que não coincide com os códigos importados nem com os das listas
async function nextGlobalBarcode(tx: Tx): Promise<string> {
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const row = await tx.queryOne<{ codigo: string; existe: boolean }>(
      `SELECT c.codigo, EXISTS (SELECT 1 FROM products WHERE codigo_barras = c.codigo) AS existe
       FROM (SELECT '9' || LPAD(nextval('products_codigo_barras_seq')::text, 11, '0') AS codigo) c`
    );
    if (row && !row.existe) return row.codigo;
  }
  throw new HttpError(500, 'Não foi possível gerar um código de barras único');
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
        (SELECT COALESCE(SUM(valor_compra), 0) FROM products WHERE lista_id = cl.id AND status = 'VENDIDO' AND NOT pago_fornecedor) as valor_a_pagar,
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
      params.push(Number(fornecedor_id));
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
    sendError(res, error, 'Erro ao listar consignações');
  }
}

// Buscar lista por ID com produtos e pagamentos
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
      SELECT p.*, pp.updated_at as foto_atualizada_em
      FROM products p
      LEFT JOIN product_photos pp ON pp.product_id = p.id
      WHERE p.lista_id = ${id}
      ORDER BY p.id
    `;

    const payments = await sql`
      SELECT sp.*, u.nome as usuario_nome
      FROM supplier_payments sp
      LEFT JOIN users u ON u.id = sp.usuario_id
      WHERE sp.lista_id = ${id}
      ORDER BY sp.created_at DESC
    `;

    res.json({ ...list, products, payments });
  } catch (error) {
    sendError(res, error, 'Erro ao buscar lista');
  }
}

// Criar nova lista
export async function create(req: Request, res: Response) {
  try {
    const data = listSchema.parse(req.body);

    const [list] = await sql`
      INSERT INTO consignment_lists (codigo, fornecedor_id, data_recebimento, prazo_retirada, observacoes)
      VALUES ('L' || LPAD(nextval('consignment_lists_codigo_seq')::text, 4, '0'), ${data.fornecedor_id},
        ${data.data_recebimento}, ${data.prazo_retirada}, ${data.observacoes || null})
      RETURNING *
    `;

    res.status(201).json(list);
  } catch (error) {
    sendError(res, error, 'Erro ao criar lista');
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
    sendError(res, error, 'Erro ao atualizar lista');
  }
}

// Alterar status da lista
export async function updateStatus(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { status } = statusSchema.parse(req.body);

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
    sendError(res, error, 'Erro ao atualizar status');
  }
}

// Excluir lista
export async function remove(req: Request, res: Response) {
  try {
    const { id } = req.params;

    // Peças que passaram por alguma venda (mesmo cancelada) mantêm o histórico
    const [withHistory] = await sql`
      SELECT COUNT(*) as count
      FROM products p
      WHERE p.lista_id = ${id}
        AND (p.status = 'VENDIDO' OR EXISTS (SELECT 1 FROM sale_items si WHERE si.produto_id = p.id))
    `;
    if (withHistory && Number(withHistory.count) > 0) {
      return res.status(400).json({ error: 'Não é possível excluir lista com produtos vendidos ou com histórico de vendas' });
    }

    // Excluir produtos e lista na mesma transação
    const [, deleted] = await sql.transaction([
      sql`DELETE FROM products WHERE lista_id = ${id}`,
      sql`DELETE FROM consignment_lists WHERE id = ${id} RETURNING id`
    ]) as Array<Record<string, unknown>[]>;

    if (deleted.length === 0) {
      return res.status(404).json({ error: 'Lista não encontrada' });
    }

    res.json({ message: 'Lista excluída com sucesso' });
  } catch (error) {
    sendError(res, error, 'Erro ao excluir lista');
  }
}

// Adicionar produto à lista
export async function addProduct(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    const data = productSchema.parse(req.body);

    const product = await withTransaction(async (tx) => {
      const list = await tx.queryOne<{ codigo: string; status: string; ultimo_item: number }>(
        'SELECT codigo, status, ultimo_item FROM consignment_lists WHERE id = $1 FOR UPDATE',
        [id]
      );

      if (!list) {
        throw new HttpError(404, 'Lista não encontrada');
      }
      if (list.status === 'FINALIZADA') {
        throw new HttpError(400, 'Não é possível adicionar produtos a uma lista finalizada');
      }

      let barcode: string;
      const standard = STANDARD_LIST_CODE.test(list.codigo)
        && Number(list.codigo.slice(1)) <= MAX_STANDARD_LIST_NUMBER;
      if (standard && list.ultimo_item < MAX_ITEMS_PER_LIST) {
        // Contador por lista: o número da peça nunca se repete, mesmo após remover peças
        const updated = await tx.queryOne<{ ultimo_item: number }>(
          'UPDATE consignment_lists SET ultimo_item = ultimo_item + 1 WHERE id = $1 RETURNING ultimo_item',
          [id]
        );
        barcode = generateBarcode(list.codigo, updated!.ultimo_item);
      } else {
        barcode = await nextGlobalBarcode(tx);
      }

      return tx.queryOne(
        `INSERT INTO products (codigo_barras, descricao, cor, marca, tamanho, condicao, defeitos, valor_compra, valor_venda, lista_id,
           canal, titulo_loja, descricao_loja)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING *`,
        [
          barcode, data.descricao, data.cor || null, data.marca || null,
          data.tamanho || null, data.condicao, data.defeitos || null, data.valor_compra, data.valor_venda, id,
          data.canal, data.titulo_loja || null, data.descricao_loja || null
        ]
      );
    });

    res.status(201).json(product);
  } catch (error) {
    sendError(res, error, 'Erro ao adicionar produto');
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

    // Condição no próprio UPDATE evita editar uma peça vendida entre a checagem e a gravação
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
          canal = ${data.canal},
          titulo_loja = ${data.titulo_loja || null},
          descricao_loja = ${data.descricao_loja || null},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${productId} AND status <> 'VENDIDO'
      RETURNING *
    `;

    if (!product) {
      return res.status(400).json({ error: 'Não é possível editar produto já vendido' });
    }

    res.json(product);
  } catch (error) {
    sendError(res, error, 'Erro ao atualizar produto');
  }
}

// Remover produto da lista
export async function removeProduct(req: Request, res: Response) {
  try {
    const { id, productId } = req.params;

    const [product] = await sql`
      SELECT p.*, cl.status as lista_status,
        EXISTS (SELECT 1 FROM sale_items si WHERE si.produto_id = p.id) as tem_historico
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

    if (product.tem_historico) {
      return res.status(400).json({ error: 'Esta peça tem histórico de venda (cancelada). Use "devolver" em vez de remover.' });
    }

    const [deleted] = await sql`DELETE FROM products WHERE id = ${productId} AND status <> 'VENDIDO' RETURNING id`;
    if (!deleted) {
      return res.status(400).json({ error: 'Não é possível remover produto já vendido' });
    }

    res.json({ message: 'Produto removido com sucesso' });
  } catch (error) {
    sendError(res, error, 'Erro ao remover produto');
  }
}

// Devolver produto
export async function returnProduct(req: Request, res: Response) {
  try {
    const { productId } = req.params;

    const [updated] = await sql`
      UPDATE products
      SET status = 'DEVOLVIDO', updated_at = CURRENT_TIMESTAMP
      WHERE id = ${productId} AND status = 'DISPONIVEL'
      RETURNING *
    `;

    if (!updated) {
      const [product] = await sql`SELECT id FROM products WHERE id = ${productId}`;
      return product
        ? res.status(400).json({ error: 'Apenas produtos disponíveis podem ser devolvidos' })
        : res.status(404).json({ error: 'Produto não encontrado' });
    }

    res.json(updated);
  } catch (error) {
    sendError(res, error, 'Erro ao devolver produto');
  }
}

// Devolver todos os produtos disponíveis de uma lista
export async function returnAllProducts(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const [list] = await sql`SELECT status FROM consignment_lists WHERE id = ${id}`;
    if (!list) {
      return res.status(404).json({ error: 'Lista não encontrada' });
    }

    const result = await sql`
      UPDATE products
      SET status = 'DEVOLVIDO', updated_at = CURRENT_TIMESTAMP
      WHERE lista_id = ${id} AND status = 'DISPONIVEL'
      RETURNING id
    ` as Record<string, unknown>[];

    res.json({ message: `${result.length} produtos devolvidos` });
  } catch (error) {
    sendError(res, error, 'Erro ao devolver produtos');
  }
}

// Registrar pagamento ao fornecedor: quita todas as peças vendidas e ainda não pagas da lista
export async function markAsPaid(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);

    const payment = await withTransaction(async (tx) => {
      const list = await tx.queryOne('SELECT id FROM consignment_lists WHERE id = $1 FOR UPDATE', [id]);
      if (!list) {
        throw new HttpError(404, 'Lista não encontrada');
      }

      // FOR UPDATE impede que um cancelamento de venda aconteça no meio do pagamento
      const pending = await tx.query<{ id: number; valor_compra: number }>(
        `SELECT id, valor_compra FROM products
         WHERE lista_id = $1 AND status = 'VENDIDO' AND NOT pago_fornecedor
         FOR UPDATE`,
        [id]
      );

      if (pending.length === 0) {
        throw new HttpError(400, 'Não há peças vendidas pendentes de pagamento nesta lista');
      }

      const valor = round2(pending.reduce((sum, p) => sum + p.valor_compra, 0));

      const created = await tx.queryOne<{ id: number }>(
        `INSERT INTO supplier_payments (lista_id, valor, quantidade_pecas, usuario_id)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [id, valor, pending.length, req.user!.id]
      );

      await tx.query(
        'UPDATE products SET pago_fornecedor = TRUE, pagamento_id = $1 WHERE id = ANY($2::int[])',
        [created!.id, pending.map((p) => p.id)]
      );

      // Campos acumulados na lista (total já pago e data do último pagamento)
      await tx.query(
        `UPDATE consignment_lists
         SET valor_pago = COALESCE(valor_pago, 0) + $2,
             data_pagamento = CURRENT_TIMESTAMP,
             pago = NOT EXISTS (SELECT 1 FROM products WHERE lista_id = $1 AND status = 'DISPONIVEL'),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [id, valor]
      );

      return created;
    });

    res.json(payment);
  } catch (error) {
    sendError(res, error, 'Erro ao registrar pagamento');
  }
}

// Relatório de pagamentos de fornecedores
export async function getPaymentReport(req: Request, res: Response) {
  try {
    const inicio = parseDateParam(req.query.inicio, 'inicio');
    const fim = parseDateParam(req.query.fim, 'fim');
    const { pago, fornecedor_id } = req.query;

    const params: unknown[] = [];
    let where = 'WHERE 1=1';

    if (inicio) {
      params.push(inicio);
      where += ` AND cl.data_recebimento >= $${params.length}::date`;
    }

    if (fim) {
      params.push(fim);
      where += ` AND cl.data_recebimento <= $${params.length}::date`;
    }

    if (fornecedor_id) {
      params.push(Number(fornecedor_id));
      where += ` AND cl.fornecedor_id = $${params.length}`;
    }

    const pendente = `COALESCE(SUM(p.valor_compra) FILTER (WHERE p.status = 'VENDIDO' AND NOT p.pago_fornecedor), 0)`;
    const pagoTotal = `COALESCE(SUM(p.valor_compra) FILTER (WHERE p.status = 'VENDIDO' AND p.pago_fornecedor), 0)`;

    let having = '';
    if (pago === 'true') {
      having = `HAVING ${pendente} = 0 AND ${pagoTotal} > 0`;
    } else if (pago === 'false') {
      having = `HAVING ${pendente} > 0`;
    }

    const lists = await query<{
      valor_a_pagar: number;
      valor_pago: number;
      [key: string]: unknown;
    }>(`
      SELECT cl.id, cl.codigo, cl.fornecedor_id, cl.data_recebimento, cl.prazo_retirada, cl.status, cl.data_pagamento,
        s.nome as fornecedor_nome,
        s.cpf as fornecedor_cpf,
        COUNT(p.id) FILTER (WHERE p.status = 'VENDIDO') as pecas_vendidas,
        COUNT(p.id) FILTER (WHERE p.status = 'VENDIDO' AND NOT p.pago_fornecedor) as pecas_pendentes,
        ${pendente} as valor_a_pagar,
        ${pagoTotal} as valor_pago
      FROM consignment_lists cl
      JOIN suppliers s ON s.id = cl.fornecedor_id
      LEFT JOIN products p ON p.lista_id = cl.id
      ${where}
      GROUP BY cl.id, s.id
      ${having}
      ORDER BY cl.data_recebimento DESC
    `, params);

    // "Pago" = já houve pagamento e não há nada pendente
    const rows = lists.map((l) => ({ ...l, pago: l.valor_a_pagar === 0 && l.valor_pago > 0 }));

    const totalPago = round2(rows.reduce((sum, l) => sum + l.valor_pago, 0));
    const totalPendente = round2(rows.reduce((sum, l) => sum + l.valor_a_pagar, 0));

    res.json({
      lists: rows,
      totals: {
        total_listas: rows.length,
        listas_pagas: rows.filter(l => l.pago).length,
        listas_pendentes: rows.filter(l => l.valor_a_pagar > 0).length,
        total_a_pagar: round2(totalPago + totalPendente),
        total_pago: totalPago,
        total_pendente: totalPendente
      }
    });
  } catch (error) {
    sendError(res, error, 'Erro ao gerar relatório de pagamentos');
  }
}
