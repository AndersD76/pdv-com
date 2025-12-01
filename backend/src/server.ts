import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import routes from './routes/index.js';
import { initializeDatabase, testConnection } from './database.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors());
app.use(express.json());

// Log de requisições
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Rotas da API
app.use('/api', routes);

// Rota de health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Servir frontend em produção
if (process.env.NODE_ENV === 'production') {
  const frontendPath = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(frontendPath));

  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(frontendPath, 'index.html'));
    }
  });
}

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
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

    // Inicializar banco de dados (criar tabelas)
    await initializeDatabase();
    console.log('Servidor pronto para receber requisições!');
  } catch (error) {
    console.error('Erro ao conectar ao banco de dados:', error);
    server.close();
    process.exit(1);
  }
}

start();
