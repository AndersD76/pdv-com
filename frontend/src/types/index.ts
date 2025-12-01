// Enums
export enum ProductStatus {
  DISPONIVEL = 'DISPONIVEL',
  VENDIDO = 'VENDIDO',
  DEVOLVIDO = 'DEVOLVIDO'
}

export enum ProductCondition {
  NOVA = 'NOVA',
  SEMI_NOVA = 'SEMI_NOVA',
  USADA = 'USADA'
}

export enum ListStatus {
  DIGITADA = 'DIGITADA',
  EXPORTADA = 'EXPORTADA',
  FINALIZADA = 'FINALIZADA'
}

export enum PaymentMethod {
  DINHEIRO = 'DINHEIRO',
  PIX = 'PIX',
  CARTAO_CREDITO = 'CARTAO_CREDITO',
  CARTAO_DEBITO = 'CARTAO_DEBITO'
}

// Interfaces
export interface Supplier {
  id: number;
  nome: string;
  cpf: string | null;
  telefone: string | null;
  email: string | null;
  endereco: string | null;
  created_at: string;
  updated_at: string;
}

export interface Seller {
  id: number;
  nome: string;
  cpf: string | null;
  telefone: string | null;
  email: string | null;
  comissao_percentual: number;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: number;
  codigo_barras: string;
  descricao: string;
  cor: string | null;
  marca: string | null;
  tamanho: string | null;
  condicao: ProductCondition;
  defeitos: string | null;
  valor_compra: number;
  valor_venda: number;
  status: ProductStatus;
  lista_id: number;
  lista_codigo?: string;
  fornecedor_nome?: string;
  created_at: string;
  updated_at: string;
}

export interface ConsignmentList {
  id: number;
  codigo: string;
  fornecedor_id: number;
  fornecedor_nome?: string;
  fornecedor_cpf?: string;
  fornecedor_telefone?: string;
  fornecedor_email?: string;
  data_recebimento: string;
  prazo_retirada: string;
  status: ListStatus;
  observacoes: string | null;
  pago?: boolean;
  data_pagamento?: string | null;
  valor_pago?: number | null;
  total_pecas?: number;
  pecas_disponiveis?: number;
  pecas_vendidas?: number;
  pecas_devolvidas?: number;
  valor_total?: number;
  valor_a_pagar?: number;
  valor_vendido?: number;
  products?: Product[];
  created_at: string;
  updated_at: string;
}

export interface Sale {
  id: number;
  codigo: string;
  data_venda: string;
  valor_total: number;
  desconto: number;
  valor_final: number;
  forma_pagamento: PaymentMethod;
  cliente_nome: string | null;
  vendedora_id: number | null;
  vendedora_nome?: string;
  total_itens?: number;
  items?: SaleItem[];
  created_at: string;
}

export interface SaleItem {
  id: number;
  venda_id: number;
  produto_id: number;
  valor_unitario: number;
  codigo_barras?: string;
  descricao?: string;
  cor?: string;
  marca?: string;
  tamanho?: string;
  valor_compra?: number;
  lista_codigo?: string;
  fornecedor_nome?: string;
}

export interface SellerCommission {
  id: number;
  vendedora_id: number;
  venda_id: number;
  valor_venda: number;
  percentual_comissao: number;
  valor_comissao: number;
  pago: boolean;
  data_pagamento: string | null;
  venda_codigo?: string;
  data_venda?: string;
  created_at: string;
}

// Cadastros auxiliares
export interface Description {
  id: number;
  nome: string;
}

export interface Color {
  id: number;
  nome: string;
}

export interface Size {
  id: number;
  nome: string;
  categoria: string;
}

export interface Brand {
  id: number;
  nome: string;
}

export interface Auxiliaries {
  descriptions: Description[];
  colors: Color[];
  sizes: Size[];
  brands: Brand[];
}

// Dashboard
export interface DashboardData {
  productStats: {
    total_pecas: number;
    pecas_disponiveis: number;
    pecas_vendidas: number;
    pecas_devolvidas: number;
    valor_estoque: number;
  };
  salesToday: {
    quantidade: number;
    valor_total: number;
  };
  salesMonth: {
    quantidade: number;
    valor_total: number;
  };
  expiringLists: ConsignmentList[];
  expiredLists: ConsignmentList[];
  recentSales: Sale[];
  topSuppliers: {
    id: number;
    nome: string;
    total_listas: number;
    total_pecas: number;
    pecas_vendidas: number;
    valor_vendido: number;
  }[];
  salesByPayment: {
    forma_pagamento: PaymentMethod;
    quantidade: number;
    total: number;
  }[];
  topSellers: {
    id: number;
    nome: string;
    total_vendas: number;
    valor_vendido: number;
    comissao: number;
  }[];
  pendingCommissions: {
    quantidade: number;
    valor_total: number;
  };
}

// Carrinho do PDV
export interface CartItem {
  product: Product;
  valor_unitario: number;
}
