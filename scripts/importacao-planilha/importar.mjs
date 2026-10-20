// Grava no banco a carga gerada pelo extrair.py (fornecedores, vendedoras, listas e peças em estoque).
// Pode ser rodado de novo com uma planilha mais nova: atualiza o que mudou e remove peças de listas
// importadas que saíram do estoque na planilha (desde que não tenham venda nem pedido no sistema).
//
// Uso: DATABASE_URL=... node importar.mjs carga.json            (simulação: desfaz tudo no final)
//      DATABASE_URL=... node importar.mjs carga.json --gravar   (grava)
import { readFileSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(new URL('../../backend/package.json', import.meta.url));
const { Pool, neonConfig } = require('@neondatabase/serverless');
neonConfig.webSocketConstructor = require('ws');

const MARCA = 'Importada da planilha';
const [arquivo, ...flags] = process.argv.slice(2);
const gravar = flags.includes('--gravar');
if (!arquivo || !process.env.DATABASE_URL) {
  console.error('Uso: DATABASE_URL=... node importar.mjs carga.json [--gravar]');
  process.exit(1);
}
const carga = JSON.parse(readFileSync(arquivo, 'utf-8'));
const norm = (s) => String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[.\s]+/g, ' ').trim();

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const db = await pool.connect();
const q = async (text, params) => (await db.query(text, params)).rows;
const resumo = { fornecedores_novos: 0, vendedoras_novas: 0, listas_novas: 0, listas_atualizadas: 0, pecas_novas: 0, pecas_atualizadas: 0, pecas_removidas: 0 };
const conflitos = [];

