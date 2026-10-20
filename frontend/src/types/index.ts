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

// Onde a peça é vendida
export type ProductChannel = 'FISICA' | 'DIGITAL';

export enum PaymentMethod {
  DINHEIRO = 'DINHEIRO',
  PIX = 'PIX',
  CARTAO_CREDITO = 'CARTAO_CREDITO',
  CARTAO_DEBITO = 'CARTAO_DEBITO',
  // Troca, crédito na loja, bônus etc. (vendas importadas da planilha)
  OUTRO = 'OUTRO'
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
  pago_fornecedor?: boolean;
  canal: ProductChannel;
  titulo_loja: string | null;
  descricao_loja: string | null;
  foto_atualizada_em?: string | null;
  reservado_ate?: string | null;
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
  payments?: SupplierPayment[];
  created_at: string;
  updated_at: string;
}

export interface SupplierPayment {
  id: number;
  lista_id: number;
  valor: number;
  quantidade_pecas: number;
  usuario_nome?: string | null;
  created_at: string;
}

export type SaleStatus = 'CONCLUIDA' | 'CANCELADA';

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
  status: SaleStatus;
  cancelada_em?: string | null;
  motivo_cancelamento?: string | null;
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

// ==================== DEPARTAMENTO PESSOAL ====================

export interface Employee {
  id: number;
  nome: string;
  cpf: string | null;
  cargo: string;
  departamento: string | null;
  salario_base: number;
  data_admissao: string;
  dependentes: number;
  status: 'ativo' | 'inativo';
  email: string | null;
  telefone: string | null;
  created_at: string;
  updated_at: string;
}

export interface TimeClockRecord {
  id: number;
  funcionario_id: number | null;
  funcionario_nome: string;
  data: string;
  hora: string;
  tipo: 'entrada' | 'saida';
  observacao: string | null;
  created_at: string;
}

export interface WorkSchedule {
  id: number;
  seg_sex_entrada: string;
  seg_sex_saida: string;
  intervalo_inicio: string | null;
  intervalo_fim: string | null;
  sabado_entrada: string | null;
  sabado_saida: string | null;
  carga_horaria_diaria: number;
  tolerancia_minutos: number;
}

export interface Customer {
  id: number;
  nome: string;
  cpf: string | null;
  telefone: string | null;
  email: string | null;
  endereco: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
  data_nascimento: string | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmployeeStats {
  total: number;
  ativos: number;
  inativos: number;
  folha_total: number;
}

export interface PayrollResult {
  salario_bruto: number;
  horas_extras: { quantidade: number; percentual: number; valor: number };
  adicional_noturno: { horas: number; valor: number };
  outros_proventos: number;
  total_proventos: number;
  inss: { valor: number; aliquota_efetiva: number };
  irrf: { valor: number; aliquota: number; faixa: string; base_calculo: number; reducao: number; desconto_simplificado: boolean };
  vale_transporte: { percentual: number; valor: number };
  vale_refeicao: number;
  outros_descontos: number;
  total_descontos: number;
  salario_liquido: number;
  encargos: { fgts: number; inss_patronal: number; total: number; regime_tributario: 'simples' | 'normal'; observacao: string };
  ano_tabela: number;
}

export interface TaxSimulationResult {
  faturamento_mensal: number;
  faturamento_anual: number;
  tipo_atividade: string;
  mei: { elegivel: boolean; imposto_mensal?: number; limite_mensal?: number };
  simples: { elegivel: boolean; aliquota_efetiva?: number; imposto_mensal?: number };
  lucro_presumido: { imposto_mensal: number; detalhamento: Record<string, number> };
  recomendacao: string;
  avisos: string[];
}

export interface TerminationResult {
  dados_contrato: {
    salario_bruto: number;
    data_admissao: string;
    data_demissao: string;
    tempo_servico: { anos: number; meses: number; dias: number };
  };
  tipo_rescisao: string;
  verbas_rescisorias: Record<string, number>;
  resumo: {
    total_proventos: number;
    total_descontos: number;
    total_rescisao: number;
    meses_13: number;
    fgts: { saldo: number; multa: number; saque_total: number };
    direito_seguro_desemprego: boolean;
    observacoes: string[];
  };
}

// ==================== IA E LOJA ONLINE ====================

export interface ProductAnalysis {
  descricao: string;
  cor: string | null;
  marca: string | null;
  tamanho: string | null;
  condicao: ProductCondition;
  defeitos: string | null;
  valor_venda_sugerido: number | null;
  titulo_loja: string;
  descricao_loja: string;
  observacoes: string | null;
}

export interface LojaStatus {
  ia_configurada: boolean;
  vitrine_url: string;
  feed_url: string;
  instagram: string | null;
  whatsapp: string | null;
  dominio_verificacao_configurado: boolean;
  url_publica_configurada: boolean;
  pecas_publicadas: number;
  pecas_sem_foto: number;
  checkout_ativo: boolean;
}

export interface StoreSettings {
  infinitepay_handle: string;
  retirada_ativa: boolean;
  retirada_endereco: string;
  retirada_horario: string;
  entrega_local_ativa: boolean;
  entrega_local_taxa: number;
  entrega_local_cidade: string;
  correios_ativo: boolean;
  correios_taxa: number;
  reserva_minutos: number;
  checkout_ativo?: boolean;
}

export type OnlineOrderStatus = 'AGUARDANDO_PAGAMENTO' | 'PAGO' | 'SEPARADO' | 'ENTREGUE' | 'CANCELADO' | 'PAGO_SEM_ESTOQUE';
export type DeliveryMethod = 'RETIRADA' | 'ENTREGA_LOCAL' | 'CORREIOS';

export interface OnlineOrder {
  id: number;
  codigo: string;
  product_id: number;
  status: OnlineOrderStatus;
  expirado: boolean;
  valor_produto: number;
  valor_frete: number;
  valor_total: number;
  valor_pago: number | null;
  entrega: DeliveryMethod;
  cliente_nome: string;
  cliente_telefone: string;
  cliente_email: string | null;
  cep: string | null;
  endereco: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  forma_pagamento: string | null;
  parcelas: number | null;
  receipt_url: string | null;
  pago_em: string | null;
  separado_em: string | null;
  entregue_em: string | null;
  expira_em: string;
  created_at: string;
  codigo_barras: string;
  descricao: string;
  titulo_loja: string | null;
  tamanho: string | null;
  marca: string | null;
  foto_atualizada_em: string | null;
}

export interface OrdersSummary {
  para_separar: number;
  sem_estoque: number;
  aguardando: number;
}

// ==================== USUÁRIOS ====================

export type UserRole = 'admin' | 'operador';

export interface AuthUser {
  id: number;
  nome: string;
  usuario: string;
  perfil: UserRole;
  deve_trocar_senha: boolean;
}

export interface AppUser extends AuthUser {
  ativo: boolean;
  created_at: string;
  updated_at: string;
}
