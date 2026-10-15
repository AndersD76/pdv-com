import { Request, Response, NextFunction, CookieOptions } from 'express';
import crypto from 'crypto';
import { promisify } from 'util';
import { sql } from './database.js';

export type Perfil = 'admin' | 'operador';

export interface AuthUser {
  id: number;
  nome: string;
  usuario: string;
  perfil: Perfil;
  deve_trocar_senha: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

// ==================== SENHAS ====================

const scrypt = promisify(crypto.scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, salt, hash] = stored.split('$');
  if (algorithm !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

// ==================== SESSÃO ====================

const SESSION_COOKIE = 'pdv_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 horas

let sessionSecret: Buffer | null = null;

function getSessionSecret(): Buffer {
  if (!sessionSecret) {
    if (process.env.SESSION_SECRET) {
      sessionSecret = Buffer.from(process.env.SESSION_SECRET);
    } else {
      console.warn('AVISO: SESSION_SECRET não configurada. Usando chave temporária; todos precisarão logar de novo a cada reinício do servidor.');
      sessionSecret = crypto.randomBytes(32);
    }
  }
  return sessionSecret;
}

function sign(data: string): string {
  return crypto.createHmac('sha256', getSessionSecret()).update(data).digest('base64url');
}

interface SessionPayload {
  uid: number;
  ver: number;
  exp: number;
}

function createSessionToken(userId: number, tokenVersion: number): string {
  const payload: SessionPayload = { uid: userId, ver: tokenVersion, exp: Date.now() + SESSION_TTL_MS };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${sign(encoded)}`;
}

function readSessionToken(token: string): SessionPayload | null {
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;

  const expected = Buffer.from(sign(encoded));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString()) as SessionPayload;
    if (typeof payload.uid !== 'number' || typeof payload.ver !== 'number' || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function getCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return undefined;
}

const cookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/'
};

export function setSessionCookie(res: Response, userId: number, tokenVersion: number) {
  res.cookie(SESSION_COOKIE, createSessionToken(userId, tokenVersion), { ...cookieOptions, maxAge: SESSION_TTL_MS });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, cookieOptions);
}

// ==================== USUÁRIOS ====================

interface StoredUser extends AuthUser {
  ativo: boolean;
  token_version: number;
}

// Cache curto para não consultar o banco a cada requisição
const USER_CACHE_TTL_MS = 30_000;
const userCache = new Map<number, { user: StoredUser; expires: number }>();

export function invalidateUserCache(userId: number) {
  userCache.delete(userId);
}

async function loadUser(userId: number): Promise<StoredUser | null> {
  const cached = userCache.get(userId);
  if (cached && cached.expires > Date.now()) return cached.user;

  const [user] = await sql`
    SELECT id, nome, usuario, perfil, ativo, deve_trocar_senha, token_version
    FROM users WHERE id = ${userId}
  ` as StoredUser[];
  if (user) {
    userCache.set(userId, { user, expires: Date.now() + USER_CACHE_TTL_MS });
  }
  return user ?? null;
}

export function toAuthUser(user: StoredUser | AuthUser): AuthUser {
  return {
    id: user.id,
    nome: user.nome,
    usuario: user.usuario,
    perfil: user.perfil,
    deve_trocar_senha: user.deve_trocar_senha
  };
}

// Cria o administrador inicial quando ainda não existe nenhum usuário
export async function ensureAdminUser(): Promise<void> {
  const [{ total }] = await sql`SELECT COUNT(*) AS total FROM users` as Array<{ total: number }>;
  if (total > 0) return;

  const senha = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
  const senhaHash = await hashPassword(senha);
  await sql`
    INSERT INTO users (nome, usuario, senha_hash, perfil, deve_trocar_senha)
    VALUES ('Administrador', 'admin', ${senhaHash}, 'admin', TRUE)
    ON CONFLICT (usuario) DO NOTHING
  `;

  console.log('\n========================================');
  console.log('  Usuário administrador criado');
  console.log('  Usuário: admin');
  if (process.env.ADMIN_PASSWORD) {
    console.log('  Senha: a definida em ADMIN_PASSWORD');
  } else {
    console.log(`  Senha provisória: ${senha}`);
  }
  console.log('  A troca de senha será exigida no primeiro acesso.');
  console.log('========================================\n');
}

// ==================== MIDDLEWARES ====================

// Rotas liberadas enquanto o usuário ainda precisa trocar a senha provisória
const ALLOWED_WHILE_MUST_CHANGE_PASSWORD = new Set(['/auth/me', '/auth/logout', '/auth/change-password']);

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = getCookie(req, SESSION_COOKIE);
    const session = token ? readSessionToken(token) : null;
    if (!session) {
      return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
    }

    const user = await loadUser(session.uid);
    if (!user || !user.ativo || user.token_version !== session.ver) {
      clearSessionCookie(res);
      return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
    }

    req.user = toAuthUser(user);

    if (user.deve_trocar_senha && !ALLOWED_WHILE_MUST_CHANGE_PASSWORD.has(req.path)) {
      return res.status(403).json({ error: 'Troque sua senha para continuar', code: 'TROCAR_SENHA' });
    }

    next();
  } catch (error) {
    next(error);
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.perfil !== 'admin') {
    return res.status(403).json({ error: 'Acesso restrito ao administrador' });
  }
  next();
}

// ==================== LIMITE DE TENTATIVAS DE LOGIN ====================

// Contadores por IP e por usuário: um login bem-sucedido zera só o do usuário,
// para que uma conta válida não sirva para "resetar" tentativas contra outra
const MAX_FAILURES_PER_IP = 20;
const MAX_FAILURES_PER_USER = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const loginFailures = new Map<string, { count: number; resetAt: number }>();

const ipKey = (ip: string) => `ip:${ip}`;
const userKey = (usuario: string) => `user:${usuario.toLowerCase()}`;

function failureCount(key: string): number {
  const entry = loginFailures.get(key);
  if (!entry) return 0;
  if (entry.resetAt < Date.now()) {
    loginFailures.delete(key);
    return 0;
  }
  return entry.count;
}

function addFailure(key: string, now: number) {
  const entry = loginFailures.get(key);
  if (!entry || entry.resetAt < now) {
    loginFailures.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
  } else {
    entry.count++;
  }
}

export function isLoginBlocked(ip: string, usuario: string): boolean {
  return failureCount(ipKey(ip)) >= MAX_FAILURES_PER_IP || failureCount(userKey(usuario)) >= MAX_FAILURES_PER_USER;
}

export function registerLoginFailure(ip: string, usuario: string) {
  const now = Date.now();
  if (loginFailures.size > 10_000) {
    for (const [key, entry] of loginFailures) {
      if (entry.resetAt < now) loginFailures.delete(key);
    }
  }
  addFailure(ipKey(ip), now);
  addFailure(userKey(usuario), now);
}

export function clearLoginFailures(usuario: string) {
  loginFailures.delete(userKey(usuario));
}
