import axios from 'axios';
import type {
  Supplier,
  Seller,
  Product,
  ConsignmentList,
  Sale,
  Auxiliaries,
  DashboardData,
  SellerCommission,
  PaymentMethod,
  ProductCondition,
  Employee,
  EmployeeStats,
  TimeClockRecord,
  WorkSchedule,
  Customer,
  PayrollResult,
  TaxSimulationResult,
  TerminationResult
} from '../types';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor para tratar erros
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.error || error.message || 'Erro desconhecido';
    return Promise.reject(new Error(typeof message === 'string' ? message : JSON.stringify(message)));
  }
);

// ==================== DASHBOARD ====================
export const dashboardApi = {
  get: () => api.get<DashboardData>('/dashboard').then(res => res.data),
  getQuickStats: () => api.get('/dashboard/quick-stats').then(res => res.data),
  getSalesChart: () => api.get('/dashboard/sales-chart').then(res => res.data),
};

// ==================== FORNECEDORES ====================
export const suppliersApi = {
  getAll: (search?: string) =>
    api.get<Supplier[]>('/suppliers', { params: { search } }).then(res => res.data),
  getById: (id: number) =>
    api.get<Supplier>(`/suppliers/${id}`).then(res => res.data),
  getReport: (id: number) =>
    api.get(`/suppliers/${id}/report`).then(res => res.data),
  create: (data: Partial<Supplier>) =>
    api.post<Supplier>('/suppliers', data).then(res => res.data),
  update: (id: number, data: Partial<Supplier>) =>
    api.put<Supplier>(`/suppliers/${id}`, data).then(res => res.data),
  delete: (id: number) =>
    api.delete(`/suppliers/${id}`).then(res => res.data),
};

// ==================== VENDEDORAS ====================
export const sellersApi = {
  getAll: (ativo?: boolean) =>
    api.get<Seller[]>('/sellers', { params: { ativo } }).then(res => res.data),
  getById: (id: number) =>
    api.get<Seller>(`/sellers/${id}`).then(res => res.data),
  getCommissions: (id: number, params?: { inicio?: string; fim?: string; pago?: boolean }) =>
    api.get<{ seller: Seller; commissions: SellerCommission[]; totals: { total_comissao: number; total_pago: number; total_pendente: number; total_vendas: number } }>(`/sellers/${id}/commissions`, { params }).then(res => res.data),
  create: (data: Partial<Seller>) =>
    api.post<Seller>('/sellers', data).then(res => res.data),
  update: (id: number, data: Partial<Seller>) =>
    api.put<Seller>(`/sellers/${id}`, data).then(res => res.data),
  toggleActive: (id: number) =>
    api.patch<Seller>(`/sellers/${id}/toggle-active`).then(res => res.data),
  payCommissions: (ids: number[]) =>
    api.post('/sellers/pay-commissions', { ids }).then(res => res.data),
  delete: (id: number) =>
    api.delete(`/sellers/${id}`).then(res => res.data),
};

// ==================== LISTAS DE CONSIGNAÇÃO ====================
export const consignmentsApi = {
  getAll: (params?: { status?: string; fornecedor_id?: number; search?: string }) =>
    api.get<ConsignmentList[]>('/consignments', { params }).then(res => res.data),
  getById: (id: number) =>
    api.get<ConsignmentList>(`/consignments/${id}`).then(res => res.data),
  create: (data: { fornecedor_id: number; data_recebimento: string; prazo_retirada: string; observacoes?: string }) =>
    api.post<ConsignmentList>('/consignments', data).then(res => res.data),
  update: (id: number, data: Partial<ConsignmentList>) =>
    api.put<ConsignmentList>(`/consignments/${id}`, data).then(res => res.data),
  updateStatus: (id: number, status: string) =>
    api.patch<ConsignmentList>(`/consignments/${id}/status`, { status }).then(res => res.data),
  delete: (id: number) =>
    api.delete(`/consignments/${id}`).then(res => res.data),

  // Produtos da lista
  addProduct: (listId: number, data: {
    descricao: string;
    cor?: string;
    marca?: string;
    tamanho?: string;
    condicao: ProductCondition;
    defeitos?: string;
    valor_compra: number;
    valor_venda: number;
  }) =>
    api.post<Product>(`/consignments/${listId}/products`, data).then(res => res.data),
  updateProduct: (listId: number, productId: number, data: Partial<Product>) =>
    api.put<Product>(`/consignments/${listId}/products/${productId}`, data).then(res => res.data),
  removeProduct: (listId: number, productId: number) =>
    api.delete(`/consignments/${listId}/products/${productId}`).then(res => res.data),
  returnAllProducts: (listId: number) =>
    api.patch(`/consignments/${listId}/return-all`).then(res => res.data),

  // Pagamentos
  markAsPaid: (listId: number, valorPago?: number) =>
    api.patch(`/consignments/${listId}/pay`, { valor_pago: valorPago }).then(res => res.data),
  getPaymentReport: (params?: { inicio?: string; fim?: string; pago?: boolean; fornecedor_id?: number }) =>
    api.get('/consignments/payment-report', { params }).then(res => res.data),
};

