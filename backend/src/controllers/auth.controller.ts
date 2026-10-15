import { Request, Response } from 'express';
import { z } from 'zod';
import { sql } from '../database.js';
import {
  verifyPassword, hashPassword, setSessionCookie, clearSessionCookie, invalidateUserCache, toAuthUser,
  isLoginBlocked, registerLoginFailure, clearLoginFailures, AuthUser
} from '../auth.js';
import { sendError } from '../utils/http.js';

const loginSchema = z.object({
  usuario: z.string().trim().min(1, 'Informe o usuário'),
  senha: z.string().min(1, 'Informe a senha')
});

const changePasswordSchema = z.object({
  senha_atual: z.string().min(1, 'Informe a senha atual'),
  nova_senha: z.string().min(8, 'A nova senha deve ter pelo menos 8 caracteres')
});

// Hash usado quando o usuário não existe, para o tempo de resposta não revelar isso
const DUMMY_HASH = 'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$' + 'A'.repeat(86) + '==';

export async function login(req: Request, res: Response) {
  try {
    const ip = req.ip || 'desconhecido';
    const { usuario, senha } = loginSchema.parse(req.body);

    if (isLoginBlocked(ip, usuario)) {
      return res.status(429).json({ error: 'Muitas tentativas de login. Aguarde 15 minutos.' });
    }

    const [user] = await sql`
      SELECT id, nome, usuario, perfil, ativo, deve_trocar_senha, token_version, senha_hash
      FROM users WHERE LOWER(usuario) = LOWER(${usuario})
    ` as Array<AuthUser & { ativo: boolean; token_version: number; senha_hash: string }>;

    const senhaOk = await verifyPassword(senha, user?.senha_hash ?? DUMMY_HASH);
    if (!user || !senhaOk || !user.ativo) {
      registerLoginFailure(ip, usuario);
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }

    clearLoginFailures(usuario);
    setSessionCookie(res, user.id, user.token_version);
    res.json(toAuthUser(user));
  } catch (error) {
    sendError(res, error, 'Erro ao fazer login');
  }
}

export async function logout(_req: Request, res: Response) {
  clearSessionCookie(res);
  res.json({ message: 'Sessão encerrada' });
}

export async function me(req: Request, res: Response) {
  res.json(req.user);
}

export async function changePassword(req: Request, res: Response) {
  try {
    const { senha_atual, nova_senha } = changePasswordSchema.parse(req.body);
    const userId = req.user!.id;

    const [user] = await sql`SELECT senha_hash FROM users WHERE id = ${userId}` as Array<{ senha_hash: string }>;
    if (!user || !(await verifyPassword(senha_atual, user.senha_hash))) {
      return res.status(400).json({ error: 'Senha atual incorreta' });
    }
    if (senha_atual === nova_senha) {
      return res.status(400).json({ error: 'A nova senha deve ser diferente da atual' });
    }

    const novaHash = await hashPassword(nova_senha);
    // Incrementar token_version derruba as outras sessões abertas com a senha antiga
    const [updated] = await sql`
      UPDATE users
      SET senha_hash = ${novaHash}, deve_trocar_senha = FALSE, token_version = token_version + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${userId}
      RETURNING id, nome, usuario, perfil, deve_trocar_senha, token_version
    ` as Array<AuthUser & { token_version: number }>;

    invalidateUserCache(userId);
    setSessionCookie(res, updated.id, updated.token_version);
    res.json(toAuthUser(updated));
  } catch (error) {
    sendError(res, error, 'Erro ao trocar senha');
  }
}
