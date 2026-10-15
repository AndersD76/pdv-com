import { Request, Response } from 'express';
import { sql, query, APP_TIMEZONE } from '../database.js';
import { z } from 'zod';
import { sendError, parseDateParam, dateString, todayInAppTimezone, addDays } from '../utils/http.js';

const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Hora inválida (use HH:MM)');

// Data e hora do registro são sempre as do servidor (no fuso do negócio); não vêm do cliente
const timeClockSchema = z.object({
  funcionario_id: z.number().int().positive('Selecione um funcionário'),
  tipo: z.enum(['entrada', 'saida']),
  observacao: z.string().max(500).optional()
});

const updateSchema = z.object({
  data: dateString,
  hora: timeString,
  tipo: z.enum(['entrada', 'saida']),
  observacao: z.string().max(500).optional()
});

const workScheduleSchema = z.object({
  seg_sex_entrada: timeString,
  seg_sex_saida: timeString,
  intervalo_inicio: timeString.optional().or(z.literal('')),
  intervalo_fim: timeString.optional().or(z.literal('')),
  sabado_entrada: timeString.optional().nullable().or(z.literal('')),
  sabado_saida: timeString.optional().nullable().or(z.literal('')),
  carga_horaria_diaria: z.number().int().min(1).max(12),
  tolerancia_minutos: z.number().int().min(0).max(30)
});

// Registrar ponto
export async function registrar(req: Request, res: Response) {
  try {
    const data = timeClockSchema.parse(req.body);

    const [registro] = await sql`
      INSERT INTO time_clock (funcionario_id, funcionario_nome, data, hora, tipo, observacao)
      SELECT e.id, e.nome,
        (now() AT TIME ZONE ${APP_TIMEZONE})::date,
        (now() AT TIME ZONE ${APP_TIMEZONE})::time(0),
        ${data.tipo}, ${data.observacao || null}
      FROM employees e
      WHERE e.id = ${data.funcionario_id} AND e.status = 'ativo'
      RETURNING *
    `;

    if (!registro) {
      return res.status(400).json({ error: 'Funcionário não encontrado ou inativo' });
    }

    res.status(201).json(registro);
  } catch (error) {
    sendError(res, error, 'Erro ao registrar ponto');
  }
}

// Listar registros de ponto (filtros podem ser combinados)
export async function getAll(req: Request, res: Response) {
  try {
    const dataInicio = parseDateParam(req.query.data_inicio, 'data_inicio') || addDays(todayInAppTimezone(), -7);
    const dataFim = parseDateParam(req.query.data_fim, 'data_fim');
    const { funcionario_id, tipo } = req.query;

    const params: unknown[] = [dataInicio];
    let where = 'data >= $1::date';

    if (dataFim) {
      params.push(dataFim);
      where += ` AND data <= $${params.length}::date`;
    }

    if (funcionario_id) {
      params.push(Number(funcionario_id));
      where += ` AND funcionario_id = $${params.length}`;
    }

    if (tipo && tipo !== 'todos') {
      params.push(tipo);
      where += ` AND tipo = $${params.length}`;
    }

    const registros = await query(
      `SELECT * FROM time_clock WHERE ${where} ORDER BY data DESC, hora DESC`,
      params
    );

    res.json(registros);
  } catch (error) {
    sendError(res, error, 'Erro ao listar registros de ponto');
  }
}

// Buscar registro por ID
export async function getById(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const [registro] = await sql`SELECT * FROM time_clock WHERE id = ${id}`;

    if (!registro) {
      return res.status(404).json({ error: 'Registro não encontrado' });
    }

    res.json(registro);
  } catch (error) {
    sendError(res, error, 'Erro ao buscar registro');
  }
}

// Atualizar registro de ponto (ajuste manual feito pelo administrador)
export async function update(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { data, hora, tipo, observacao } = updateSchema.parse(req.body);

    const [registro] = await sql`
      UPDATE time_clock
      SET data = ${data},
          hora = ${hora},
          tipo = ${tipo},
          observacao = ${observacao || null}
      WHERE id = ${id}
      RETURNING *
    `;

    if (!registro) {
      return res.status(404).json({ error: 'Registro não encontrado' });
    }

    res.json(registro);
  } catch (error) {
    sendError(res, error, 'Erro ao atualizar registro');
  }
}

// Excluir registro de ponto
export async function remove(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const [registro] = await sql`DELETE FROM time_clock WHERE id = ${id} RETURNING *`;

    if (!registro) {
      return res.status(404).json({ error: 'Registro não encontrado' });
    }

    res.json({ message: 'Registro excluído com sucesso' });
  } catch (error) {
    sendError(res, error, 'Erro ao excluir registro');
  }
}

