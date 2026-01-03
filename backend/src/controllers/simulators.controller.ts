import { Request, Response } from 'express';
import { z } from 'zod';

// ==================== SIMULADOR DE IMPOSTOS ====================

const impostosSchema = z.object({
  faturamento_mensal: z.number().positive(),
  tipo_atividade: z.enum(['comercio', 'servicos', 'industria']).default('comercio')
});

// MEI - Limite 2025: R$ 81.000/ano (R$ 6.750/mês)
const MEI_LIMITE_ANUAL = 81000;
const MEI_DAS_COMERCIO = 71.60; // ICMS
const MEI_DAS_SERVICOS = 75.60; // ISS
const MEI_DAS_COMERCIO_SERVICOS = 76.60; // ICMS + ISS

// Simples Nacional - Anexos
const SIMPLES_COMERCIO = [
  { limite: 180000, aliquota: 4, deducao: 0 },
  { limite: 360000, aliquota: 7.3, deducao: 5940 },
  { limite: 720000, aliquota: 9.5, deducao: 13860 },
  { limite: 1800000, aliquota: 10.7, deducao: 22500 },
  { limite: 3600000, aliquota: 14.3, deducao: 87300 },
  { limite: 4800000, aliquota: 19, deducao: 378000 }
];

const SIMPLES_SERVICOS = [
  { limite: 180000, aliquota: 6, deducao: 0 },
  { limite: 360000, aliquota: 11.2, deducao: 9360 },
  { limite: 720000, aliquota: 13.5, deducao: 17640 },
  { limite: 1800000, aliquota: 16, deducao: 35640 },
  { limite: 3600000, aliquota: 21, deducao: 125640 },
  { limite: 4800000, aliquota: 33, deducao: 648000 }
];

// Lucro Presumido
const LP_COMERCIO = {
  presuncao: 8, // 8% do faturamento
  irpj: 15,
  csll: 9,
  pis: 0.65,
  cofins: 3
};

const LP_SERVICOS = {
  presuncao: 32, // 32% do faturamento
  irpj: 15,
  csll: 9,
  pis: 0.65,
  cofins: 3
};

