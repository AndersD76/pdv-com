import { neon, neonConfig, NeonQueryFunction } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();

// Configuração para melhor performance
neonConfig.fetchConnectionCache = true;

// Cliente SQL do Neon - inicialização lazy
let neonClient: NeonQueryFunction<false, false> | null = null;

function getClient(): NeonQueryFunction<false, false> {
  if (!neonClient) {
    const DATABASE_URL = process.env.DATABASE_URL;
    if (!DATABASE_URL) {
      console.error('ERRO: DATABASE_URL não configurada!');
      console.error('Variáveis de ambiente disponíveis:', Object.keys(process.env).filter(k => !k.includes('SECRET') && !k.includes('PASSWORD') && !k.includes('URL')));
      throw new Error('DATABASE_URL não configurada');
    }
    console.log('Inicializando conexão com o banco de dados...');
    neonClient = neon(DATABASE_URL);
  }
  return neonClient;
}

// Criar um proxy para o sql que inicializa sob demanda
type SqlFunction = NeonQueryFunction<false, false>;

const sqlHandler: ProxyHandler<SqlFunction> = {
  apply(_target, thisArg, args) {
    const client = getClient();
    return Reflect.apply(client, thisArg, args);
  }
};

// Exportar sql como função que pode ser usada como tagged template
export const sql = new Proxy((() => {}) as unknown as SqlFunction, sqlHandler);

// Tipo para os resultados das queries
type QueryResult = Record<string, unknown>[];

// Função para executar queries com parâmetros dinâmicos
export async function query<T = Record<string, unknown>>(queryString: string, params: unknown[] = []): Promise<T[]> {
  const client = getClient();
  try {
    // Se não há parâmetros, executar diretamente
    if (params.length === 0) {
      const templateStrings = Object.assign([queryString], { raw: [queryString] }) as TemplateStringsArray;
      const result = await (client as unknown as (strings: TemplateStringsArray) => Promise<QueryResult>)(templateStrings);
      return result as T[];
    }
    // Se há parâmetros, dividir a query nos placeholders
    const parts = queryString.split(/\$\d+/);
    const strings = Object.assign(parts, { raw: parts }) as TemplateStringsArray;
    const result = await (client as unknown as (strings: TemplateStringsArray, ...values: unknown[]) => Promise<QueryResult>)(strings, ...params);
    return result as T[];
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

// Inicialização do banco de dados - Criação das tabelas
export async function initializeDatabase(): Promise<void> {
  const client = getClient();
  console.log('Inicializando banco de dados...');

  // Tabela de Fornecedores
  await client`
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
  await client`
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
      data_pagamento TIMESTAMP,
      valor_pago DECIMAL(10,2),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  // Adicionar colunas de pagamento se não existirem (para bancos já criados)
  try {
    await client`ALTER TABLE consignment_lists ADD COLUMN IF NOT EXISTS pago BOOLEAN DEFAULT FALSE`;
    await client`ALTER TABLE consignment_lists ADD COLUMN IF NOT EXISTS data_pagamento TIMESTAMP`;
    await client`ALTER TABLE consignment_lists ADD COLUMN IF NOT EXISTS valor_pago DECIMAL(10,2)`;
  } catch (e) {
    // Colunas já existem
  }

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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  // Tabela de Vendas
  await client`
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
      data_pagamento TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

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
  await client`CREATE INDEX IF NOT EXISTS idx_seller_commissions_vendedora_id ON seller_commissions(vendedora_id)`;

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