try {
  await q('BEGIN');

  // Fornecedores (casados pelo nome, sem diferenciar maiúsculas, acentos e pontos)
  const fornecedorId = new Map((await q('SELECT id, nome FROM suppliers ORDER BY id')).map((f) => [norm(f.nome), f.id]));
  for (const nome of [...carga.fornecedores, 'Loja']) {
    if (fornecedorId.has(norm(nome))) continue;
    const [novo] = await q('INSERT INTO suppliers (nome) VALUES ($1) RETURNING id', [nome]);
    fornecedorId.set(norm(nome), novo.id);
    resumo.fornecedores_novos++;
  }

  // Vendedoras (o primeiro nome da planilha casa com o nome completo já cadastrado)
  const vendedoras = await q('SELECT id, nome, comissao_percentual FROM sellers ORDER BY id');
  const comissao = vendedoras[0]?.comissao_percentual ?? 3;
  for (const v of carga.vendedoras) {
    const existe = vendedoras.some((s) => norm(s.nome) === norm(v.nome) || norm(s.nome).split(' ')[0] === norm(v.nome));
    if (existe) continue;
    await q('INSERT INTO sellers (nome, comissao_percentual, ativo) VALUES ($1, $2, $3)', [v.nome, comissao, v.ativo]);
    resumo.vendedoras_novas++;
  }

  // Listas
  const listaId = new Map();
  for (const l of carga.listas) {
    const fornecedor = fornecedorId.get(norm(l.fornecedor));
    const obs = `${MARCA} (aba "${l.aba}"${l.compra_da_loja ? `, compra da loja: ${l.origem}` : ''})`;
    const [existente] = await q('SELECT id, observacoes FROM consignment_lists WHERE codigo = $1', [l.codigo]);
    if (existente && !String(existente.observacoes ?? '').startsWith(MARCA)) {
      conflitos.push(`lista ${l.codigo} já existe no sistema e não veio da planilha; ignorada`);
      continue;
    }
    if (existente) {
      await q(
        `UPDATE consignment_lists SET fornecedor_id = $2, data_recebimento = $3, prazo_retirada = $4, observacoes = $5, updated_at = now()
         WHERE id = $1`,
        [existente.id, fornecedor, l.data_recebimento, l.prazo_retirada, obs]
      );
      listaId.set(l.codigo, existente.id);
      resumo.listas_atualizadas++;
    } else {
      const [nova] = await q(
        `INSERT INTO consignment_lists (codigo, fornecedor_id, data_recebimento, prazo_retirada, status, observacoes, ultimo_item, created_at)
         VALUES ($1, $2, $3, $4, 'EXPORTADA', $5, 0, ($3::date + time '12:00') AT TIME ZONE 'America/Sao_Paulo') RETURNING id`,
        [l.codigo, fornecedor, l.data_recebimento, l.prazo_retirada, obs]
      );
      listaId.set(l.codigo, nova.id);
      resumo.listas_novas++;
    }
  }

  // Peças
  const pecas = carga.listas.filter((l) => listaId.has(l.codigo)).flatMap((l) => l.pecas.map((p) => ({ ...p, lista_id: listaId.get(l.codigo), recebimento: l.data_recebimento })));
  const existentes = new Map(
    (await q(
      `SELECT p.codigo_barras, p.id, p.status, cl.observacoes FROM products p JOIN consignment_lists cl ON cl.id = p.lista_id
       WHERE p.codigo_barras = ANY($1::text[])`,
      [pecas.map((p) => p.codigo_barras)]
    )).map((r) => [r.codigo_barras, r])
  );
  const novas = [];
  const atualizar = [];
  for (const p of pecas) {
    const e = existentes.get(p.codigo_barras);
    if (!e) {
      novas.push(p);
    } else if (!String(e.observacoes ?? '').startsWith(MARCA)) {
      conflitos.push(`código ${p.codigo_barras} já usado por outra peça do sistema; peça "${p.descricao}" ignorada`);
    } else if (e.status === 'DISPONIVEL') {
      atualizar.push({ ...p, id: e.id });
    }
  }
  if (atualizar.length) {
    const col = (k) => atualizar.map((p) => p[k]);
    const atualizadas = await q(
      `UPDATE products p SET descricao = t.descricao, cor = t.cor, marca = t.marca, tamanho = t.tamanho, valor_compra = t.compra,
              valor_venda = t.venda, lista_id = t.lista, updated_at = now()
       FROM unnest($1::int[], $2::text[], $3::text[], $4::text[], $5::text[], $6::numeric[], $7::numeric[], $8::int[])
         AS t(id, descricao, cor, marca, tamanho, compra, venda, lista)
       WHERE p.id = t.id
         AND (p.descricao, p.cor, p.marca, p.tamanho, p.valor_compra, p.valor_venda, p.lista_id)
             IS DISTINCT FROM (t.descricao, t.cor, t.marca, t.tamanho, t.compra, t.venda, t.lista)
       RETURNING p.id`,
      [col('id'), col('descricao'), col('cor'), col('marca'), col('tamanho'), col('valor_compra'), col('valor_venda'), col('lista_id')]
    );
    resumo.pecas_atualizadas = atualizadas.length;
  }
  if (novas.length) {
    const col = (k) => novas.map((p) => p[k]);
    const inseridas = await q(
      `INSERT INTO products (codigo_barras, descricao, cor, marca, tamanho, condicao, valor_compra, valor_venda, status, lista_id, canal, created_at, updated_at)
       SELECT codigo, descricao, cor, marca, tamanho, 'SEMI_NOVA', compra, venda, 'DISPONIVEL', lista, 'FISICA',
              (receb + time '12:00') AT TIME ZONE 'America/Sao_Paulo', now()
       FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::numeric[], $7::numeric[], $8::int[], $9::date[])
         AS t(codigo, descricao, cor, marca, tamanho, compra, venda, lista, receb)
       RETURNING id`,
      [col('codigo_barras'), col('descricao'), col('cor'), col('marca'), col('tamanho'), col('valor_compra'), col('valor_venda'), col('lista_id'), col('recebimento')]
    );
    resumo.pecas_novas = inseridas.length;
  }

  // Peças de listas importadas que saíram do estoque na planilha
  const removidas = await q(
    `DELETE FROM products p USING consignment_lists cl
     WHERE p.lista_id = cl.id AND cl.observacoes LIKE $1 AND p.status = 'DISPONIVEL'
       AND NOT (p.codigo_barras = ANY($2::text[]))
       AND NOT EXISTS (SELECT 1 FROM sale_items si WHERE si.produto_id = p.id)
       AND NOT EXISTS (SELECT 1 FROM online_orders o WHERE o.product_id = p.id)
     RETURNING p.id`,
    [`${MARCA}%`, pecas.map((p) => p.codigo_barras)]
  );
  resumo.pecas_removidas = removidas.length;

  // Novas listas continuam a numeração da planilha (L4613, L4614...)
  const maior = Math.max(0, ...carga.listas.filter((l) => l.codigo.startsWith('L')).map((l) => Number(l.codigo.slice(1))));
  if (maior) {
    await q(
      `SELECT setval('consignment_lists_codigo_seq', GREATEST($1, (SELECT CASE WHEN is_called THEN last_value ELSE 0 END FROM consignment_lists_codigo_seq)))`,
      [maior]
    );
  }

  const [total] = await q(
    `SELECT (SELECT COUNT(*) FROM suppliers)::int fornecedores, (SELECT COUNT(*) FROM sellers)::int vendedoras,
            (SELECT COUNT(*) FROM consignment_lists)::int listas, (SELECT COUNT(*) FROM products WHERE status = 'DISPONIVEL')::int pecas_disponiveis,
            (SELECT COALESCE(SUM(valor_venda), 0) FROM products WHERE status = 'DISPONIVEL')::float valor_disponivel`
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
