import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import routes from './routes/index.js';
import { initializeDatabase, testConnection } from './database.js';
import { ensureAdminUser } from './auth.js';
import { lojaRouter } from './controllers/loja.controller.js';
import { checkoutRouter } from './controllers/checkout.controller.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';

app.disable('x-powered-by');
// Atrás do proxy do Railway: usa o IP real do cliente (limite de tentativas de login)
app.set('trust proxy', 1);

// Cabeçalhos de segurança
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  if (isProduction) {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; " +
      "font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; " +
      // Pré-visualização do PDF de etiquetas (gerado no navegador)
      "frame-src 'self' blob:"
    );
  }
  next();
});

// O frontend é servido pelo próprio backend (mesma origem); CORS só se outra origem for configurada
if (process.env.CORS_ORIGIN) {
  app.use(cors({ origin: process.env.CORS_ORIGIN.split(','), credentials: true }));
}

// Rotas com corpo grande (fotos para a IA) têm parser próprio, aplicado só depois do login
const LARGE_JSON_ROUTES = ['/api/ai/'];
app.use(express.json({
  limit: '100kb',
  type: (req) => String(req.headers['content-type'] || '').includes('json')
    && !LARGE_JSON_ROUTES.some((route) => (req.url || '').startsWith(route))
}));

// Log de requisições
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Proteção contra CSRF: requisições que alteram dados precisam do cabeçalho enviado pelo frontend
app.use('/api', (req, res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('X-Requested-With') !== 'XMLHttpRequest') {
    return res.status(403).json({ error: 'Requisição não permitida' });
  }
  next();
});

// Rotas da API
app.use('/api', routes);

// Rota inexistente na API
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

// Loja online pública (vitrine, páginas das peças, fotos e feed do catálogo do Instagram)
app.use('/loja', lojaRouter);
// Checkout (compra com pagamento pela InfinitePay)
app.use('/loja', checkoutRouter);

// Rota de health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Servir frontend em produção
if (isProduction) {
  const frontendPath = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(frontendPath));

  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
}

// Error handler
app.use((err: Error & { type?: string }, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON inválido' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Requisição muito grande' });
  }
  console.error('Erro:', err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

// Inicialização
async function start() {
  // Iniciar servidor primeiro (para healthcheck funcionar)
  const server = app.listen(PORT, () => {
    console.log(`\n========================================`);
    console.log(`  PDV COM - Backend`);
    console.log(`  Servidor rodando na porta ${PORT}`);
    console.log(`  http://localhost:${PORT}`);
    console.log(`========================================\n`);
  });

  // Depois conectar ao banco de dados
  try {
    const connected = await testConnection();
    if (!connected) {
      console.error('Não foi possível conectar ao banco de dados. Verifique a configuração.');
      server.close();
      process.exit(1);
    }

    // Inicializar banco de dados (criar tabelas e aplicar migrações)
    await initializeDatabase();
    await ensureAdminUser();
    console.log('Servidor pronto para receber requisições!');
  } catch (error) {
    console.error('Erro ao conectar ao banco de dados:', error);
    server.close();
    process.exit(1);
  }
}

start();
