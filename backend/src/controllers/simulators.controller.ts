import { Request, Response } from 'express';
import { z } from 'zod';
import { sendError, dateString, todayInAppTimezone, round2 } from '../utils/http.js';

// ==================== SIMULADOR DE IMPOSTOS ====================

const impostosSchema = z.object({
  faturamento_mensal: z.number().positive(),
  tipo_atividade: z.enum(['comercio', 'servicos', 'industria']).default('comercio'),
  // ICMS/ISS efetivo estimado (% do faturamento) no Lucro Presumido; no Simples já está no DAS
  aliquota_icms_iss: z.number().min(0).max(30).default(0)
});

// MEI - limite anual de faturamento
const MEI_LIMITE_ANUAL = 81000;

// DAS do MEI = 5% do salário mínimo (INSS) + R$ 1 de ICMS (comércio/indústria) ou R$ 5 de ISS (serviços)
const MEI_DAS_POR_ANO: Record<number, { comercio: number; servicos: number }> = {
  2025: { comercio: 76.90, servicos: 80.90 }, // salário mínimo R$ 1.518,00
  2026: { comercio: 82.05, servicos: 86.05 }  // salário mínimo R$ 1.621,00
};

interface FaixaSimples { limite: number; aliquota: number; deducao: number }

// Simples Nacional - Anexo I (comércio)
const SIMPLES_COMERCIO: FaixaSimples[] = [
  { limite: 180000, aliquota: 4, deducao: 0 },
  { limite: 360000, aliquota: 7.3, deducao: 5940 },
  { limite: 720000, aliquota: 9.5, deducao: 13860 },
  { limite: 1800000, aliquota: 10.7, deducao: 22500 },
  { limite: 3600000, aliquota: 14.3, deducao: 87300 },
  { limite: 4800000, aliquota: 19, deducao: 378000 }
];

// Simples Nacional - Anexo II (indústria)
const SIMPLES_INDUSTRIA: FaixaSimples[] = [
  { limite: 180000, aliquota: 4.5, deducao: 0 },
  { limite: 360000, aliquota: 7.8, deducao: 5940 },
  { limite: 720000, aliquota: 10, deducao: 13860 },
  { limite: 1800000, aliquota: 11.2, deducao: 22500 },
  { limite: 3600000, aliquota: 14.7, deducao: 85500 },
  { limite: 4800000, aliquota: 30, deducao: 720000 }
];

// Simples Nacional - Anexo III (serviços)
const SIMPLES_SERVICOS: FaixaSimples[] = [
  { limite: 180000, aliquota: 6, deducao: 0 },
  { limite: 360000, aliquota: 11.2, deducao: 9360 },
  { limite: 720000, aliquota: 13.5, deducao: 17640 },
  { limite: 1800000, aliquota: 16, deducao: 35640 },
  { limite: 3600000, aliquota: 21, deducao: 125640 },
  { limite: 4800000, aliquota: 33, deducao: 648000 }
];

// Lucro Presumido: percentuais de presunção sobre o faturamento
const LP_COMERCIO_INDUSTRIA = {
  presuncao_irpj: 8,
  presuncao_csll: 12,
  irpj: 15,
  csll: 9,
  pis: 0.65,
  cofins: 3
};

const LP_SERVICOS = {
  presuncao_irpj: 32,
  presuncao_csll: 32,
  irpj: 15,
  csll: 9,
  pis: 0.65,
  cofins: 3
};

function dasMeiDoAno(ano: number) {
  const anos = Object.keys(MEI_DAS_POR_ANO).map(Number).sort((a, b) => b - a);
  const escolhido = anos.find((a) => a <= ano) ?? anos[anos.length - 1];
  return MEI_DAS_POR_ANO[escolhido];
}

