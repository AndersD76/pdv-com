import { Request, Response } from 'express';
import { z } from 'zod';

// Tabelas INSS 2025 (Progressiva)
const FAIXAS_INSS = [
  { teto: 1518.00, aliquota: 0.075 },   // 7,5% até R$ 1.518,00
  { teto: 2793.88, aliquota: 0.09 },    // 9% de R$ 1.518,01 a R$ 2.793,88
  { teto: 4190.83, aliquota: 0.12 },    // 12% de R$ 2.793,89 a R$ 4.190,83
  { teto: 8157.41, aliquota: 0.14 }     // 14% de R$ 4.190,84 a R$ 8.157,41
];
const TETO_INSS = 951.63;

// Tabelas IRRF 2025
const FAIXAS_IRRF = [
  { teto: 2259.20, aliquota: 0, deducao: 0 },           // Isento
  { teto: 2826.65, aliquota: 0.075, deducao: 169.44 },  // 7,5%
  { teto: 3751.05, aliquota: 0.15, deducao: 381.44 },   // 15%
  { teto: 4664.68, aliquota: 0.225, deducao: 662.77 },  // 22,5%
  { teto: Infinity, aliquota: 0.275, deducao: 896.00 }  // 27,5%
];
const DEDUCAO_DEPENDENTE = 189.59;

// Schema para cálculo de folha
const folhaSchema = z.object({
  salario_bruto: z.number().positive(),
  dependentes: z.number().int().min(0).default(0),
  horas_extras: z.number().min(0).default(0),
  percentual_hora_extra: z.number().min(50).max(100).default(50),
  adicional_noturno: z.number().min(0).default(0),
  vale_transporte_perc: z.number().min(0).max(6).default(0),
  vale_refeicao: z.number().min(0).default(0),
  outros_descontos: z.number().min(0).default(0),
  outros_proventos: z.number().min(0).default(0)
});

// Schema para 13º salário
const decimoTerceiroSchema = z.object({
  salario_bruto: z.number().positive(),
  meses_trabalhados: z.number().int().min(1).max(12),
  parcela: z.enum(['primeira', 'segunda']),
  dependentes: z.number().int().min(0).default(0)
});

// Schema para férias
const feriasSchema = z.object({
  salario_bruto: z.number().positive(),
  dias_ferias: z.number().int().min(10).max(30).default(30),
  abono_pecuniario: z.boolean().default(false),
  dependentes: z.number().int().min(0).default(0)
});

// Função para calcular INSS (Progressivo)
function calcularINSS(salarioBruto: number): { valor: number; aliquotaEfetiva: number } {
  let inss = 0;
  let baseAnterior = 0;

  for (const faixa of FAIXAS_INSS) {
    if (salarioBruto > baseAnterior) {
      const baseFaixa = Math.min(salarioBruto, faixa.teto) - baseAnterior;
      inss += baseFaixa * faixa.aliquota;
      baseAnterior = faixa.teto;
    }
  }

  inss = Math.min(inss, TETO_INSS);
  const aliquotaEfetiva = salarioBruto > 0 ? (inss / salarioBruto) * 100 : 0;

  return { valor: Math.round(inss * 100) / 100, aliquotaEfetiva: Math.round(aliquotaEfetiva * 100) / 100 };
}

// Função para calcular IRRF
function calcularIRRF(baseCalculo: number): { valor: number; aliquota: number; faixa: string } {
  for (const faixa of FAIXAS_IRRF) {
    if (baseCalculo <= faixa.teto) {
      const irrf = Math.max(0, baseCalculo * faixa.aliquota - faixa.deducao);
      let faixaNome = 'Isento';
      if (faixa.aliquota === 0.075) faixaNome = '7,5%';
      else if (faixa.aliquota === 0.15) faixaNome = '15%';
      else if (faixa.aliquota === 0.225) faixaNome = '22,5%';
      else if (faixa.aliquota === 0.275) faixaNome = '27,5%';

      return {
        valor: Math.round(irrf * 100) / 100,
        aliquota: faixa.aliquota * 100,
        faixa: faixaNome
      };
    }
  }

  return { valor: 0, aliquota: 0, faixa: 'Isento' };
}

