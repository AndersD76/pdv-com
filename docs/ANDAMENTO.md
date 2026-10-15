# Andamento do projeto — PDV COM (Apega Desapega Brechó)

Última atualização: 15/10/2026

## Onde paramos

**Ativação da compra online (InfinitePay) — Passo 1:** descobrir a **InfiniteTag** da loja no app InfinitePay
(toque no nome/foto ou em Perfil; é o nome que começa com `$`, ex.: `$apegadesapega`).

O código da compra online já está no ar; só falta configurar.

## Próximos passos (um de cada vez, nesta ordem)

1. **Ativar a compra online:** menu **Loja Online** → quadro "Compra online (pagamento automático)":
   - InfiniteTag (sem o `$`)
   - Retirada na loja: endereço (padrão "Rua Uruguai, 701 - Sala 01 - Passo Fundo - RS") e horário
   - Entrega local: marcar se fizer e informar a taxa
   - Correios: marcar se fizer e informar o frete fixo
   - **Salvar configuração** → o selo deve ficar "Ativa"
2. **Teste real:** cadastrar uma peça de R$ 1,00 como **Loja digital** com foto → abrir a vitrine no celular →
   **Comprar agora** → pagar com Pix → conferir o alerta "pedido para separar" e a tela **Pedidos Online** →
   estornar o R$ 1,00 pelo app da InfinitePay.
3. **Imprimir uma etiqueta de teste** (ícone de impressora na lista da consignação, ou tela Etiquetas). Na janela de
   impressão: impressora **Argox OS-214 plus**, papel **60 x 30 mm**, escala **100% / Tamanho real**, margens **Nenhuma**.
   Pendente: o usuário contar o que saía errado nas primeiras tentativas de impressão.
4. **Criar os usuários da equipe:** menu **Usuarios** → perfil **Operador** (caixa). Cada um troca a senha no primeiro acesso.
5. **Domínio próprio** (necessário para a loja do Instagram): a loja **não tem domínio**. Em 15/10/2026
   `apegadesapegars.com.br` estava **livre** (registro.br, ~R$ 40/ano). Depois de registrar:
   - Railway → serviço pdv-com → Settings → Networking → Custom Domain: `loja.<dominio>` e criar o CNAME indicado
   - Variável `PUBLIC_URL=https://loja.<dominio>`
6. **Conectar o Instagram (Meta):** conta profissional ligada a uma Página do Facebook e a um portfólio empresarial →
   Commerce Manager: catálogo E-commerce → fonte de dados "feed programado" com `https://loja.<dominio>/loja/feed.csv`
   (a cada hora, BRL) → verificar o domínio (código da meta tag na variável `FACEBOOK_DOMAIN_VERIFICATION`) →
   ativar Compras no Instagram e aguardar a análise.
7. **Opcional depois:** frete por CEP (conta no Melhor Envio), cadastro de peças em lote por fotos,
   atualizar o react-router para a v7.

## O que já está pronto

- **Segurança:** login obrigatório (cookie httpOnly, 12 h), perfis administrador/operador, limite de tentativas,
  proteção CSRF e cabeçalhos de segurança. Admin inicial `admin` (a senha já foi trocada pelo usuário).
- **Vendas:** preço vem do cadastro, transação com trava (sem venda dupla), cancelamento mantém histórico.
- **Consignação:** pagamento ao fornecedor por peça, comissões pagáveis pela tela de Relatórios.
- **Cadastro por foto com IA** (Claude, `claude-opus-5-5`): tira as fotos no celular, passa para o computador e
  faz upload em "Escolher foto"; a IA preenche os campos. Custo ~US$ 0,02 por peça.
- **Etiquetas:** PDF 60 x 30 mm igual ao modelo do BarTender (`Etiqueta Brechó.btw`), código **EAN-13**.
  Peças novas têm código de 12 dígitos; o PDV aceita a leitura de 13 dígitos da etiqueta.
- **Loja online** (`/loja`): vitrine com filtros, página de cada peça, feed para o Instagram (`/loja/feed.csv`).
- **Compra online:** checkout InfinitePay (Pix/cartão até 12x), reserva da peça por 30 min, confirmação automática
  (o webhook é conferido na API da InfinitePay), venda registrada com origem ONLINE, alerta com som e tela
  **Pedidos Online** (Separado / Entregue).
- **Departamento Pessoal:** cálculos corrigidos, tabelas de 2026 (validar com a contabilidade).

## Dados

- Em 15/10/2026, a pedido, o estoque foi **zerado** (18.708 peças importadas, listas, venda de teste e os fornecedores
  de teste). Ficaram usuários, fornecedor "Loja", vendedoras, cadastros auxiliares, clientes e DP.
- **Backup** dessas peças (CSV/JSON + fotos): `backups/2026-10-15-antes-de-zerar/` **somente no PC onde foi feito**
  (a pasta `backups/` não vai para o GitHub). Copie se precisar dela em outro computador.

## Infraestrutura

- **GitHub:** `AndersD76/pdv-com`, branch `master` → deploy automático no Railway.
- **Railway:** projeto **"App Loja PDV"**, serviço **pdv-com** → https://pdv-com-production.up.railway.app
- **Variáveis no Railway** (os valores ficam só lá): `DATABASE_URL`, `NODE_ENV`, `PORT`, `SESSION_SECRET`,
  `ADMIN_PASSWORD`, `ANTHROPIC_API_KEY`, `LOJA_INSTAGRAM=apegadesapegars`, `LOJA_WHATSAPP=5554996096202`.
  Faltam (depois do domínio): `PUBLIC_URL`, `FACEBOOK_DOMAIN_VERIFICATION`.
- **Banco:** Neon (Postgres). **Build:** Node 22 (`nixpacks.toml`).
- **Recomendação pendente:** trocar a senha do banco (Neon) e a chave da Anthropic, que foram coladas no chat.

## Como continuar em outro computador

1. `git clone https://github.com/AndersD76/pdv-com.git`
2. Para usar a CLI do Railway (opcional): `npm i -g @railway/cli`, `railway login`, `railway link`
   → projeto "App Loja PDV", serviço pdv-com, ambiente production.
3. No Claude Code: *"leia docs/ANDAMENTO.md e continue de onde paramos, passo a passo"*.

## Decisões já tomadas

- Fotos das peças: tiradas no celular e enviadas pelo computador (o fluxo com QR code foi descartado).
- Pagamento: InfinitePay. No Brasil o Instagram não tem pagamento dentro do app; o cliente paga no site da loja.
- Entrega: retirada na loja, entrega local (taxa fixa) e Correios (frete fixo por enquanto).
- Aviso de pedido pago: dentro do sistema (selo no topo + som).
- Preferência de trabalho: orientação **passo a passo, uma etapa por vez**.
