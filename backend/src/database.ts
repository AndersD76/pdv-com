import { neon, neonConfig, NeonQueryFunction, Pool, types } from '@neondatabase/serverless';
import ws from 'ws';
import dotenv from 'dotenv';

dotenv.config();

// Transações interativas usam o Pool (WebSocket); o Node 18 não tem WebSocket global
neonConfig.webSocketConstructor = ws;

// Fuso horário do negócio: define o que é "hoje", "mês atual", hora do ponto etc.
export const APP_TIMEZONE = process.env.APP_TIMEZONE || 'America/Sao_Paulo';

// Conversão dos tipos retornados pelo Postgres (vale para HTTP e para o Pool):
// - DATE (1082) fica como texto 'AAAA-MM-DD'; convertê-lo para Date desloca o dia conforme o fuso
// - NUMERIC (1700) e BIGINT (20, ex.: COUNT) viram number
types.setTypeParser(1082, (value: string) => value);
types.setTypeParser(1700, (value: string) => parseFloat(value));
types.setTypeParser(20, (value: string) => parseInt(value, 10));

function getDatabaseUrl(): string {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error('ERRO: DATABASE_URL não configurada!');
    console.error('Variáveis de ambiente disponíveis:', Object.keys(process.env).filter(k => !k.includes('SECRET') && !k.includes('PASSWORD') && !k.includes('URL')));
    throw new Error('DATABASE_URL não configurada');
  }
  return DATABASE_URL;
}

// Cliente SQL do Neon (HTTP) - inicialização lazy
let neonClient: NeonQueryFunction<false, false> | null = null;

function getClient(): NeonQueryFunction<false, false> {
  if (!neonClient) {
    console.log('Inicializando conexão com o banco de dados...');
    neonClient = neon(getDatabaseUrl());
  }
  return neonClient;
}

// Pool para transações interativas - inicialização lazy
let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: getDatabaseUrl(), max: 5, idleTimeoutMillis: 30_000 });
    pool.on('error', (error) => console.error('Erro no pool de conexões:', error));
  }
  return pool;
}

// Criar um proxy para o sql que inicializa sob demanda
type SqlFunction = NeonQueryFunction<false, false>;

const sqlHandler: ProxyHandler<SqlFunction> = {
  apply(_target, thisArg, args) {
    const client = getClient();
    return Reflect.apply(client, thisArg, args);
  },
  get(_target, property) {
    return Reflect.get(getClient(), property);
  }
};

// Exportar sql como função que pode ser usada como tagged template (e sql.transaction)
export const sql = new Proxy((() => {}) as unknown as SqlFunction, sqlHandler);

// Executa uma query com placeholders $1, $2... (o mesmo placeholder pode se repetir)
export async function query<T = Record<string, unknown>>(queryString: string, params: unknown[] = []): Promise<T[]> {
  const client = getClient();
  try {
    return await client(queryString, params) as T[];
  } catch (error) {
    console.error('Erro na query:', error);
    throw error;
  }
}

// Função para executar query e retornar um único resultado
export async function queryOne<T = Record<string, unknown>>(queryString: string, params: unknown[] = []): Promise<T | null> {
  const results = await query<T>(queryString, params);
  return results[0] || null;
}

export interface Tx {
  query<T = Record<string, unknown>>(queryString: string, params?: unknown[]): Promise<T[]>;
  queryOne<T = Record<string, unknown>>(queryString: string, params?: unknown[]): Promise<T | null>;
}

