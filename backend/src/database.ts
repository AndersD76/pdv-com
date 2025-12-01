import { neon, neonConfig } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();

// Configuração para melhor performance
neonConfig.fetchConnectionCache = true;

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL não configurada no arquivo .env');
}

// Cliente SQL do Neon
export const sql = neon(DATABASE_URL);

// Função para executar queries
export async function query<T>(queryString: string, params: unknown[] = []): Promise<T[]> {
  try {
    const result = await sql(queryString, params);
    return result as T[];
  } catch (error) {
    console.error('Erro na query:', error);
    throw error;
  }
}

// Função para executar query e retornar um único resultado
export async function queryOne<T>(queryString: string, params: unknown[] = []): Promise<T | null> {
  const results = await query<T>(queryString, params);
  return results[0] || null;
}

// Inicialização do banco de dados - Criação das tabelas
export async function initializeDatabase(): Promise<void> {
  console.log('Inicializando banco de dados...');

  // Tabela de Fornecedores
  await sql`
    CREATE TABLE IF NOT EXISTS suppliers (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(255) NOT NULL,
      cpf VARCHAR(14) UNIQUE,
      telefone VARCHAR(20),
      email VARCHAR(255),
      endereco TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  // Tabela de Vendedoras
  await sql`
    CREATE TABLE IF NOT EXISTS sellers (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(255) NOT NULL,
      cpf VARCHAR(14) UNIQUE,
      telefone VARCHAR(20),
      email VARCHAR(255),
      comissao_percentual DECIMAL(5,2) DEFAULT 10.00,
      ativo BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  // Tabela de Listas de Consignação
  await sql`
    CREATE TABLE IF NOT EXISTS consignment_lists (
      id SERIAL PRIMARY KEY,
      codigo VARCHAR(20) UNIQUE NOT NULL,
      fornecedor_id INTEGER NOT NULL REFERENCES suppliers(id),
      data_recebimento DATE NOT NULL,
      prazo_retirada DATE NOT NULL,
      status VARCHAR(20) DEFAULT 'DIGITADA' CHECK (status IN ('DIGITADA', 'EXPORTADA', 'FINALIZADA')),
      observacoes TEXT,
      pago BOOLEAN DEFAULT FALSE,
      data_pagamento TIMESTAMP,
      valor_pago DECIMAL(10,2),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  // Adicionar colunas de pagamento se não existirem (para bancos já criados)
  try {
    await sql`ALTER TABLE consignment_lists ADD COLUMN IF NOT EXISTS pago BOOLEAN DEFAULT FALSE`;
    await sql`ALTER TABLE consignment_lists ADD COLUMN IF NOT EXISTS data_pagamento TIMESTAMP`;
    await sql`ALTER TABLE consignment_lists ADD COLUMN IF NOT EXISTS valor_pago DECIMAL(10,2)`;
  } catch (e) {
    // Colunas já existem
  }

  // Tabela de Produtos
  await sql`
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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  // Tabela de Vendas
  await sql`
    CREATE TABLE IF NOT EXISTS sales (
      id SERIAL PRIMARY KEY,
      codigo VARCHAR(20) UNIQUE NOT NULL,
      data_venda TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      valor_total DECIMAL(10,2) NOT NULL,
      desconto DECIMAL(10,2) DEFAULT 0,
      valor_final DECIMAL(10,2) NOT NULL,
      forma_pagamento VARCHAR(20) NOT NULL CHECK (forma_pagamento IN ('DINHEIRO', 'PIX', 'CARTAO_CREDITO', 'CARTAO_DEBITO')),
      cliente_nome VARCHAR(255),
      vendedora_id INTEGER REFERENCES sellers(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  // Tabela de Itens da Venda
  await sql`
    CREATE TABLE IF NOT EXISTS sale_items (
      id SERIAL PRIMARY KEY,
      venda_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      produto_id INTEGER NOT NULL REFERENCES products(id),
      valor_unitario DECIMAL(10,2) NOT NULL
    )
  `;

  // Tabela de Comissões das Vendedoras
  await sql`
    CREATE TABLE IF NOT EXISTS seller_commissions (
      id SERIAL PRIMARY KEY,
      vendedora_id INTEGER NOT NULL REFERENCES sellers(id),
      venda_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      valor_venda DECIMAL(10,2) NOT NULL,
      percentual_comissao DECIMAL(5,2) NOT NULL,
      valor_comissao DECIMAL(10,2) NOT NULL,
      pago BOOLEAN DEFAULT FALSE,
      data_pagamento TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  // Tabelas de Cadastros Auxiliares
  await sql`
    CREATE TABLE IF NOT EXISTS descriptions (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(100) NOT NULL UNIQUE
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS colors (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(100) NOT NULL UNIQUE
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS sizes (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(20) NOT NULL,
      categoria VARCHAR(20) DEFAULT 'roupa',
      UNIQUE(nome, categoria)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS brands (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(100) NOT NULL UNIQUE
    )
  `;

  // Criar índices para melhor performance
  await sql`CREATE INDEX IF NOT EXISTS idx_products_lista_id ON products(lista_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_products_status ON products(status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_products_codigo_barras ON products(codigo_barras)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_consignment_lists_fornecedor_id ON consignment_lists(fornecedor_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_consignment_lists_status ON consignment_lists(status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_sales_data_venda ON sales(data_venda)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_sales_vendedora_id ON sales(vendedora_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_sale_items_venda_id ON sale_items(venda_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_seller_commissions_vendedora_id ON seller_commissions(vendedora_id)`;

  console.log('Banco de dados inicializado com sucesso!');
}

// Função para verificar conexão
export async function testConnection(): Promise<boolean> {
  try {
    await sql`SELECT 1`;
    console.log('Conexão com o banco de dados estabelecida!');
    return true;
  } catch (error) {
    console.error('Erro ao conectar com o banco de dados:', error);
    return false;
  }
}