// Calcular folha de pagamento
export async function calcularFolha(req: Request, res: Response) {
  try {
    const dados = folhaSchema.parse(req.body);

    // Cálculo de hora extra
    const valorHora = dados.salario_bruto / 220; // 220h mensais (CLT)
    const valorHoraExtra = dados.horas_extras * valorHora * (1 + dados.percentual_hora_extra / 100);

    // Cálculo de adicional noturno (20%)
    const valorAdicionalNoturno = dados.adicional_noturno * valorHora * 0.2;

    // Total de proventos
    const totalProventos = dados.salario_bruto + valorHoraExtra + valorAdicionalNoturno + dados.outros_proventos;

    // Cálculo do INSS
    const { valor: inss, aliquotaEfetiva: aliquotaINSS } = calcularINSS(totalProventos);

    // Base para IRRF
    const baseIRRF = totalProventos - inss - (dados.dependentes * DEDUCAO_DEPENDENTE);
    const { valor: irrf, aliquota: aliquotaIRRF, faixa: faixaIRRF } = calcularIRRF(baseIRRF);

    // Descontos adicionais
    const descontoVT = dados.salario_bruto * (dados.vale_transporte_perc / 100);
    const descontoVR = dados.vale_refeicao;

    // Total de descontos
    const totalDescontos = inss + irrf + descontoVT + descontoVR + dados.outros_descontos;

    // Salário líquido
    const salarioLiquido = totalProventos - totalDescontos;

    // FGTS (8% - encargo do empregador)
    const fgts = totalProventos * 0.08;

    // INSS Patronal (~28% - encargo do empregador)
    const inssPatronal = totalProventos * 0.28;

    res.json({
      // Proventos
      salario_bruto: dados.salario_bruto,
      horas_extras: {
        quantidade: dados.horas_extras,
        percentual: dados.percentual_hora_extra,
        valor: Math.round(valorHoraExtra * 100) / 100
      },
      adicional_noturno: {
        horas: dados.adicional_noturno,
        valor: Math.round(valorAdicionalNoturno * 100) / 100
      },
      outros_proventos: dados.outros_proventos,
      total_proventos: Math.round(totalProventos * 100) / 100,

      // Descontos
      inss: {
        valor: inss,
        aliquota_efetiva: aliquotaINSS
      },
      irrf: {
        valor: irrf,
        aliquota: aliquotaIRRF,
        faixa: faixaIRRF,
        base_calculo: Math.round(baseIRRF * 100) / 100
      },
      vale_transporte: {
        percentual: dados.vale_transporte_perc,
        valor: Math.round(descontoVT * 100) / 100
      },
      vale_refeicao: descontoVR,
      outros_descontos: dados.outros_descontos,
      total_descontos: Math.round(totalDescontos * 100) / 100,

      // Líquido
      salario_liquido: Math.round(salarioLiquido * 100) / 100,

      // Encargos do empregador
      encargos: {
        fgts: Math.round(fgts * 100) / 100,
        inss_patronal: Math.round(inssPatronal * 100) / 100,
        total: Math.round((fgts + inssPatronal) * 100) / 100
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Erro ao calcular folha:', error);
    res.status(500).json({ error: 'Erro ao calcular folha de pagamento' });
  }
}

// Calcular 13º Salário
export async function calcularDecimoTerceiro(req: Request, res: Response) {
  try {
    const dados = decimoTerceiroSchema.parse(req.body);

    const valorProporcional = (dados.salario_bruto / 12) * dados.meses_trabalhados;

    if (dados.parcela === 'primeira') {
      // Primeira parcela: 50% sem descontos
      const valorPrimeiraParcela = valorProporcional / 2;

      res.json({
        tipo: 'primeira_parcela',
        salario_bruto: dados.salario_bruto,
        meses_trabalhados: dados.meses_trabalhados,
        valor_proporcional: Math.round(valorProporcional * 100) / 100,
        valor_primeira_parcela: Math.round(valorPrimeiraParcela * 100) / 100,
        inss: 0,
        irrf: 0,
        valor_liquido: Math.round(valorPrimeiraParcela * 100) / 100
      });
    } else {
      // Segunda parcela: restante com descontos
      const valorPrimeiraParcela = valorProporcional / 2;
      const valorSegundaParcela = valorProporcional - valorPrimeiraParcela;

      // INSS sobre o valor total
      const { valor: inss } = calcularINSS(valorProporcional);

      // IRRF sobre o valor total menos INSS
      const baseIRRF = valorProporcional - inss - (dados.dependentes * DEDUCAO_DEPENDENTE);
      const { valor: irrf } = calcularIRRF(baseIRRF);

      const valorLiquido = valorSegundaParcela - inss - irrf;

      res.json({
        tipo: 'segunda_parcela',
        salario_bruto: dados.salario_bruto,
        meses_trabalhados: dados.meses_trabalhados,
        valor_proporcional: Math.round(valorProporcional * 100) / 100,
        primeira_parcela_paga: Math.round(valorPrimeiraParcela * 100) / 100,
        valor_bruto_segunda: Math.round(valorSegundaParcela * 100) / 100,
        inss: inss,
        irrf: irrf,
        total_descontos: Math.round((inss + irrf) * 100) / 100,
        valor_liquido: Math.round(valorLiquido * 100) / 100
      });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Erro ao calcular 13º:', error);
    res.status(500).json({ error: 'Erro ao calcular 13º salário' });
  }
}

// Calcular Férias
export async function calcularFerias(req: Request, res: Response) {
  try {
    const dados = feriasSchema.parse(req.body);

    const salarioDia = dados.salario_bruto / 30;
    const valorFerias = salarioDia * dados.dias_ferias;
    const tercoConstitucional = valorFerias / 3;

    let abonoPecuniario = 0;
    let tercoAbono = 0;
    if (dados.abono_pecuniario) {
      // Abono pecuniário: até 1/3 das férias pode ser vendido
      const diasAbono = Math.floor(dados.dias_ferias / 3);
      abonoPecuniario = salarioDia * diasAbono;
      tercoAbono = abonoPecuniario / 3;
    }

    const totalBruto = valorFerias + tercoConstitucional + abonoPecuniario + tercoAbono;

    // INSS sobre o valor das férias (abono pecuniário é isento)
    const baseINSS = valorFerias + tercoConstitucional;
    const { valor: inss } = calcularINSS(baseINSS);

    // IRRF
    const baseIRRF = baseINSS - inss - (dados.dependentes * DEDUCAO_DEPENDENTE);
    const { valor: irrf } = calcularIRRF(baseIRRF);

    const totalDescontos = inss + irrf;
    const valorLiquido = totalBruto - totalDescontos;

    res.json({
      salario_bruto: dados.salario_bruto,
      dias_ferias: dados.dias_ferias,
      valor_ferias: Math.round(valorFerias * 100) / 100,
      terco_constitucional: Math.round(tercoConstitucional * 100) / 100,
      abono_pecuniario: {
        vendido: dados.abono_pecuniario,
        valor: Math.round(abonoPecuniario * 100) / 100,
        terco: Math.round(tercoAbono * 100) / 100
      },
      total_bruto: Math.round(totalBruto * 100) / 100,
      inss: inss,
      irrf: irrf,
      total_descontos: Math.round(totalDescontos * 100) / 100,
      valor_liquido: Math.round(valorLiquido * 100) / 100
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Erro ao calcular férias:', error);
    res.status(500).json({ error: 'Erro ao calcular férias' });
  }
}
