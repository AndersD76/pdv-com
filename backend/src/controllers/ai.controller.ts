import { Request, Response } from 'express';
import { z } from 'zod';
import { analisarPeca, isAiConfigured } from '../services/productAi.js';
import { HttpError, sendError } from '../utils/http.js';
import { detectImageMime } from '../utils/images.js';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const analiseSchema = z.object({
  imagens: z.array(z.object({
    data: z.string().min(100, 'Imagem vazia')
  })).min(1, 'Envie pelo menos uma foto').max(3, 'Envie no máximo 3 fotos')
});

// Limite por usuário para evitar custo descontrolado (cada análise é uma chamada paga à API)
const MAX_ANALISES = 40;
const JANELA_MS = 10 * 60 * 1000;
const usoPorUsuario = new Map<number, number[]>();

function registrarUso(userId: number) {
  const agora = Date.now();
  const recentes = (usoPorUsuario.get(userId) ?? []).filter((t) => t > agora - JANELA_MS);
  if (recentes.length >= MAX_ANALISES) {
    throw new HttpError(429, 'Muitas análises seguidas. Aguarde alguns minutos.');
  }
  recentes.push(agora);
  usoPorUsuario.set(userId, recentes);
}

export async function status(_req: Request, res: Response) {
  res.json({ configurado: isAiConfigured() });
}

export async function analisarPecaHandler(req: Request, res: Response) {
  try {
    const { imagens } = analiseSchema.parse(req.body);

    const validadas = imagens.map((imagem, index) => {
      // Aceita base64 puro ou data URL ("data:image/jpeg;base64,...")
      const base64 = imagem.data.replace(/^data:[^;]+;base64,/, '');
      const bytes = Buffer.from(base64, 'base64');
      const mediaType = detectImageMime(bytes);
      if (!mediaType) {
        throw new HttpError(400, `Foto ${index + 1}: formato não suportado (use JPEG, PNG ou WebP)`);
      }
      if (bytes.length > MAX_IMAGE_BYTES) {
        throw new HttpError(400, `Foto ${index + 1}: arquivo muito grande (máximo 5 MB)`);
      }
      return { mediaType, base64: bytes.toString('base64') };
    });

    registrarUso(req.user!.id);
    const analise = await analisarPeca(validadas);
    res.json(analise);
  } catch (error) {
    sendError(res, error, 'Erro ao analisar a peça');
  }
}
