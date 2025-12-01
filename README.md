# PDV Brechó - Sistema de Consignação

Sistema completo de PDV (Ponto de Venda) para brechó com gestão de consignação de peças.

## Funcionalidades

### Dashboard
- Visão geral das vendas do dia/mês
- Peças disponíveis em estoque
- Listas próximas do vencimento
- Top fornecedores e vendedoras
- Comissões pendentes

### PDV (Ponto de Venda)
- Leitura de código de barras
- Busca de produtos por descrição/marca
- Carrinho de compras
- Múltiplas formas de pagamento (Dinheiro, PIX, Crédito, Débito)
- Seleção de vendedora
- Desconto por venda

### Consignação
- Criar listas de consignação por fornecedor
- Adicionar peças com descrição, cor, marca, tamanho, condição
- Valores de compra e venda
- Status da lista (Digitada → Exportada → Finalizada)
- Devolução de peças

### Etiquetas
- Geração de código de barras (Code128)
- Preview das etiquetas
- Impressão em lote

### Cadastros
- Fornecedores (nome, CPF, telefone, email, endereço)
- Vendedoras (com percentual de comissão)
- Cadastros auxiliares (descrições, cores, tamanhos, marcas)

### Relatórios
- Vendas por período
- Vendas por forma de pagamento
- Vendas por vendedora
- Comissões a pagar

## Tecnologias

### Backend
- Node.js + Express + TypeScript
- Neon Database (PostgreSQL serverless)
- Zod (validação)

### Frontend
- React 18 + TypeScript
- Vite
- TailwindCSS
- React Query (cache/estado)
- React Router
- JsBarcode (código de barras)
- React Hot Toast (notificações)

## Como Executar

### 1. Instalar dependências

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 2. Configurar banco de dados

O arquivo `.env` já está configurado com as credenciais do Neon Database.

### 3. Inicializar banco e popular dados

```bash
cd backend
npm run db:seed
```

### 4. Executar o sistema

```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

### 5. Acessar

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001/api

## Estrutura do Banco de Dados

### Tabelas Principais
- `suppliers` - Fornecedores
- `sellers` - Vendedoras
- `consignment_lists` - Listas de consignação
- `products` - Peças/Produtos
- `sales` - Vendas
- `sale_items` - Itens da venda
- `seller_commissions` - Comissões das vendedoras

### Tabelas Auxiliares
- `descriptions` - Tipos de peças
- `colors` - Cores
- `sizes` - Tamanhos
- `brands` - Marcas

## Fluxo de Trabalho

1. **Cadastrar fornecedor** (ou usar existente)
2. **Criar lista de consignação** com data de recebimento e prazo
3. **Adicionar peças** à lista (descrição, cor, marca, tamanho, valores)
4. **Gerar etiquetas** com código de barras
5. **Exportar lista** (PDF para aprovação do fornecedor)
6. **Vender peças** no PDV (leitura do código de barras)
7. **Finalizar lista** quando todas peças vendidas/devolvidas
8. **Pagar comissões** às vendedoras

## API Endpoints

### Dashboard
- `GET /api/dashboard` - Dados do dashboard
- `GET /api/dashboard/quick-stats` - Estatísticas rápidas

### Fornecedores
- `GET /api/suppliers` - Listar
- `POST /api/suppliers` - Criar
- `PUT /api/suppliers/:id` - Atualizar
- `DELETE /api/suppliers/:id` - Excluir

### Vendedoras
- `GET /api/sellers` - Listar
- `POST /api/sellers` - Criar
- `PUT /api/sellers/:id` - Atualizar
- `PATCH /api/sellers/:id/toggle-active` - Ativar/Desativar
- `GET /api/sellers/:id/commissions` - Relatório de comissões

### Consignação
- `GET /api/consignments` - Listar listas
- `POST /api/consignments` - Criar lista
- `GET /api/consignments/:id` - Detalhes da lista
- `POST /api/consignments/:id/products` - Adicionar peça
- `PATCH /api/consignments/:id/status` - Atualizar status

### Produtos
- `GET /api/products` - Listar
- `GET /api/products/barcode/:codigo` - Buscar por código
- `GET /api/products/search?q=` - Buscar disponíveis

### Vendas
- `GET /api/sales` - Listar vendas
- `POST /api/sales` - Criar venda
- `DELETE /api/sales/:id` - Cancelar venda
- `GET /api/sales/daily-report` - Relatório diário
