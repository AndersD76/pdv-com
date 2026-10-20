# Andamento do projeto — PDV COM (Apega Desapega Brechó)

Última atualização: 20/10/2026

## Onde paramos

**Estoque da planilha antiga carregado no sistema (20/10/2026).** Falta:

1. **Lançar as vendas de 10/10 em diante.** Na planilha usada (`APP_AD_REV_08.xlsm`, salva em 19/10), a última venda
   lançada na APP-VEN é de 09/10. As peças vendidas depois disso estão como disponíveis no sistema.
2. **Dia da virada** (parar a planilha e vender só pelo PDV novo): salvar a planilha mais atual na raiz do projeto e
   rodar a importação de novo (ver "Importação da planilha antiga" abaixo). Ela tira do estoque o que foi vendido.
   A partir da virada, criar listas novas só no sistema (a numeração continua em L4613).
3. A compra online já está ativa (InfiniteTag configurada). Se ainda não foi feito, fazer um teste real de R$ 1.
   Para a loja encher: cadastrar as peças com foto e marcar **Loja digital** (só essas aparecem na vitrine).
4. Conferir a comissão das vendedoras (3% foi um padrão) e marcar como pagas as comissões já pagas.

## Loja online (20/10/2026)

- Domínio: **https://loja.apegadesapega.com.br** (`PUBLIC_URL`). Visitante sem sessão que abre a raiz vai para a
  vitrine; a equipe entra no sistema por **/login**.
- Visual premium seguindo o MIV (`apega_desapega.pdf` na raiz do projeto, fora do git): verde-sálvia, logo circular
  em SVG, Libre Baskerville + Barlow (fontes em `backend/assets/loja/fonts`). Código em `backend/src/views/loja.ts`.
- SEO: descrição, canonical, dados estruturados (Product e ClothingStore), Open Graph, `/loja/sitemap.xml` e
  `/robots.txt` (só a loja é indexada). Cadastrar o sitemap no Google Search Console.
- Checkout: CPF opcional, endereço só para entrega/Correios, resumo com frete e total da opção escolhida; cada
  compra cria ou atualiza a cliente em **Clientes** (pelo CPF ou WhatsApp) e liga ao pedido.
- Só aparecem na loja peças marcadas como **Loja digital** e com foto.

## Importação da planilha antiga (APP_AD)

Feita em 20/10/2026 a partir de `APP_AD_REV_08.xlsm` (período desde 01/01/2026):

- **2.585 peças em estoque** (R$ 256.544): listas recebidas em 2026, inclusive as compras da loja (`Axxx`, no
  fornecedor "Loja"), que não têm data na planilha (data estimada pelas listas vizinhas).
- **4.771 vendas de 2026** (R$ 407.465, uma venda por peça, como na APP-VEN), com vendedora e **comissões**
  (3%, todas como pendentes: marcar como pagas em Relatórios → Comissões o que já foi pago).
  Forma de pagamento: D = Dinheiro, CD = Débito, CC = Crédito; troca, crédito na loja, bônus, "DEVE" etc. entram
  como **"Outro"**, com o texto original no nome do cliente.
- Peças vendidas com a situação de pagamento ao fornecedor (PAGO/ENVELOPE na lista = pago): R$ 30.501 a pagar.
- Listas antigas que tiveram vendas em 2026 entram só com as peças vendidas (FINALIZADA).
- 311 fornecedores; vendedoras Priscila (ativa), Lais e Cris (inativas).
- Ficaram de fora 87 peças sem preço na lista (marcadas como VOLTA, MANCHADO etc.).
- **Etiquetas antigas funcionam no PDV.** O modelo de etiqueta da planilha pegava o código da aba APP-LIS e o texto
  da aba APP-L; desde 2024, do item 6 em diante, a etiqueta física tem o código do item seguinte. A importação
  corrige isso (confirmado em 2.115 de 2.125 vendas de 2026).
- Scripts em `scripts/importacao-planilha/` (pode rodar de novo; não duplica, atualiza e tira o que foi vendido):
  ```
  python scripts/importacao-planilha/extrair.py APP_AD_REV_xx.xlsm --desde 2026-01-01 --saida scripts/importacao-planilha/carga.json
  DATABASE_URL="$(railway variables --kv | grep '^DATABASE_URL=' | cut -d= -f2-)" node scripts/importacao-planilha/importar.mjs scripts/importacao-planilha/carga.json            # simulação
  DATABASE_URL="$(railway variables --kv | grep '^DATABASE_URL=' | cut -d= -f2-)" node scripts/importacao-planilha/importar.mjs scripts/importacao-planilha/carga.json --gravar   # grava
  ```
  Precisa de Python 3 (sem bibliotecas extras) e do `npm install` na pasta backend.

## Próximos passos da compra online (um de cada vez, nesta ordem)

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

- Em 20/10/2026 o estoque de 2026 da planilha antiga foi importado (ver acima).
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