export async function simularImpostos(req: Request, res: Response) {
  try {
    const dados = impostosSchema.parse(req.body);
    const faturamentoAnual = dados.faturamento_mensal * 12;
    const avisos: string[] = [];

    const resultados: {
      mei: { elegivel: boolean; imposto_mensal?: number; limite_mensal?: number };
      simples: { elegivel: boolean; aliquota_efetiva?: number; imposto_mensal?: number };
      lucro_presumido: { imposto_mensal: number; detalhamento: Record<string, number> };
      recomendacao: string;
    } = {
      mei: { elegivel: false },
      simples: { elegivel: false },
      lucro_presumido: { imposto_mensal: 0, detalhamento: {} },
      recomendacao: ''
    };

    // MEI
    if (faturamentoAnual <= MEI_LIMITE_ANUAL) {
      const das = dasMeiDoAno(Number(todayInAppTimezone().slice(0, 4)));
      resultados.mei = {
        elegivel: true,
        imposto_mensal: dados.tipo_atividade === 'servicos' ? das.servicos : das.comercio,
        limite_mensal: MEI_LIMITE_ANUAL / 12
      };
      if (dados.tipo_atividade === 'servicos') {
        avisos.push('Nem toda atividade de serviço pode ser MEI; confira a lista de ocupações permitidas.');
      }
    } else {
      resultados.mei = {
        elegivel: false,
        limite_mensal: MEI_LIMITE_ANUAL / 12
      };
    }

    // Simples Nacional
    const tabelaSimples = dados.tipo_atividade === 'servicos'
      ? SIMPLES_SERVICOS
      : dados.tipo_atividade === 'industria' ? SIMPLES_INDUSTRIA : SIMPLES_COMERCIO;
    const faixaSimples = tabelaSimples.find(f => faturamentoAnual <= f.limite);

    if (faixaSimples) {
      const aliquotaEfetiva = ((faturamentoAnual * faixaSimples.aliquota / 100) - faixaSimples.deducao) / faturamentoAnual * 100;
      const impostoMensal = dados.faturamento_mensal * (aliquotaEfetiva / 100);

      resultados.simples = {
        elegivel: true,
        aliquota_efetiva: round2(aliquotaEfetiva),
        imposto_mensal: round2(impostoMensal)
      };
    } else {
      resultados.simples = { elegivel: false };
    }

    // Lucro Presumido
    const lpConfig = dados.tipo_atividade === 'servicos' ? LP_SERVICOS : LP_COMERCIO_INDUSTRIA;
    const baseIRPJ = dados.faturamento_mensal * (lpConfig.presuncao_irpj / 100);
    const baseCSLL = dados.faturamento_mensal * (lpConfig.presuncao_csll / 100);
    const irpj = baseIRPJ * (lpConfig.irpj / 100);
    const csll = baseCSLL * (lpConfig.csll / 100);
    const pis = dados.faturamento_mensal * (lpConfig.pis / 100);
    const cofins = dados.faturamento_mensal * (lpConfig.cofins / 100);
    const icmsIss = dados.faturamento_mensal * (dados.aliquota_icms_iss / 100);

    // Adicional de IRPJ (10% sobre lucro presumido que exceder R$ 20.000/mês)
    const adicionalIRPJ = Math.max(0, (baseIRPJ - 20000) * 0.10);

    const totalLP = irpj + adicionalIRPJ + csll + pis + cofins + icmsIss;

    if (dados.aliquota_icms_iss === 0) {
      avisos.push('O Lucro Presumido foi calculado sem ICMS/ISS, que no Simples já estão no DAS. Informe a alíquota estimada para comparar corretamente.');
    }

    resultados.lucro_presumido = {
      imposto_mensal: round2(totalLP),
      detalhamento: {
        base_presumida: round2(baseIRPJ),
        base_presumida_csll: round2(baseCSLL),
        irpj: round2(irpj),
        adicional_irpj: round2(adicionalIRPJ),
        csll: round2(csll),
        pis: round2(pis),
        cofins: round2(cofins),
        icms_iss: round2(icmsIss)
      }
    };

    // Recomendação
    const valores = [];
    if (resultados.mei.elegivel && resultados.mei.imposto_mensal) {
      valores.push({ regime: 'MEI', valor: resultados.mei.imposto_mensal });
    }
    if (resultados.simples.elegivel && resultados.simples.imposto_mensal) {
      valores.push({ regime: 'Simples Nacional', valor: resultados.simples.imposto_mensal });
    }
    valores.push({ regime: 'Lucro Presumido', valor: resultados.lucro_presumido.imposto_mensal });

    valores.sort((a, b) => a.valor - b.valor);
    resultados.recomendacao = valores[0].regime;

    res.json({
      faturamento_mensal: dados.faturamento_mensal,
      faturamento_anual: faturamentoAnual,
      tipo_atividade: dados.tipo_atividade,
      ...resultados,
      avisos
    });
  } catch (error) {
    sendError(res, error, 'Erro ao simular impostos');
  }
}

// ==================== SIMULADOR DE RESCISÃO ====================