// ==================== PRODUTOS ====================
export const productsApi = {
  getAll: (params?: { status?: string; lista_id?: number; fornecedor_id?: number; search?: string }) =>
    api.get<Product[]>('/products', { params }).then(res => res.data),
  getById: (id: number) =>
    api.get<Product>(`/products/${id}`).then(res => res.data),
  getByBarcode: (codigo: string) =>
    api.get<Product>(`/products/barcode/${codigo}`).then(res => res.data),
  searchAvailable: (q: string) =>
    api.get<Product[]>('/products/search', { params: { q } }).then(res => res.data),
  getLabelsData: (listaId: number) =>
    api.get<{ list: ConsignmentList; products: Product[] }>(`/products/labels/${listaId}`).then(res => res.data),
  returnProduct: (productId: number) =>
    api.patch<Product>(`/products/${productId}/return`).then(res => res.data),
};

// ==================== VENDAS ====================
export const salesApi = {
  getAll: (params?: { inicio?: string; fim?: string; vendedora_id?: number; forma_pagamento?: PaymentMethod }) =>
    api.get<Sale[]>('/sales', { params }).then(res => res.data),
  getById: (id: number) =>
    api.get<Sale>(`/sales/${id}`).then(res => res.data),
  getDailyReport: (data?: string) =>
    api.get('/sales/daily-report', { params: { data } }).then(res => res.data),
  getReport: (inicio: string, fim: string) =>
    api.get('/sales/report', { params: { inicio, fim } }).then(res => res.data),
  create: (data: {
    itens: { produto_id: number; valor_unitario: number }[];
    desconto?: number;
    forma_pagamento: PaymentMethod;
    cliente_nome?: string;
    vendedora_id?: number;
  }) =>
    api.post<Sale>('/sales', data).then(res => res.data),
  cancel: (id: number) =>
    api.delete(`/sales/${id}`).then(res => res.data),
};

// ==================== CADASTROS AUXILIARES ====================
export const auxiliariesApi = {
  getAll: () =>
    api.get<Auxiliaries>('/auxiliaries').then(res => res.data),

  // Descrições
  getDescriptions: () =>
    api.get('/descriptions').then(res => res.data),
  createDescription: (nome: string) =>
    api.post('/descriptions', { nome }).then(res => res.data),
  deleteDescription: (id: number) =>
    api.delete(`/descriptions/${id}`).then(res => res.data),

  // Cores
  getColors: () =>
    api.get('/colors').then(res => res.data),
  createColor: (nome: string) =>
    api.post('/colors', { nome }).then(res => res.data),
  deleteColor: (id: number) =>
    api.delete(`/colors/${id}`).then(res => res.data),

  // Tamanhos
  getSizes: (categoria?: string) =>
    api.get('/sizes', { params: { categoria } }).then(res => res.data),
  createSize: (nome: string, categoria: string) =>
    api.post('/sizes', { nome, categoria }).then(res => res.data),
  deleteSize: (id: number) =>
    api.delete(`/sizes/${id}`).then(res => res.data),

  // Marcas
  getBrands: () =>
    api.get('/brands').then(res => res.data),
  createBrand: (nome: string) =>
    api.post('/brands', { nome }).then(res => res.data),
  deleteBrand: (id: number) =>
    api.delete(`/brands/${id}`).then(res => res.data),
};

// ==================== DEPARTAMENTO PESSOAL ====================

