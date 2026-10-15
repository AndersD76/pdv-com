import { Response } from 'express';
import { z } from 'zod';
import { APP_TIMEZONE } from '../database.js';

// Erro com status HTTP, para interromper uma operação (inclusive dentro de transação)
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Resposta padrão de erro dos controllers
export function sendError(res: Response, error: unknown, fallbackMessage: string) {
  if (error instanceof z.ZodError) {
    return res.status(400).json({ error: error.errors });
  }
  if (error instanceof HttpError) {
    return res.status(error.status).json({ error: error.message });
  }

  // Erros do Postgres que são culpa dos dados enviados, não do servidor
  const code = (error as { code?: string } | null)?.code;
  if (code === '23505') {
    return res.status(409).json({ error: 'Já existe um cadastro com esses dados (ex.: CPF ou nome repetido)' });
  }
  if (code === '23503') {
    return res.status(409).json({ error: 'Registro vinculado a outros dados; não pode ser alterado ou excluído' });
  }
  if (code === '22P02' || code === '22007' || code === '22008' || code === '23514') {
    return res.status(400).json({ error: 'Dados inválidos' });
  }

  console.error(`${fallbackMessage}:`, error);
  return res.status(500).json({ error: fallbackMessage });
}

// Data no formato AAAA-MM-DD vinda de query string (opcional)
export function parseDateParam(value: unknown, name: string): string | undefined {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || isNaN(Date.parse(value))) {
    throw new HttpError(400, `Data inválida em "${name}" (use AAAA-MM-DD)`);
  }
  return value;
}

// Schema zod para datas AAAA-MM-DD no corpo da requisição
export const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (use AAAA-MM-DD)')
  .refine((value) => !isNaN(Date.parse(value)), 'Data inválida');

// Data de hoje (AAAA-MM-DD) no fuso do negócio
export function todayInAppTimezone(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

// Soma dias a uma data AAAA-MM-DD
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
