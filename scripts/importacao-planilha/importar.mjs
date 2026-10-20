// Grava no banco a carga gerada pelo extrair.py: fornecedores, vendedoras, listas, peças (disponíveis, vendidas
// e devolvidas), vendas do período (código "H…") com itens e comissões.
// Pode ser rodado de novo com uma planilha mais nova: atualiza o que mudou, acrescenta as vendas novas e remove
// o que saiu da planilha. Peças que já foram vendidas ou reservadas pelo próprio sistema não são alteradas.
//
// Uso: DATABASE_URL=... node importar.mjs carga.json            (simulação: desfaz tudo no final)
//      DATABASE_URL=... node importar.mjs carga.json --gravar   (grava)
import { readFileSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(new URL('../../backend/package.json', import.meta.url));
const { Pool, neonConfig } = require('@neondatabase/serverless');
neonConfig.webSocketConstructor = require('ws');

const MARCA = 'Importada da planilha';
const TZ = 'America/Sao_Paulo';
const [arquivo, ...flags] = process.argv.slice(2);
const gravar = flags.includes('--gravar');
if (!arquivo || !process.env.DATABASE_URL) {
  console.error('Uso: DATABASE_URL=... node importar.mjs carga.json [--gravar]');
  process.exit(1);
}
const carga = JSON.parse(readFileSync(arquivo, 'utf-8'));
const norm = (s) => String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[.\s]+/g, ' ').trim();
const importada = (obs) => String(obs ?? '').startsWith(MARCA);

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const db = await pool.connect();
const q = async (text, params) => (await db.query(text, params)).rows;
const resumo = {
  fornecedores_novos: 0, vendedoras_novas: 0, listas_novas: 0, listas_atualizadas: 0,
  pecas_novas: 0, pecas_atualizadas: 0, pecas_removidas: 0, vendas_novas: 0, vendas_removidas: 0, comissoes_novas: 0
};
const conflitos = [];