// Executa `fn` dentro de uma transação: COMMIT se tudo der certo, ROLLBACK se lançar erro
export async function withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  const tx: Tx = {
    async query(queryString, params = []) {
      const result = await client.query(queryString, params);
      return result.rows;
    },
    async queryOne(queryString, params = []) {
      const result = await client.query(queryString, params);
      return result.rows[0] ?? null;
    }
  };

  try {
    await client.query('BEGIN');
    const result = await fn(tx);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

// Tabelas criadas por este sistema (usadas nas migrações)
const APP_TABLES = [
  'users', 'suppliers', 'sellers', 'consignment_lists', 'products', 'sales', 'sale_items',
  'seller_commissions', 'supplier_payments', 'product_photos', 'store_settings', 'online_orders', 'descriptions', 'colors', 'sizes', 'brands',
  'employees', 'time_clock', 'work_schedule', 'customers'
];

async function columnExists(table: string, column: string): Promise<boolean> {
  const client = getClient();
  const [row] = await client`
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = ${table} AND column_name = ${column}
  `;
  return Boolean(row);
}

// Garante que a sequência de códigos (V00001, L0001...) nunca volte para trás
async function syncCodeSequence(sequence: string, table: string, prefix: string): Promise<void> {
  const client = getClient();
  await client(`CREATE SEQUENCE IF NOT EXISTS ${sequence}`);
  const [row] = await client(`
    SELECT GREATEST(
      (SELECT COALESCE(MAX(SUBSTRING(codigo FROM 2)::int), 0) FROM ${table} WHERE codigo ~ '^${prefix}[0-9]+$'),
      (SELECT CASE WHEN is_called THEN last_value ELSE 0 END FROM ${sequence})
    ) AS ultimo
  `);
  const ultimo = Number(row.ultimo);
  if (ultimo > 0) {
    await client(`SELECT setval('${sequence}', $1)`, [ultimo]);
  }
}

// Inicialização do banco de dados - Criação das tabelas e migrações
export async function initializeDatabase(): Promise<void> {
  const client = getClient();
  console.log('Inicializando banco de dados...');

  // Valida o fuso configurado (lança erro se APP_TIMEZONE for inválido)
  await client`SELECT now() AT TIME ZONE ${APP_TIMEZONE}`;

  // Tabela de Usuários (login)
  await client`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(255) NOT NULL,
      usuario VARCHAR(50) NOT NULL UNIQUE,
      senha_hash TEXT NOT NULL,
      perfil VARCHAR(20) NOT NULL DEFAULT 'operador' CHECK (perfil IN ('admin', 'operador')),
      ativo BOOLEAN NOT NULL DEFAULT TRUE,
      deve_trocar_senha BOOLEAN NOT NULL DEFAULT FALSE,
      token_version INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `;

  // Tabela de Fornecedores
  await client`
    CREATE TABLE IF NOT EXISTS suppliers (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(255) NOT NULL,
      cpf VARCHAR(14) UNIQUE,
      telefone VARCHAR(20),
      email VARCHAR(255),
      endereco TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `;

  // Tabela de Vendedoras
  await client`
    CREATE TABLE IF NOT EXISTS sellers (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(255) NOT NULL,
      cpf VARCHAR(14) UNIQUE,
      telefone VARCHAR(20),
      email VARCHAR(255),
      comissao_percentual DECIMAL(5,2) DEFAULT 10.00,
      ativo BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `;

  // Tabela de Listas de Consignação
  await client`
    CREATE TABLE IF NOT EXISTS consignment_lists (
      id SERIAL PRIMARY KEY,
      codigo VARCHAR(20) UNIQUE NOT NULL,
      fornecedor_id INTEGER NOT NULL REFERENCES suppliers(id),
      data_recebimento DATE NOT NULL,
      prazo_retirada DATE NOT NULL,
      status VARCHAR(20) DEFAULT 'DIGITADA' CHECK (status IN ('DIGITADA', 'EXPORTADA', 'FINALIZADA')),
      observacoes TEXT,
      pago BOOLEAN DEFAULT FALSE,
      data_pagamento TIMESTAMPTZ,
      valor_pago DECIMAL(10,2),
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `;

  // Adicionar colunas de pagamento se não existirem (para bancos já criados)
  await client`ALTER TABLE consignment_lists ADD COLUMN IF NOT EXISTS pago BOOLEAN DEFAULT FALSE`;
  await client`ALTER TABLE consignment_lists ADD COLUMN IF NOT EXISTS data_pagamento TIMESTAMPTZ`;
  await client`ALTER TABLE consignment_lists ADD COLUMN IF NOT EXISTS valor_pago DECIMAL(10,2)`;

  // Tabela de Produtos
  await client`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      codigo_barras VARCHAR(50) UNIQUE NOT NULL,
      descricao VARCHAR(255) NOT NULL,
      cor VARCHAR(100),
      marca VARCHAR(100),
      tamanho VARCHAR(20),
      condicao VARCHAR(20) DEFAULT 'SEMI_NOVA' CHECK (condicao IN ('NOVA', 'SEMI_NOVA', 'USADA')),
      defeitos TEXT,
      valor_compra DECIMAL(10,2) NOT NULL,
      valor_venda DECIMAL(10,2) NOT NULL,
      status VARCHAR(20) DEFAULT 'DISPONIVEL' CHECK (status IN ('DISPONIVEL', 'VENDIDO', 'DEVOLVIDO')),
      lista_id INTEGER NOT NULL REFERENCES consignment_lists(id),
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `;

  // Tabela de Vendas
  await client`
    CREATE TABLE IF NOT EXISTS sales (
      id SERIAL PRIMARY KEY,
      codigo VARCHAR(20) UNIQUE NOT NULL,
      data_venda TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      valor_total DECIMAL(10,2) NOT NULL,
      desconto DECIMAL(10,2) DEFAULT 0,
      valor_final DECIMAL(10,2) NOT NULL,
      forma_pagamento VARCHAR(20) NOT NULL CHECK (forma_pagamento IN ('DINHEIRO', 'PIX', 'CARTAO_CREDITO', 'CARTAO_DEBITO')),
      cliente_nome VARCHAR(255),
      vendedora_id INTEGER REFERENCES sellers(id),
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `;

  // Tabela de Itens da Venda
  await client`
    CREATE TABLE IF NOT EXISTS sale_items (
      id SERIAL PRIMARY KEY,
      venda_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      produto_id INTEGER NOT NULL REFERENCES products(id),
      valor_unitario DECIMAL(10,2) NOT NULL
    )
  `;

  // Tabela de Comissões das Vendedoras
  await client`
    CREATE TABLE IF NOT EXISTS seller_commissions (
      id SERIAL PRIMARY KEY,
      vendedora_id INTEGER NOT NULL REFERENCES sellers(id),
      venda_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      valor_venda DECIMAL(10,2) NOT NULL,
      percentual_comissao DECIMAL(5,2) NOT NULL,
      valor_comissao DECIMAL(10,2) NOT NULL,
      pago BOOLEAN DEFAULT FALSE,
      data_pagamento TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `;

  // Pagamentos feitos aos fornecedores (cada pagamento quita as peças vendidas até aquele momento)
  await client`
    CREATE TABLE IF NOT EXISTS supplier_payments (
      id SERIAL PRIMARY KEY,
      lista_id INTEGER NOT NULL REFERENCES consignment_lists(id),
      valor DECIMAL(10,2) NOT NULL,
      quantidade_pecas INTEGER NOT NULL DEFAULT 0,
      usuario_id INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `;

  // Tabelas de Cadastros Auxiliares
  await client`
    CREATE TABLE IF NOT EXISTS descriptions (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(100) NOT NULL UNIQUE
    )
  `;

  await client`
    CREATE TABLE IF NOT EXISTS colors (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(100) NOT NULL UNIQUE
    )
  `;

  await client`
    CREATE TABLE IF NOT EXISTS sizes (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(20) NOT NULL,
      categoria VARCHAR(20) DEFAULT 'roupa',
      UNIQUE(nome, categoria)
    )
  `;

  await client`
    CREATE TABLE IF NOT EXISTS brands (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(100) NOT NULL UNIQUE
    )
  `;

  // ==================== DEPARTAMENTO PESSOAL ====================

  // Tabela de Funcionários
  await client`
    CREATE TABLE IF NOT EXISTS employees (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(255) NOT NULL,
      cpf VARCHAR(14) UNIQUE,
      cargo VARCHAR(100) NOT NULL,
      departamento VARCHAR(100),
      salario_base DECIMAL(10,2) NOT NULL,
      data_admissao DATE NOT NULL,
      dependentes INTEGER DEFAULT 0,
      status VARCHAR(20) DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
      email VARCHAR(255),
      telefone VARCHAR(20),
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `;

  // Tabela de Registro de Ponto
  await client`
    CREATE TABLE IF NOT EXISTS time_clock (
      id SERIAL PRIMARY KEY,
      funcionario_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
      funcionario_nome VARCHAR(255) NOT NULL,
      data DATE NOT NULL,
      hora TIME NOT NULL,
      tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('entrada', 'saida')),
      observacao TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `;

  // Tabela de Configuração de Jornada
  await client`
    CREATE TABLE IF NOT EXISTS work_schedule (
      id SERIAL PRIMARY KEY,
      seg_sex_entrada TIME DEFAULT '08:00:00',
      seg_sex_saida TIME DEFAULT '18:00:00',
      intervalo_inicio TIME DEFAULT '12:00:00',
      intervalo_fim TIME DEFAULT '13:00:00',
      sabado_entrada TIME,
      sabado_saida TIME,
      carga_horaria_diaria INTEGER DEFAULT 8,
      tolerancia_minutos INTEGER DEFAULT 10,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `;

  // Tabela de Clientes
  await client`
    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(255) NOT NULL,
      cpf VARCHAR(14) UNIQUE,
      telefone VARCHAR(20),
      email VARCHAR(255),
      endereco TEXT,
      cidade VARCHAR(100),
      estado VARCHAR(2),
      cep VARCHAR(9),
      data_nascimento DATE,
      observacoes TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `;

  // ==================== MIGRAÇÕES ====================

  // TIMESTAMP sem fuso -> TIMESTAMPTZ. Os valores foram gravados com CURRENT_TIMESTAMP no fuso
  // da sessão do banco, e a conversão implícita usa esse mesmo fuso, então o instante é preservado.
  const legacyTimestamps = await client`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND data_type = 'timestamp without time zone'
      AND table_name::text = ANY(${APP_TABLES}::text[])
  ` as Array<{ table_name: string; column_name: string }>;
  for (const { table_name, column_name } of legacyTimestamps) {
    console.log(`Migrando ${table_name}.${column_name} para TIMESTAMPTZ...`);
    await client(`ALTER TABLE "${table_name}" ALTER COLUMN "${column_name}" TYPE TIMESTAMPTZ`);
  }

  // Vendas: cancelamento sem apagar o histórico + usuário que registrou
  await client`ALTER TABLE sales ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'CONCLUIDA' CHECK (status IN ('CONCLUIDA', 'CANCELADA'))`;
  await client`ALTER TABLE sales ADD COLUMN IF NOT EXISTS usuario_id INTEGER REFERENCES users(id)`;
  await client`ALTER TABLE sales ADD COLUMN IF NOT EXISTS cancelada_em TIMESTAMPTZ`;
  await client`ALTER TABLE sales ADD COLUMN IF NOT EXISTS cancelada_por INTEGER REFERENCES users(id)`;
  await client`ALTER TABLE sales ADD COLUMN IF NOT EXISTS motivo_cancelamento TEXT`;

  // Listas: contador de peças para gerar códigos de barras sem repetição
  if (!(await columnExists('consignment_lists', 'ultimo_item'))) {
    await client.transaction([
      client`ALTER TABLE consignment_lists ADD COLUMN ultimo_item INTEGER NOT NULL DEFAULT 0`,
      // Código de barras = número da lista + número da peça; recupera o maior número de peça já usado
      // (só nas listas do sistema, L0001...; listas importadas usam outra sequência)
      client`
        UPDATE consignment_lists cl SET ultimo_item = COALESCE((
          SELECT MAX(SUBSTRING(p.codigo_barras FROM LENGTH(cl.codigo))::int)
          FROM products p
          WHERE p.lista_id = cl.id
            AND p.codigo_barras LIKE SUBSTRING(cl.codigo FROM 2) || '%'
            AND SUBSTRING(p.codigo_barras FROM LENGTH(cl.codigo)) ~ '^[0-9]{1,9}$'
        ), 0)
        WHERE cl.codigo ~ '^L[0-9]+$'
      `
    ]);
  }

  // Produtos: controle de pagamento ao fornecedor por peça
  if (!(await columnExists('products', 'pago_fornecedor'))) {
    await client.transaction([
      client`
        ALTER TABLE products
          ADD COLUMN pago_fornecedor BOOLEAN NOT NULL DEFAULT FALSE,
          ADD COLUMN pagamento_id INTEGER REFERENCES supplier_payments(id)
      `,
      // Listas pagas no modelo antigo: registra o pagamento e marca as peças vendidas até a data dele
      client`
        INSERT INTO supplier_payments (lista_id, valor, quantidade_pecas, created_at)
        SELECT cl.id,
          COALESCE(cl.valor_pago, (
            SELECT COALESCE(SUM(p.valor_compra), 0) FROM products p
            WHERE p.lista_id = cl.id AND p.status = 'VENDIDO'
              AND (cl.data_pagamento IS NULL OR p.updated_at <= cl.data_pagamento)
          )),
          (
            SELECT COUNT(*) FROM products p
            WHERE p.lista_id = cl.id AND p.status = 'VENDIDO'
              AND (cl.data_pagamento IS NULL OR p.updated_at <= cl.data_pagamento)
          ),
          COALESCE(cl.data_pagamento, CURRENT_TIMESTAMP)
        FROM consignment_lists cl
        WHERE cl.pago = TRUE
      `,
      client`
        UPDATE products p SET pago_fornecedor = TRUE, pagamento_id = sp.id
        FROM supplier_payments sp
        JOIN consignment_lists cl ON cl.id = sp.lista_id
        WHERE p.lista_id = cl.id AND cl.pago = TRUE AND p.status = 'VENDIDO'
          AND (cl.data_pagamento IS NULL OR p.updated_at <= cl.data_pagamento)
      `
    ]);
  }

  // Produtos: canal de venda (loja física ou digital/Instagram) e textos para a loja online
  await client`ALTER TABLE products ADD COLUMN IF NOT EXISTS canal VARCHAR(10) NOT NULL DEFAULT 'FISICA' CHECK (canal IN ('FISICA', 'DIGITAL'))`;
  await client`ALTER TABLE products ADD COLUMN IF NOT EXISTS titulo_loja VARCHAR(150)`;
  await client`ALTER TABLE products ADD COLUMN IF NOT EXISTS descricao_loja TEXT`;

  // Foto principal de cada peça (cadastro, loja online e catálogo do Instagram)
  await client`
    CREATE TABLE IF NOT EXISTS product_photos (
      product_id INTEGER PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
      mime VARCHAR(30) NOT NULL,
      dados BYTEA NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `;

  // Vendas: origem (balcão/PDV ou loja online)
  await client`ALTER TABLE sales ADD COLUMN IF NOT EXISTS origem VARCHAR(10) NOT NULL DEFAULT 'PDV' CHECK (origem IN ('PDV', 'ONLINE'))`;

  // Configurações da loja online (chave/valor, editadas pelo administrador)
  await client`
    CREATE TABLE IF NOT EXISTS store_settings (
      chave VARCHAR(60) PRIMARY KEY,
      valor TEXT,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `;

  // Pedidos da loja online (pagamento pelo checkout da InfinitePay)
  await client`
    CREATE TABLE IF NOT EXISTS online_orders (
      id SERIAL PRIMARY KEY,
      codigo VARCHAR(20) UNIQUE NOT NULL,
      order_nsu VARCHAR(64) UNIQUE NOT NULL,
      product_id INTEGER NOT NULL REFERENCES products(id),
      status VARCHAR(20) NOT NULL DEFAULT 'AGUARDANDO_PAGAMENTO'
        CHECK (status IN ('AGUARDANDO_PAGAMENTO', 'PAGO', 'SEPARADO', 'ENTREGUE', 'CANCELADO', 'PAGO_SEM_ESTOQUE')),
      valor_produto DECIMAL(10,2) NOT NULL,
      valor_frete DECIMAL(10,2) NOT NULL DEFAULT 0,
      valor_total DECIMAL(10,2) NOT NULL,
      entrega VARCHAR(20) NOT NULL CHECK (entrega IN ('RETIRADA', 'ENTREGA_LOCAL', 'CORREIOS')),
      cliente_nome VARCHAR(255) NOT NULL,
      cliente_telefone VARCHAR(30) NOT NULL,
      cliente_email VARCHAR(255),
      cep VARCHAR(9),
      endereco VARCHAR(255),
      numero VARCHAR(20),
      complemento VARCHAR(100),
      bairro VARCHAR(100),
      cidade VARCHAR(100),
      uf VARCHAR(2),
      checkout_url TEXT,
      expira_em TIMESTAMPTZ NOT NULL,
      pago_em TIMESTAMPTZ,
      forma_pagamento VARCHAR(20),
      parcelas INTEGER,
      valor_pago DECIMAL(10,2),
      transaction_nsu VARCHAR(100),
      invoice_slug VARCHAR(100),
      receipt_url TEXT,
      venda_id INTEGER REFERENCES sales(id),
      separado_em TIMESTAMPTZ,
      entregue_em TIMESTAMPTZ,
      ip VARCHAR(64),
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `;
  await client`CREATE INDEX IF NOT EXISTS idx_online_orders_product_id ON online_orders(product_id)`;
  await client`CREATE INDEX IF NOT EXISTS idx_online_orders_status ON online_orders(status)`;
  await syncCodeSequence('online_orders_codigo_seq', 'online_orders', 'P');

  // Códigos de venda e de lista gerados por sequência (sem corrida e sem reaproveitar códigos)
  await syncCodeSequence('sales_codigo_seq', 'sales', 'V');
  await syncCodeSequence('consignment_lists_codigo_seq', 'consignment_lists', 'L');
  // Códigos de barras de peças em listas importadas (ver nextGlobalBarcode no controller de consignação)
  await client`CREATE SEQUENCE IF NOT EXISTS products_codigo_barras_seq`;

  // Índices para as novas tabelas
  await client`CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status)`;
  await client`CREATE INDEX IF NOT EXISTS idx_employees_cpf ON employees(cpf)`;
  await client`CREATE INDEX IF NOT EXISTS idx_time_clock_funcionario_id ON time_clock(funcionario_id)`;
  await client`CREATE INDEX IF NOT EXISTS idx_time_clock_data ON time_clock(data)`;
  await client`CREATE INDEX IF NOT EXISTS idx_customers_cpf ON customers(cpf)`;
  await client`CREATE INDEX IF NOT EXISTS idx_customers_nome ON customers(nome)`;

  // Criar índices para melhor performance
  await client`CREATE INDEX IF NOT EXISTS idx_products_lista_id ON products(lista_id)`;
  await client`CREATE INDEX IF NOT EXISTS idx_products_status ON products(status)`;
  await client`CREATE INDEX IF NOT EXISTS idx_products_codigo_barras ON products(codigo_barras)`;
  await client`CREATE INDEX IF NOT EXISTS idx_consignment_lists_fornecedor_id ON consignment_lists(fornecedor_id)`;
  await client`CREATE INDEX IF NOT EXISTS idx_consignment_lists_status ON consignment_lists(status)`;
  await client`CREATE INDEX IF NOT EXISTS idx_sales_data_venda ON sales(data_venda)`;
  await client`CREATE INDEX IF NOT EXISTS idx_sales_vendedora_id ON sales(vendedora_id)`;
  await client`CREATE INDEX IF NOT EXISTS idx_sale_items_venda_id ON sale_items(venda_id)`;
  await client`CREATE INDEX IF NOT EXISTS idx_sale_items_produto_id ON sale_items(produto_id)`;
  await client`CREATE INDEX IF NOT EXISTS idx_seller_commissions_vendedora_id ON seller_commissions(vendedora_id)`;
  await client`CREATE INDEX IF NOT EXISTS idx_supplier_payments_lista_id ON supplier_payments(lista_id)`;
  await client`CREATE INDEX IF NOT EXISTS idx_products_canal ON products(canal)`;

  console.log('Banco de dados inicializado com sucesso!');
}

// Função para verificar conexão
export async function testConnection(): Promise<boolean> {
  try {
    const client = getClient();
    await client`SELECT 1`;
    console.log('Conexão com o banco de dados estabelecida!');
    return true;
  } catch (error) {
    console.error('Erro ao conectar com o banco de dados:', error);
    return false;
  }
}
