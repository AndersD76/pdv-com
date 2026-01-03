import { Request, Response } from 'express';
import { sql } from '../database.js';
import { z } from 'zod';

const timeClockSchema = z.object({
  funcionario_id: z.number().optional(),
  funcionario_nome: z.string().min(1, 'Nome do funcionário é obrigatório'),
  tipo: z.enum(['entrada', 'saida']),
  data: z.string().optional(),
  hora: z.string().optional(),
  observacao: z.string().optional()
});

const workScheduleSchema = z.object({
  seg_sex_entrada: z.string(),
  seg_sex_saida: z.string(),
  intervalo_inicio: z.string().optional(),
  intervalo_fim: z.string().optional(),
  sabado_entrada: z.string().optional().nullable(),
  sabado_saida: z.string().optional().nullable(),
  carga_horaria_diaria: z.number().int().min(1).max(12),
  tolerancia_minutos: z.number().int().min(0).max(30)
});

// Registrar ponto
export async function registrar(req: Request, res: Response) {
  try {
    const data = timeClockSchema.parse(req.body);

    const agora = new Date();
    const dataRegistro = data.data || agora.toISOString().split('T')[0];
    const horaRegistro = data.hora || agora.toLocaleTimeString('pt-BR', { hour12: false });

    const [registro] = await sql`
      INSERT INTO time_clock (funcionario_id, funcionario_nome, data, hora, tipo, observacao)
      VALUES (${data.funcionario_id || null}, ${data.funcionario_nome}, ${dataRegistro}, ${horaRegistro}, ${data.tipo}, ${data.observacao || null})
      RETURNING *
    `;

    res.status(201).json(registro);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Erro ao registrar ponto:', error);
    res.status(500).json({ error: 'Erro ao registrar ponto' });
  }
}

// Listar registros de ponto
export async function getAll(req: Request, res: Response) {
  try {
    const { data_inicio, data_fim, funcionario_id, tipo } = req.query;

    let registros;

    if (data_inicio && data_fim) {
      if (funcionario_id) {
        registros = await sql`
          SELECT * FROM time_clock
          WHERE data >= ${data_inicio} AND data <= ${data_fim}
          AND funcionario_id = ${funcionario_id}
          ORDER BY data DESC, hora DESC
        `;
      } else if (tipo && tipo !== 'todos') {
        registros = await sql`
          SELECT * FROM time_clock
          WHERE data >= ${data_inicio} AND data <= ${data_fim}
          AND tipo = ${tipo}
          ORDER BY data DESC, hora DESC
        `;
      } else {
        registros = await sql`
          SELECT * FROM time_clock
          WHERE data >= ${data_inicio} AND data <= ${data_fim}
          ORDER BY data DESC, hora DESC
        `;
      }
    } else {
      // Últimos 7 dias por padrão
      registros = await sql`
        SELECT * FROM time_clock
        WHERE data >= CURRENT_DATE - INTERVAL '7 days'
        ORDER BY data DESC, hora DESC
      `;
    }

    res.json(registros);
  } catch (error) {
    console.error('Erro ao listar registros:', error);
    res.status(500).json({ error: 'Erro ao listar registros de ponto' });
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
    console.error('Erro ao buscar registro:', error);
    res.status(500).json({ error: 'Erro ao buscar registro' });
  }
}

// Atualizar registro de ponto
export async function update(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { data, hora, tipo, observacao } = req.body;

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
    console.error('Erro ao atualizar registro:', error);
    res.status(500).json({ error: 'Erro ao atualizar registro' });
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
    console.error('Erro ao excluir registro:', error);
    res.status(500).json({ error: 'Erro ao excluir registro' });
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
    console.error('Erro ao buscar jornada:', error);
    res.status(500).json({ error: 'Erro ao buscar configuração de jornada' });
  }
}

// Salvar configuração de jornada
export async function saveJornada(req: Request, res: Response) {
  try {
    const data = workScheduleSchema.parse(req.body);

    // Verificar se já existe configuração
    const [existing] = await sql`SELECT id FROM work_schedule LIMIT 1`;

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
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Erro ao salvar jornada:', error);
    res.status(500).json({ error: 'Erro ao salvar configuração de jornada' });
  }
}

// Resumo do ponto (para integração com folha)
export async function getResumo(req: Request, res: Response) {
  try {
    const { funcionario_id, mes, ano } = req.query;

    if (!funcionario_id || !mes || !ano) {
      return res.status(400).json({ error: 'Parâmetros funcionario_id, mes e ano são obrigatórios' });
    }

    const registros = await sql`
      SELECT * FROM time_clock
      WHERE funcionario_id = ${funcionario_id}
      AND EXTRACT(MONTH FROM data) = ${mes}
      AND EXTRACT(YEAR FROM data) = ${ano}
      ORDER BY data, hora
    `;

    // Calcular horas trabalhadas
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
    const [jornada] = await sql`SELECT carga_horaria_diaria FROM work_schedule LIMIT 1`;
    const cargaDiaria = jornada?.carga_horaria_diaria || 8;
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
    console.error('Erro ao gerar resumo:', error);
    res.status(500).json({ error: 'Erro ao gerar resumo do ponto' });
  }
}