try {
  await q('BEGIN');

  // Forma de pagamento "OUTRO" (troca, crédito na loja, bônus...), caso o servidor ainda não tenha migrado
  const [formaCheck] = await q(
    `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'sales'::regclass AND conname = 'sales_forma_pagamento_check'`
  );
  if (!formaCheck || !formaCheck.def.includes('OUTRO')) {
    await q('ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_forma_pagamento_check');
    await q(`ALTER TABLE sales ADD CONSTRAINT sales_forma_pagamento_check
             CHECK (forma_pagamento IN ('DINHEIRO', 'PIX', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'OUTRO'))`);
  }

  // Fornecedores (casados pelo nome, sem diferenciar maiúsculas, acentos e pontos)
  const fornecedorId = new Map((await q('SELECT id, nome FROM suppliers ORDER BY id')).map((f) => [norm(f.nome), f.id]));
  for (const nome of [...carga.fornecedores, 'Loja']) {
    if (fornecedorId.has(norm(nome))) continue;
    const [novo] = await q('INSERT INTO suppliers (nome) VALUES ($1) RETURNING id', [nome]);
    fornecedorId.set(norm(nome), novo.id);
    resumo.fornecedores_novos++;
  }

  // Vendedoras (o primeiro nome da planilha casa com o nome completo já cadastrado)
  let vendedoras = await q('SELECT id, nome, comissao_percentual FROM sellers ORDER BY id');
  const comissaoPadrao = vendedoras[0]?.comissao_percentual ?? 3;
  const acharVendedora = (nome) => vendedoras.find((s) => norm(s.nome) === norm(nome) || norm(s.nome).split(' ')[0] === norm(nome));
  for (const v of carga.vendedoras) {
    if (acharVendedora(v.nome)) continue;
    await q('INSERT INTO sellers (nome, comissao_percentual, ativo) VALUES ($1, $2, $3)', [v.nome, comissaoPadrao, v.ativo]);
    resumo.vendedoras_novas++;
  }
  vendedoras = await q('SELECT id, nome, comissao_percentual FROM sellers ORDER BY id');

  // Listas
  const listaId = new Map();
  for (const l of carga.listas) {
    const fornecedor = fornecedorId.get(norm(l.fornecedor));
    const obs = `${MARCA} (${l.aba ? `aba "${l.aba}"` : 'lista sem aba na planilha'}${l.compra_da_loja ? `, compra da loja: ${l.origem}` : ''}${l.data_estimada ? ', data estimada' : ''})`;
    const [existente] = await q('SELECT id, observacoes FROM consignment_lists WHERE codigo = $1', [l.codigo]);
    if (existente && !importada(existente.observacoes)) {
      conflitos.push(`lista ${l.codigo} já existe no sistema e não veio da planilha; ignorada`);
      continue;
    }
    if (existente) {
      await q(
        `UPDATE consignment_lists SET fornecedor_id = $2, data_recebimento = $3, prazo_retirada = $4, observacoes = $5, status = $6, updated_at = now()
         WHERE id = $1`,
        [existente.id, fornecedor, l.data_recebimento, l.prazo_retirada, obs, l.status]
      );
      listaId.set(l.codigo, existente.id);
      resumo.listas_atualizadas++;
    } else {
      const [nova] = await q(
        `INSERT INTO consignment_lists (codigo, fornecedor_id, data_recebimento, prazo_retirada, status, observacoes, ultimo_item, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, 0, ($3::date + time '12:00') AT TIME ZONE '${TZ}') RETURNING id`,
        [l.codigo, fornecedor, l.data_recebimento, l.prazo_retirada, l.status, obs]
      );
      listaId.set(l.codigo, nova.id);
      resumo.listas_novas++;
    }
  }

  // Peças
  const pecas = carga.listas.filter((l) => listaId.has(l.codigo))
    .flatMap((l) => l.pecas.map((p) => ({ ...p, lista_id: listaId.get(l.codigo), recebimento: l.data_recebimento })));
  const existentes = new Map(
    (await q(
      `SELECT p.codigo_barras, p.id, cl.observacoes,
         EXISTS (SELECT 1 FROM sale_items si JOIN sales s ON s.id = si.venda_id WHERE si.produto_id = p.id AND s.codigo NOT LIKE 'H%') AS vendida_no_sistema,
         EXISTS (SELECT 1 FROM online_orders o WHERE o.product_id = p.id) AS tem_pedido
       FROM products p JOIN consignment_lists cl ON cl.id = p.lista_id
       WHERE p.codigo_barras = ANY($1::text[])`,
      [pecas.map((p) => p.codigo_barras)]
    )).map((r) => [r.codigo_barras, r])
  );
  const novas = [];
  const atualizar = [];
  for (const p of pecas) {
    const e = existentes.get(p.codigo_barras);
    if (!e) novas.push(p);
    else if (!importada(e.observacoes)) conflitos.push(`código ${p.codigo_barras} já usado por outra peça do sistema; peça "${p.descricao}" ignorada`);
    else if (!e.vendida_no_sistema && !e.tem_pedido) atualizar.push({ ...p, id: e.id });
  }
  const colunas = (lista, ...chaves) => chaves.map((k) => lista.map((p) => p[k]));
  if (atualizar.length) {
    const atualizadas = await q(
      `UPDATE products p SET descricao = t.descricao, cor = t.cor, marca = t.marca, tamanho = t.tamanho, valor_compra = t.compra,
              valor_venda = t.venda, lista_id = t.lista, status = t.status, pago_fornecedor = t.pago, updated_at = now()
       FROM unnest($1::int[], $2::text[], $3::text[], $4::text[], $5::text[], $6::numeric[], $7::numeric[], $8::int[], $9::text[], $10::bool[])
         AS t(id, descricao, cor, marca, tamanho, compra, venda, lista, status, pago)
       WHERE p.id = t.id
         AND (p.descricao, p.cor, p.marca, p.tamanho, p.valor_compra, p.valor_venda, p.lista_id, p.status, p.pago_fornecedor)
             IS DISTINCT FROM (t.descricao, t.cor, t.marca, t.tamanho, t.compra, t.venda, t.lista, t.status, t.pago)
       RETURNING p.id`,
      colunas(atualizar, 'id', 'descricao', 'cor', 'marca', 'tamanho', 'valor_compra', 'valor_venda', 'lista_id', 'status', 'pago_fornecedor')
    );
    resumo.pecas_atualizadas = atualizadas.length;
  }
  if (novas.length) {
    const inseridas = await q(
      `INSERT INTO products (codigo_barras, descricao, cor, marca, tamanho, condicao, valor_compra, valor_venda, status, pago_fornecedor,
                             lista_id, canal, created_at, updated_at)
       SELECT codigo, descricao, cor, marca, tamanho, 'SEMI_NOVA', compra, venda, status, pago, lista, 'FISICA',
              (receb + time '12:00') AT TIME ZONE '${TZ}', now()
       FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::numeric[], $7::numeric[], $8::text[], $9::bool[], $10::int[], $11::date[])
         AS t(codigo, descricao, cor, marca, tamanho, compra, venda, status, pago, lista, receb)
       RETURNING id`,
      colunas(novas, 'codigo_barras', 'descricao', 'cor', 'marca', 'tamanho', 'valor_compra', 'valor_venda', 'status', 'pago_fornecedor', 'lista_id', 'recebimento')
    );
    resumo.pecas_novas = inseridas.length;
  }

  // Vendas da planilha (código "H…"): remove as que saíram da carga (se a comissão ainda não foi paga) e grava as novas
  const codigosCarga = carga.vendas.map((v) => v.codigo);
  const removidas = await q(
    `DELETE FROM sales s WHERE s.codigo LIKE 'H%' AND NOT (s.codigo = ANY($1::text[]))
       AND NOT EXISTS (SELECT 1 FROM seller_commissions sc WHERE sc.venda_id = s.id AND sc.pago)
     RETURNING id`,
    [codigosCarga]
  );
  resumo.vendas_removidas = removidas.length;
  const jaGravadas = new Set((await q(`SELECT codigo FROM sales WHERE codigo LIKE 'H%'`)).map((r) => r.codigo));
  const produtoId = new Map(
    (await q('SELECT id, codigo_barras FROM products WHERE codigo_barras = ANY($1::text[])', [carga.vendas.map((v) => v.codigo_barras)]))
      .map((r) => [r.codigo_barras, r.id])
  );
  const vendasNovas = [];
  for (const v of carga.vendas) {
    if (jaGravadas.has(v.codigo)) continue;
    const produto = produtoId.get(v.codigo_barras);
    if (!produto) {
      conflitos.push(`venda ${v.codigo} (${v.data}, peça ${v.codigo_barras}) sem peça no sistema; ignorada`);
      continue;
    }
    const vendedora = v.vendedora ? acharVendedora(v.vendedora) : null;
    vendasNovas.push({
      ...v, produto,
      vendedora_id: vendedora?.id ?? null,
      comissao: vendedora ? Number(vendedora.comissao_percentual) : null,
      cliente: v.forma_pagamento === 'OUTRO' ? (v.forma_texto || 'Forma não informada na planilha').slice(0, 255) : null,
    });
  }
  if (vendasNovas.length) {
    const ids = await q(
      `INSERT INTO sales (codigo, data_venda, valor_total, desconto, valor_final, forma_pagamento, cliente_nome, vendedora_id, status, origem, created_at)
       SELECT codigo, (dia + time '12:00') AT TIME ZONE '${TZ}', valor, 0, valor, forma, cliente, vendedora, 'CONCLUIDA', 'PDV',
              (dia + time '12:00') AT TIME ZONE '${TZ}'
       FROM unnest($1::text[], $2::date[], $3::numeric[], $4::text[], $5::text[], $6::int[]) AS t(codigo, dia, valor, forma, cliente, vendedora)
       RETURNING id, codigo`,
      colunas(vendasNovas, 'codigo', 'data', 'valor', 'forma_pagamento', 'cliente', 'vendedora_id')
    );
    const vendaId = new Map(ids.map((r) => [r.codigo, r.id]));
    for (const v of vendasNovas) v.venda_id = vendaId.get(v.codigo);
    await q(
      `INSERT INTO sale_items (venda_id, produto_id, valor_unitario)
       SELECT * FROM unnest($1::int[], $2::int[], $3::numeric[])`,
      colunas(vendasNovas, 'venda_id', 'produto', 'valor')
    );
    const comVendedora = vendasNovas.filter((v) => v.vendedora_id);
    if (comVendedora.length) {
      const comissoes = await q(
        `INSERT INTO seller_commissions (vendedora_id, venda_id, valor_venda, percentual_comissao, valor_comissao, pago, created_at)
         SELECT vendedora, venda, valor, pct, round(valor * pct / 100, 2), false, (dia + time '12:00') AT TIME ZONE '${TZ}'
         FROM unnest($1::int[], $2::int[], $3::numeric[], $4::numeric[], $5::date[]) AS t(vendedora, venda, valor, pct, dia)
         RETURNING id`,
        colunas(comVendedora, 'vendedora_id', 'venda_id', 'valor', 'comissao', 'data')
      );
      resumo.comissoes_novas = comissoes.length;
    }
    resumo.vendas_novas = vendasNovas.length;
  }

  // Peças de listas importadas que saíram da planilha (sem venda nem pedido no sistema)
  const removidasPecas = await q(
    `DELETE FROM products p USING consignment_lists cl
     WHERE p.lista_id = cl.id AND cl.observacoes LIKE $1
       AND NOT (p.codigo_barras = ANY($2::text[]))
       AND NOT EXISTS (SELECT 1 FROM sale_items si WHERE si.produto_id = p.id)
       AND NOT EXISTS (SELECT 1 FROM online_orders o WHERE o.product_id = p.id)
     RETURNING p.id`,
    [`${MARCA}%`, pecas.map((p) => p.codigo_barras)]
  );
  resumo.pecas_removidas = removidasPecas.length;

  // Novas listas continuam a numeração da planilha (L4613, L4614...)
  const maior = Math.max(0, ...carga.listas.filter((l) => /^L\d+$/.test(l.codigo)).map((l) => Number(l.codigo.slice(1))));
  if (maior) {
    await q(
      `SELECT setval('consignment_lists_codigo_seq', GREATEST($1, (SELECT CASE WHEN is_called THEN last_value ELSE 0 END FROM consignment_lists_codigo_seq)))`,
      [maior]
    );
  }

  const [total] = await q(
    `SELECT (SELECT COUNT(*) FROM suppliers)::int fornecedores, (SELECT COUNT(*) FROM sellers)::int vendedoras,
            (SELECT COUNT(*) FROM consignment_lists)::int listas,
            (SELECT COUNT(*) FROM products WHERE status = 'DISPONIVEL')::int pecas_disponiveis,
            (SELECT COALESCE(SUM(valor_venda), 0) FROM products WHERE status = 'DISPONIVEL')::float valor_disponivel,
            (SELECT COUNT(*) FROM products WHERE status = 'VENDIDO')::int pecas_vendidas,
            (SELECT COUNT(*) FROM sales WHERE status = 'CONCLUIDA')::int vendas,
            (SELECT COALESCE(SUM(valor_final), 0) FROM sales WHERE status = 'CONCLUIDA')::float valor_vendas,
            (SELECT COALESCE(SUM(valor_compra), 0) FROM products WHERE status = 'VENDIDO' AND NOT pago_fornecedor)::float a_pagar_fornecedores`
  );
  await q(gravar ? 'COMMIT' : 'ROLLBACK');
  console.log(gravar ? 'GRAVADO no banco.' : 'SIMULAÇÃO (nada foi gravado). Use --gravar para gravar.');
  console.log('Alterações:', resumo);
  console.log('Banco depois da carga:', total);
  if (conflitos.length) console.log(`Conflitos (${conflitos.length}):\n  ` + conflitos.slice(0, 30).join('\n  '));
} catch (error) {
  await q('ROLLBACK').catch(() => {});
  console.error('Erro, nada foi gravado:', error.message);
  process.exitCode = 1;
} finally {
  db.release();
  await pool.end();
}
