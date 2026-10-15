import { Request, Response } from 'express';
import { z } from 'zod';
import { sql, withTransaction } from '../database.js';
import { hashPassword, invalidateUserCache } from '../auth.js';
import { HttpError, sendError } from '../utils/http.js';

const perfilSchema = z.enum(['admin', 'operador']);

const createSchema = z.object({
  nome: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  usuario: z.string().trim().toLowerCase()
    .regex(/^[a-z0-9._-]{3,50}$/, 'Usuário deve ter 3 a 50 caracteres (letras, números, ponto, hífen ou _)'),
  senha: z.string().min(8, 'A senha deve ter pelo menos 8 caracteres'),
  perfil: perfilSchema.default('operador')
});

const updateSchema = z.object({
  nome: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  perfil: perfilSchema,
  ativo: z.boolean(),
  // Opcional: redefine a senha (o usuário terá de trocá-la no próximo acesso)
  nova_senha: z.string().min(8, 'A senha deve ter pelo menos 8 caracteres').optional()
});

export async function getAll(_req: Request, res: Response) {
  try {
    const users = await sql`
      SELECT id, nome, usuario, perfil, ativo, deve_trocar_senha, created_at, updated_at
      FROM users ORDER BY nome
    `;
    res.json(users);
  } catch (error) {
    sendError(res, error, 'Erro ao listar usuários');
  }
}

export async function create(req: Request, res: Response) {
  try {
    const data = createSchema.parse(req.body);
    const senhaHash = await hashPassword(data.senha);

    const [user] = await sql`
      INSERT INTO users (nome, usuario, senha_hash, perfil, deve_trocar_senha)
      VALUES (${data.nome}, ${data.usuario}, ${senhaHash}, ${data.perfil}, TRUE)
      RETURNING id, nome, usuario, perfil, ativo, deve_trocar_senha, created_at, updated_at
    `;
    res.status(201).json(user);
  } catch (error) {
    sendError(res, error, 'Erro ao criar usuário');
  }
}

export async function update(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    const data = updateSchema.parse(req.body);
    const senhaHash = data.nova_senha ? await hashPassword(data.nova_senha) : null;

    const user = await withTransaction(async (tx) => {
      // Trava os administradores para evitar que duas alterações simultâneas removam o último
      const admins = await tx.query<{ id: number }>(
        `SELECT id FROM users WHERE perfil = 'admin' AND ativo = TRUE FOR UPDATE`
      );
      const current = await tx.queryOne<{ perfil: string; ativo: boolean }>(
        'SELECT perfil, ativo FROM users WHERE id = $1 FOR UPDATE', [id]
      );
      if (!current) throw new HttpError(404, 'Usuário não encontrado');

      const deixaDeSerAdminAtivo = current.perfil === 'admin' && current.ativo && (data.perfil !== 'admin' || !data.ativo);
      if (deixaDeSerAdminAtivo && admins.length <= 1) {
        throw new HttpError(400, 'É preciso manter pelo menos um administrador ativo');
      }

      // Mudança de perfil, desativação ou nova senha derrubam as sessões abertas do usuário
      const encerrarSessoes = current.perfil !== data.perfil || current.ativo !== data.ativo || senhaHash !== null;

      return tx.queryOne(
        `UPDATE users
         SET nome = $2, perfil = $3, ativo = $4,
             senha_hash = COALESCE($5, senha_hash),
             deve_trocar_senha = CASE WHEN $5::text IS NULL THEN deve_trocar_senha ELSE TRUE END,
             token_version = token_version + CASE WHEN $6 THEN 1 ELSE 0 END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING id, nome, usuario, perfil, ativo, deve_trocar_senha, created_at, updated_at`,
        [id, data.nome, data.perfil, data.ativo, senhaHash, encerrarSessoes]
      );
    });

    invalidateUserCache(id);
    res.json(user);
  } catch (error) {
    sendError(res, error, 'Erro ao atualizar usuário');
  }
}
