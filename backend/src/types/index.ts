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
  created_at: Date;
  updated_at: Date;
}

export interface Seller {
  id: number;
  nome: string;
  cpf: string | null;
  telefone: string | null;
  email: string | null;
  comissao_percentual: number; // Percentual de comissão (ex: 10.00 = 10%)
  ativo: boolean;
  created_at: Date;
  updated_at: Date;
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
  created_at: Date;
  updated_at: Date;
}

export interface ConsignmentList {
  id: number;
  codigo: string;
  fornecedor_id: number;
  data_recebimento: Date;
  prazo_retirada: Date;
  status: ListStatus;
  observacoes: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface Sale {
  id: number;
  codigo: string;
  data_venda: Date;
  valor_total: number;
  desconto: number;
  valor_final: number;
  forma_pagamento: PaymentMethod;
  cliente_nome: string | null;
  vendedora_id: number | null;
  created_at: Date;
}

export interface SaleItem {
  id: number;
  venda_id: number;
  produto_id: number;
  valor_unitario: number;
}

export interface SellerCommission {
  id: number;
  vendedora_id: number;
  venda_id: number;
  valor_venda: number;
  percentual_comissao: number;
  valor_comissao: number;
  pago: boolean;
  data_pagamento: Date | null;
  created_at: Date;
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
  categoria: string; // 'roupa', 'calcado', 'unico'
}

export interface Brand {
  id: number;
  nome: string;
}

// DTOs para criação
export interface CreateSupplierDTO {
  nome: string;
  cpf?: string;
  telefone?: string;
  email?: string;
  endereco?: string;
}

export interface CreateSellerDTO {
  nome: string;
  cpf?: string;
  telefone?: string;
  email?: string;
  comissao_percentual: number;
}

export interface CreateProductDTO {
  descricao: string;
  cor?: string;
  marca?: string;
  tamanho?: string;
  condicao: ProductCondition;
  defeitos?: string;
  valor_compra: number;
  valor_venda: number;
  lista_id: number;
}

export interface CreateConsignmentListDTO {
  fornecedor_id: number;
  data_recebimento: string;
  prazo_retirada: string;
  observacoes?: string;
}

export interface CreateSaleDTO {
  itens: { produto_id: number; valor_unitario: number }[];
  desconto?: number;
  forma_pagamento: PaymentMethod;
  cliente_nome?: string;
  vendedora_id?: number;
}