// Obter configuração de jornada
export async function getJornada(req: Request, res: Response) {
  try {
    const [jornada] = await sql`SELECT * FROM work_schedule ORDER BY id LIMIT 1`;

    if (!jornada) {
      // Retorna valores padrão se não existir configuração
      return res.json({
        seg_sex_entrada: '08:00',
        seg_sex_saida: '18:00',
        intervalo_inicio: '12:00',
        intervalo_fim: '13:00',
        sabado_entrada: null,
        sabado_saida: null,
        carga_horaria_diaria: 8,
        tolerancia_minutos: 10
      });
    }

    res.json(jornada);
  } catch (error) {
    sendError(res, error, 'Erro ao buscar configuração de jornada');
  }
}

// Salvar configuração de jornada
export async function saveJornada(req: Request, res: Response) {
  try {
    const data = workScheduleSchema.parse(req.body);

    // Verificar se já existe configuração
    const [existing] = await sql`SELECT id FROM work_schedule ORDER BY id LIMIT 1`;

    let jornada;
    if (existing) {
      [jornada] = await sql`
        UPDATE work_schedule
        SET seg_sex_entrada = ${data.seg_sex_entrada},
            seg_sex_saida = ${data.seg_sex_saida},
            intervalo_inicio = ${data.intervalo_inicio || null},
            intervalo_fim = ${data.intervalo_fim || null},
            sabado_entrada = ${data.sabado_entrada || null},
            sabado_saida = ${data.sabado_saida || null},
            carga_horaria_diaria = ${data.carga_horaria_diaria},
            tolerancia_minutos = ${data.tolerancia_minutos},
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${existing.id}
        RETURNING *
      `;
    } else {
      [jornada] = await sql`
        INSERT INTO work_schedule (seg_sex_entrada, seg_sex_saida, intervalo_inicio, intervalo_fim, sabado_entrada, sabado_saida, carga_horaria_diaria, tolerancia_minutos)
        VALUES (${data.seg_sex_entrada}, ${data.seg_sex_saida}, ${data.intervalo_inicio || null}, ${data.intervalo_fim || null}, ${data.sabado_entrada || null}, ${data.sabado_saida || null}, ${data.carga_horaria_diaria}, ${data.tolerancia_minutos})
        RETURNING *
      `;
    }

    res.json(jornada);
  } catch (error) {
    sendError(res, error, 'Erro ao salvar configuração de jornada');
  }
}

// Resumo do ponto (para integração com folha)
export async function getResumo(req: Request, res: Response) {
  try {
    const funcionarioId = Number(req.query.funcionario_id);
    const mes = Number(req.query.mes);
    const ano = Number(req.query.ano);

    if (!Number.isInteger(funcionarioId) || !Number.isInteger(mes) || mes < 1 || mes > 12 || !Number.isInteger(ano)) {
      return res.status(400).json({ error: 'Parâmetros funcionario_id, mes e ano são obrigatórios' });
    }

    const registros = await sql`
      SELECT * FROM time_clock
      WHERE funcionario_id = ${funcionarioId}
      AND EXTRACT(MONTH FROM data) = ${mes}
      AND EXTRACT(YEAR FROM data) = ${ano}
      ORDER BY data, hora
    `;

    // Calcular horas trabalhadas (data vem como texto 'AAAA-MM-DD' e hora como 'HH:MM:SS')
    let totalMinutos = 0;
    const diasTrabalhados = new Set<string>();
    let ultimaEntrada: { data: string; hora: string } | null = null;

    for (const registro of registros as Array<{ data: string; hora: string; tipo: string }>) {
      if (registro.tipo === 'entrada') {
        ultimaEntrada = { data: registro.data, hora: registro.hora };
      } else if (registro.tipo === 'saida' && ultimaEntrada && ultimaEntrada.data === registro.data) {
        const [entH, entM] = ultimaEntrada.hora.split(':').map(Number);
        const [saiH, saiM] = registro.hora.split(':').map(Number);
        totalMinutos += (saiH * 60 + saiM) - (entH * 60 + entM);
        diasTrabalhados.add(registro.data);
        ultimaEntrada = null;
      }
    }

    // Buscar carga horária diária
    const [jornada] = await sql`SELECT carga_horaria_diaria FROM work_schedule ORDER BY id LIMIT 1`;
    const cargaDiaria = Number(jornada?.carga_horaria_diaria) || 8;
    const horasEsperadas = diasTrabalhados.size * cargaDiaria * 60; // em minutos

    const horasExtras = Math.max(0, totalMinutos - horasEsperadas);

    res.json({
      total_minutos: totalMinutos,
      total_horas: Math.floor(totalMinutos / 60),
      total_minutos_resto: totalMinutos % 60,
      dias_trabalhados: diasTrabalhados.size,
      horas_extras_minutos: horasExtras,
      horas_extras: Math.floor(horasExtras / 60),
      registros: registros.length
    });
  } catch (error) {
    sendError(res, error, 'Erro ao gerar resumo do ponto');
  }
}