const rescisaoSchema = z.object({
  salario_bruto: z.number().positive(),
  data_admissao: dateString,
  data_demissao: dateString,
  tipo_rescisao: z.enum(['sem_justa_causa', 'com_justa_causa', 'pedido_demissao', 'acordo']),
  saldo_fgts: z.number().min(0).default(0),
  aviso_previo_trabalhado: z.boolean().default(false),
  ferias_vencidas: z.boolean().default(false),
  meses_ferias_proporcionais: z.number().int().min(0).max(12).default(0)
}).refine((d) => d.data_demissao >= d.data_admissao, {
  message: 'A data de demissão não pode ser anterior à admissão',
  path: ['data_demissao']
});

const DIA_MS = 24 * 60 * 60 * 1000;

// Datas tratadas em UTC para não depender do fuso do servidor
function parseData(value: string): Date {
  const [ano, mes, dia] = value.split('-').map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia));
}

// Anos e meses completos entre duas datas
function tempoDeServico(inicio: Date, fim: Date): { anos: number; meses: number } {
  let meses = (fim.getUTCFullYear() - inicio.getUTCFullYear()) * 12 + (fim.getUTCMonth() - inicio.getUTCMonth());
  if (fim.getUTCDate() < inicio.getUTCDate()) meses--;
  meses = Math.max(0, meses);
  return { anos: Math.floor(meses / 12), meses: meses % 12 };
}

// Avos (1/12): meses entre `inicio` e `fim` com pelo menos 15 dias trabalhados
function contarAvos(inicio: Date, fim: Date): number {
  let total = 0;
  let cursor = Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth(), 1);

  while (cursor <= fim.getTime()) {
    const mes = new Date(cursor);
    const fimDoMes = Date.UTC(mes.getUTCFullYear(), mes.getUTCMonth() + 1, 0);
    const de = Math.max(cursor, inicio.getTime());
    const ate = Math.min(fimDoMes, fim.getTime());
    if (Math.round((ate - de) / DIA_MS) + 1 >= 15) total++;
    cursor = Date.UTC(mes.getUTCFullYear(), mes.getUTCMonth() + 1, 1);
  }

  return total;
}

