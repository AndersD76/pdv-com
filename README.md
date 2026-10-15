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

### 2. Configurar variáveis de ambiente

Copie `backend/.env.example` para `backend/.env` e preencha (no Railway, cadastre as mesmas variáveis no serviço):

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | sim | Conexão com o Neon Database |
| `SESSION_SECRET` | sim, em produção | Chave que assina as sessões de login. Sem ela, todos precisam logar de novo a cada reinício |
| `ADMIN_PASSWORD` | não | Senha provisória do usuário `admin` criado no primeiro boot. Se ausente, uma senha é gerada e mostrada no log |
| `APP_TIMEZONE` | não | Fuso do negócio (padrão `America/Sao_Paulo`): define "hoje" nos relatórios e a hora do ponto |
| `CORS_ORIGIN` | não | Só se o frontend for servido de outro domínio (origens separadas por vírgula) |
| `ANTHROPIC_API_KEY` | para a IA | Chave da API da Anthropic usada no cadastro de peças por foto |
| `ANTHROPIC_MODEL` | não | Modelo da IA (padrão `claude-opus-5-5`) |
| `LOJA_NOME` | não | Nome exibido na loja online |
| `LOJA_INSTAGRAM` | para a loja | Usuário do Instagram (sem @) do botão "Comprar pelo Instagram" |
| `LOJA_WHATSAPP` | não | WhatsApp (DDI+DDD+número) do botão "Comprar pelo WhatsApp" |
| `PUBLIC_URL` | recomendado | Endereço público da loja (domínio próprio), usado nos links do feed do Instagram |
| `FACEBOOK_DOMAIN_VERIFICATION` | não | Código da meta tag de verificação de domínio do Meta |

### Cadastro por foto e loja online

- No cadastro de uma peça, tire ou envie a foto (até 3: a primeira é a principal; inclua a etiqueta). A IA preenche descrição, cor, marca, tamanho, condição, defeitos, preço sugerido e o texto da loja; confira e salve.
- Cada peça é marcada como **Loja física** ou **Loja digital (Instagram)**. Peças digitais com foto aparecem em `/loja` (vitrine pública) e em `/loja/feed.csv` (feed do catálogo do Meta). Ao serem vendidas no PDV, saem da vitrine e ficam "fora de estoque" no feed.
- O passo a passo para conectar o Instagram está na tela **Loja Online** (menu do administrador).

### Acesso e perfis

No primeiro boot é criado o usuário `admin`; a troca de senha é exigida no primeiro acesso.
Os demais usuários são criados em **Usuários** (menu do administrador).

- **Operador (caixa):** PDV, consignações, produtos, etiquetas, fornecedores, cadastros, clientes e registro de ponto
- **Administrador:** tudo, incluindo relatórios, cancelamento de vendas, pagamentos (fornecedores e comissões), vendedoras, DP e usuários

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
7. **Pagar o fornecedor** pelas peças vendidas (pode ser feito várias vezes; cada pagamento quita o que foi vendido até ali)
8. **Finalizar lista** quando todas peças vendidas/devolvidas
9. **Pagar comissões** às vendedoras

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
- `POST /api/sales` - Criar venda (o preço vem do cadastro de cada peça)
- `PATCH /api/sales/:id/cancel` - Cancelar venda (mantém o histórico; bloqueado se a peça ou a comissão já foram pagas)

### Autenticação
- `POST /api/auth/login` - Entrar (cria cookie de sessão)
- `POST /api/auth/logout` - Sair
- `GET /api/auth/me` - Usuário logado
- `POST /api/auth/change-password` - Trocar senha

Todas as demais rotas exigem login; requisições que alteram dados exigem o cabeçalho `X-Requested-With: XMLHttpRequest` (enviado automaticamente pelo frontend).
- `GET /api/sales/daily-report` - Relatório diário