// Funcionários
export const employeesApi = {
  getAll: (params?: { search?: string; status?: string }) =>
    api.get<Employee[]>('/employees', { params }).then(res => res.data),
  getById: (id: number) =>
    api.get<Employee>(`/employees/${id}`).then(res => res.data),
  getStats: () =>
    api.get<EmployeeStats>('/employees/stats').then(res => res.data),
  create: (data: Partial<Employee>) =>
    api.post<Employee>('/employees', data).then(res => res.data),
  update: (id: number, data: Partial<Employee>) =>
    api.put<Employee>(`/employees/${id}`, data).then(res => res.data),
  toggleStatus: (id: number) =>
    api.patch<Employee>(`/employees/${id}/toggle-status`).then(res => res.data),
  delete: (id: number) =>
    api.delete(`/employees/${id}`).then(res => res.data),
};

// Controle de Ponto
export const timeclockApi = {
  getAll: (params?: { data_inicio?: string; data_fim?: string; funcionario_id?: number; tipo?: string }) =>
    api.get<TimeClockRecord[]>('/timeclock', { params }).then(res => res.data),
  getById: (id: number) =>
    api.get<TimeClockRecord>(`/timeclock/${id}`).then(res => res.data),
  getResumo: (params: { funcionario_id: number; mes: number; ano: number }) =>
    api.get('/timeclock/resumo', { params }).then(res => res.data),
  registrar: (data: { funcionario_id?: number; funcionario_nome: string; tipo: 'entrada' | 'saida'; observacao?: string }) =>
    api.post<TimeClockRecord>('/timeclock', data).then(res => res.data),
  update: (id: number, data: { data: string; hora: string; tipo: string; observacao?: string }) =>
    api.put<TimeClockRecord>(`/timeclock/${id}`, data).then(res => res.data),
  delete: (id: number) =>
    api.delete(`/timeclock/${id}`).then(res => res.data),
};

// Configuração de Jornada
export const jornadaApi = {
  get: () =>
    api.get<WorkSchedule>('/jornada').then(res => res.data),
  save: (data: Partial<WorkSchedule>) =>
    api.post<WorkSchedule>('/jornada', data).then(res => res.data),
};

// Folha de Pagamento
export const payrollApi = {
  calcular: (data: {
    salario_bruto: number;
    dependentes?: number;
    horas_extras?: number;
    percentual_hora_extra?: number;
    adicional_noturno?: number;
    vale_transporte_perc?: number;
    vale_refeicao?: number;
    outros_descontos?: number;
    outros_proventos?: number;
  }) =>
    api.post<PayrollResult>('/folha/calcular', data).then(res => res.data),
  calcularDecimoTerceiro: (data: {
    salario_bruto: number;
    meses_trabalhados: number;
    parcela: 'primeira' | 'segunda';
    dependentes?: number;
  }) =>
    api.post('/folha/13-salario', data).then(res => res.data),
  calcularFerias: (data: {
    salario_bruto: number;
    dias_ferias?: number;
    abono_pecuniario?: boolean;
    dependentes?: number;
  }) =>
    api.post('/folha/ferias', data).then(res => res.data),
};

// Simuladores
export const simulatorsApi = {
  simularImpostos: (data: { faturamento_mensal: number; tipo_atividade?: 'comercio' | 'servicos' | 'industria' }) =>
    api.post<TaxSimulationResult>('/simulador/impostos', data).then(res => res.data),
  simularRescisao: (data: {
    salario_bruto: number;
    data_admissao: string;
    data_demissao: string;
    tipo_rescisao: 'sem_justa_causa' | 'com_justa_causa' | 'pedido_demissao' | 'acordo';
    saldo_fgts?: number;
    aviso_previo_trabalhado?: boolean;
    ferias_vencidas?: boolean;
    meses_ferias_proporcionais?: number;
  }) =>
    api.post<TerminationResult>('/simulador/rescisao', data).then(res => res.data),
};

// Clientes
export const customersApi = {
  getAll: (search?: string) =>
    api.get<Customer[]>('/customers', { params: { search } }).then(res => res.data),
  getById: (id: number) =>
    api.get<Customer>(`/customers/${id}`).then(res => res.data),
  getStats: () =>
    api.get('/customers/stats').then(res => res.data),
  create: (data: Partial<Customer>) =>
    api.post<Customer>('/customers', data).then(res => res.data),
  update: (id: number, data: Partial<Customer>) =>
    api.put<Customer>(`/customers/${id}`, data).then(res => res.data),
  delete: (id: number) =>
    api.delete(`/customers/${id}`).then(res => res.data),
};

export default api;