export async function simularRescisao(req: Request, res: Response) {
  try {
    const dados = rescisaoSchema.parse(req.body);

    const dataAdmissao = parseData(dados.data_admissao);
    const dataDemissao = parseData(dados.data_demissao);

    // Calcular tempo de serviço
    const diffDays = Math.round((dataDemissao.getTime() - dataAdmissao.getTime()) / DIA_MS);
    const tempo = tempoDeServico(dataAdmissao, dataDemissao);
    const mesesTrabalhados = tempo.anos * 12 + tempo.meses;

    // Dias trabalhados no mês da demissão (a partir da admissão, se for no mesmo mês)
    const mesmoMes = dataAdmissao.getUTCFullYear() === dataDemissao.getUTCFullYear()
      && dataAdmissao.getUTCMonth() === dataDemissao.getUTCMonth();
    const diasTrabalhadosMes = mesmoMes
      ? dataDemissao.getUTCDate() - dataAdmissao.getUTCDate() + 1
      : dataDemissao.getUTCDate();
    const salarioDia = dados.salario_bruto / 30;

    const verbas: Record<string, number> = {};
    const observacoes: string[] = [];
    let totalProventos = 0;
    let totalDescontos = 0;

    // 1. Saldo de salário
    verbas.saldo_salario = round2(salarioDia * diasTrabalhadosMes);
    totalProventos += verbas.saldo_salario;

    // 2. Aviso prévio (se aplicável)
    // O aviso indenizado conta como tempo de serviço (projeção) para 13º
    let fimProjetado = dataDemissao;
    if (dados.tipo_rescisao === 'sem_justa_causa' || dados.tipo_rescisao === 'acordo') {
      // Aviso prévio proporcional: 30 dias + 3 dias por ano completo (máx 90 dias)
      const diasAvisoPrevio = Math.min(90, 30 + tempo.anos * 3);

      if (dados.aviso_previo_trabalhado) {
        verbas.aviso_previo_trabalhado = 0; // Já foi pago como salário
      } else {
        if (dados.tipo_rescisao === 'acordo') {
          // Acordo: 50% do aviso prévio indenizado
          verbas.aviso_previo_indenizado = round2(diasAvisoPrevio * salarioDia * 0.5);
        } else {
          verbas.aviso_previo_indenizado = round2(diasAvisoPrevio * salarioDia);
        }
        totalProventos += verbas.aviso_previo_indenizado;
        fimProjetado = new Date(dataDemissao.getTime() + diasAvisoPrevio * DIA_MS);
        observacoes.push(`Aviso prévio indenizado de ${diasAvisoPrevio} dias projetado no tempo de serviço.`);
      }
    } else if (dados.tipo_rescisao === 'pedido_demissao' && !dados.aviso_previo_trabalhado) {
      // Desconto do aviso prévio se não trabalhado
      verbas.desconto_aviso_previo = round2(dados.salario_bruto);
      totalDescontos += verbas.desconto_aviso_previo;
    }

    // 3. Férias vencidas
    if (dados.ferias_vencidas) {
      verbas.ferias_vencidas = round2(dados.salario_bruto);
      verbas.terco_ferias_vencidas = round2(dados.salario_bruto / 3);
      totalProventos += verbas.ferias_vencidas + verbas.terco_ferias_vencidas;
    }

    // 4. Férias proporcionais (não aplicável para justa causa)
    if (dados.tipo_rescisao !== 'com_justa_causa' && dados.meses_ferias_proporcionais > 0) {
      const feriasProporcionais = (dados.salario_bruto / 12) * dados.meses_ferias_proporcionais;
      verbas.ferias_proporcionais = round2(feriasProporcionais);
      verbas.terco_ferias_proporcionais = round2(feriasProporcionais / 3);
      totalProventos += verbas.ferias_proporcionais + verbas.terco_ferias_proporcionais;
    }

    // 5. 13º proporcional (não aplicável para justa causa): avos desde a admissão ou 1º de janeiro
    let meses13 = 0;
    if (dados.tipo_rescisao !== 'com_justa_causa') {
      const inicioAno = new Date(Date.UTC(dataDemissao.getUTCFullYear(), 0, 1));
      const inicio13 = dataAdmissao > inicioAno ? dataAdmissao : inicioAno;
      meses13 = contarAvos(inicio13, fimProjetado);
      verbas.decimo_terceiro_proporcional = round2((dados.salario_bruto / 12) * meses13);
      totalProventos += verbas.decimo_terceiro_proporcional;
    }

    // 6. FGTS
    let multaFGTS = 0;
    let saqueFGTS = 0;

    if (dados.tipo_rescisao === 'sem_justa_causa') {
      // 40% de multa sobre todo o FGTS
      multaFGTS = dados.saldo_fgts * 0.40;
      saqueFGTS = dados.saldo_fgts + multaFGTS;
    } else if (dados.tipo_rescisao === 'acordo') {
      // 20% de multa, saca 80% do FGTS
      multaFGTS = dados.saldo_fgts * 0.20;
      saqueFGTS = (dados.saldo_fgts * 0.80) + multaFGTS;
    }

    verbas.multa_fgts = round2(multaFGTS);
    verbas.saque_fgts = round2(saqueFGTS);

    // Seguro-desemprego: na 1ª solicitação exige 12 meses trabalhados (9 na 2ª e 6 a partir da 3ª)
    const direitoSeguro = dados.tipo_rescisao === 'sem_justa_causa' && mesesTrabalhados >= 12;
    if (dados.tipo_rescisao === 'sem_justa_causa' && !direitoSeguro && mesesTrabalhados >= 6) {
      observacoes.push('Seguro-desemprego: menos de 12 meses só dá direito se não for a 1ª solicitação (9 meses na 2ª, 6 a partir da 3ª).');
    }
    observacoes.push('Valores brutos: INSS e IRRF sobre as verbas rescisórias não foram descontados.');

    const totalRescisao = totalProventos - totalDescontos;

    res.json({
      dados_contrato: {
        salario_bruto: dados.salario_bruto,
        data_admissao: dados.data_admissao,
        data_demissao: dados.data_demissao,
        tempo_servico: {
          anos: tempo.anos,
          meses: tempo.meses,
          dias: diffDays
        }
      },
      tipo_rescisao: dados.tipo_rescisao,
      verbas_rescisorias: verbas,
      resumo: {
        total_proventos: round2(totalProventos),
        total_descontos: round2(totalDescontos),
        total_rescisao: round2(totalRescisao),
        meses_13: meses13,
        fgts: {
          saldo: dados.saldo_fgts,
          multa: verbas.multa_fgts,
          saque_total: verbas.saque_fgts
        },
        direito_seguro_desemprego: direitoSeguro,
        observacoes
      }
    });
  } catch (error) {
    sendError(res, error, 'Erro ao simular rescisão');
  }
}