export async function simularImpostos(req: Request, res: Response) {
  try {
    const dados = impostosSchema.parse(req.body);
    const faturamentoAnual = dados.faturamento_mensal * 12;

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
      let dasMei = MEI_DAS_COMERCIO;
      if (dados.tipo_atividade === 'servicos') {
        dasMei = MEI_DAS_SERVICOS;
      }
      resultados.mei = {
        elegivel: true,
        imposto_mensal: dasMei,
        limite_mensal: MEI_LIMITE_ANUAL / 12
      };
    } else {
      resultados.mei = {
        elegivel: false,
        limite_mensal: MEI_LIMITE_ANUAL / 12
      };
    }

    // Simples Nacional
    const tabelaSimples = dados.tipo_atividade === 'servicos' ? SIMPLES_SERVICOS : SIMPLES_COMERCIO;
    const faixaSimples = tabelaSimples.find(f => faturamentoAnual <= f.limite);

    if (faixaSimples) {
      const aliquotaEfetiva = ((faturamentoAnual * faixaSimples.aliquota / 100) - faixaSimples.deducao) / faturamentoAnual * 100;
      const impostoMensal = dados.faturamento_mensal * (aliquotaEfetiva / 100);

      resultados.simples = {
        elegivel: true,
        aliquota_efetiva: Math.round(aliquotaEfetiva * 100) / 100,
        imposto_mensal: Math.round(impostoMensal * 100) / 100
      };
    } else {
      resultados.simples = { elegivel: false };
    }

    // Lucro Presumido
    const lpConfig = dados.tipo_atividade === 'servicos' ? LP_SERVICOS : LP_COMERCIO;
    const basePresumida = dados.faturamento_mensal * (lpConfig.presuncao / 100);
    const irpj = basePresumida * (lpConfig.irpj / 100);
    const csll = basePresumida * (lpConfig.csll / 100);
    const pis = dados.faturamento_mensal * (lpConfig.pis / 100);
    const cofins = dados.faturamento_mensal * (lpConfig.cofins / 100);

    // Adicional de IRPJ (10% sobre lucro que exceder R$ 20.000/mês)
    const adicionalIRPJ = Math.max(0, (basePresumida - 20000) * 0.10);

    const totalLP = irpj + adicionalIRPJ + csll + pis + cofins;

    resultados.lucro_presumido = {
      imposto_mensal: Math.round(totalLP * 100) / 100,
      detalhamento: {
        base_presumida: Math.round(basePresumida * 100) / 100,
        irpj: Math.round(irpj * 100) / 100,
        adicional_irpj: Math.round(adicionalIRPJ * 100) / 100,
        csll: Math.round(csll * 100) / 100,
        pis: Math.round(pis * 100) / 100,
        cofins: Math.round(cofins * 100) / 100
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
      ...resultados
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Erro ao simular impostos:', error);
    res.status(500).json({ error: 'Erro ao simular impostos' });
  }
}

// ==================== SIMULADOR DE RESCISÃO ====================

const rescisaoSchema = z.object({
  salario_bruto: z.number().positive(),
  data_admissao: z.string(),
  data_demissao: z.string(),
  tipo_rescisao: z.enum(['sem_justa_causa', 'com_justa_causa', 'pedido_demissao', 'acordo']),
  saldo_fgts: z.number().min(0).default(0),
  aviso_previo_trabalhado: z.boolean().default(false),
  ferias_vencidas: z.boolean().default(false),
  meses_ferias_proporcionais: z.number().int().min(0).max(12).default(0)
});

export async function simularRescisao(req: Request, res: Response) {
  try {
    const dados = rescisaoSchema.parse(req.body);

    const dataAdmissao = new Date(dados.data_admissao);
    const dataDemissao = new Date(dados.data_demissao);

    // Calcular tempo de serviço
    const diffTime = dataDemissao.getTime() - dataAdmissao.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const anosServico = diffDays / 365;
    const mesesServico = Math.floor((diffDays % 365) / 30);

    // Dias trabalhados no mês da demissão
    const diasTrabalhadosMes = dataDemissao.getDate();
    const salarioDia = dados.salario_bruto / 30;

    const verbas: Record<string, number> = {};
    let totalProventos = 0;
    let totalDescontos = 0;

    // 1. Saldo de salário
    verbas.saldo_salario = Math.round(salarioDia * diasTrabalhadosMes * 100) / 100;
    totalProventos += verbas.saldo_salario;

    // 2. Aviso prévio (se aplicável)
    if (dados.tipo_rescisao === 'sem_justa_causa' || dados.tipo_rescisao === 'acordo') {
      // Aviso prévio proporcional: 30 dias + 3 dias por ano trabalhado (máx 90 dias)
      const diasAvisoPrevio = Math.min(90, 30 + Math.floor(anosServico) * 3);

      if (dados.aviso_previo_trabalhado) {
        verbas.aviso_previo_trabalhado = 0; // Já foi pago como salário
      } else {
        if (dados.tipo_rescisao === 'acordo') {
          // Acordo: 50% do aviso prévio indenizado
          verbas.aviso_previo_indenizado = Math.round((diasAvisoPrevio * salarioDia * 0.5) * 100) / 100;
        } else {
          verbas.aviso_previo_indenizado = Math.round(diasAvisoPrevio * salarioDia * 100) / 100;
        }
        totalProventos += verbas.aviso_previo_indenizado;
      }
    } else if (dados.tipo_rescisao === 'pedido_demissao' && !dados.aviso_previo_trabalhado) {
      // Desconto do aviso prévio se não trabalhado
      verbas.desconto_aviso_previo = Math.round(dados.salario_bruto * 100) / 100;
      totalDescontos += verbas.desconto_aviso_previo;
    }

    // 3. Férias vencidas
    if (dados.ferias_vencidas) {
      verbas.ferias_vencidas = Math.round(dados.salario_bruto * 100) / 100;
      verbas.terco_ferias_vencidas = Math.round((dados.salario_bruto / 3) * 100) / 100;
      totalProventos += verbas.ferias_vencidas + verbas.terco_ferias_vencidas;
    }

    // 4. Férias proporcionais (não aplicável para justa causa)
    if (dados.tipo_rescisao !== 'com_justa_causa' && dados.meses_ferias_proporcionais > 0) {
      const feriasProporcionais = (dados.salario_bruto / 12) * dados.meses_ferias_proporcionais;
      verbas.ferias_proporcionais = Math.round(feriasProporcionais * 100) / 100;
      verbas.terco_ferias_proporcionais = Math.round((feriasProporcionais / 3) * 100) / 100;
      totalProventos += verbas.ferias_proporcionais + verbas.terco_ferias_proporcionais;
    }

    // 5. 13º proporcional (não aplicável para justa causa)
    if (dados.tipo_rescisao !== 'com_justa_causa') {
      const meses13 = dataDemissao.getMonth() + 1; // Meses trabalhados no ano
      verbas.decimo_terceiro_proporcional = Math.round(((dados.salario_bruto / 12) * meses13) * 100) / 100;
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
    } else if (dados.tipo_rescisao === 'pedido_demissao' || dados.tipo_rescisao === 'com_justa_causa') {
      // Não tem direito a multa nem saque imediato
      multaFGTS = 0;
      saqueFGTS = 0;
    }

    verbas.multa_fgts = Math.round(multaFGTS * 100) / 100;
    verbas.saque_fgts = Math.round(saqueFGTS * 100) / 100;

    // Seguro desemprego
    let direito_seguro = false;
    if (dados.tipo_rescisao === 'sem_justa_causa' && anosServico >= 0.5) {
      direito_seguro = true;
    }

    const totalRescisao = totalProventos - totalDescontos;

    res.json({
      dados_contrato: {
        salario_bruto: dados.salario_bruto,
        data_admissao: dados.data_admissao,
        data_demissao: dados.data_demissao,
        tempo_servico: {
          anos: Math.floor(anosServico),
          meses: mesesServico,
          dias: diffDays
        }
      },
      tipo_rescisao: dados.tipo_rescisao,
      verbas_rescisorias: verbas,
      resumo: {
        total_proventos: Math.round(totalProventos * 100) / 100,
        total_descontos: Math.round(totalDescontos * 100) / 100,
        total_rescisao: Math.round(totalRescisao * 100) / 100,
        fgts: {
          saldo: dados.saldo_fgts,
          multa: verbas.multa_fgts,
          saque_total: verbas.saque_fgts
        },
        direito_seguro_desemprego: direito_seguro
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Erro ao simular rescisão:', error);
    res.status(500).json({ error: 'Erro ao simular rescisão' });
  }
}
