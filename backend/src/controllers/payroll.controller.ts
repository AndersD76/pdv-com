import { Request, Response } from 'express';
import { z } from 'zod';
import { sendError, todayInAppTimezone, round2 } from '../utils/http.js';

// ATENÇÃO: os valores oficiais mudam todo ano. Ao virar o ano, confira com a contabilidade
// e acrescente a tabela nova em TABELAS.
interface FaixaINSS { teto: number; aliquota: number }
interface FaixaIRRF { teto: number; aliquota: number; deducao: number }
interface TabelaAnual {
  inss: FaixaINSS[];
  irrf: FaixaIRRF[];
  deducaoDependente: number;
  descontoSimplificado: number;
  // Redução do IRRF para rendas menores (Lei 15.270/2025, a partir de 2026)
  redutor?: { isencaoAte: number; reducaoMaxima: number; limite: number; constante: number; fator: number };
}

const FAIXAS_IRRF_2025: FaixaIRRF[] = [
  { teto: 2428.80, aliquota: 0, deducao: 0 },           // Isento
  { teto: 2826.65, aliquota: 0.075, deducao: 182.16 },  // 7,5%
  { teto: 3751.05, aliquota: 0.15, deducao: 394.16 },   // 15%
  { teto: 4664.68, aliquota: 0.225, deducao: 675.49 },  // 22,5%
  { teto: Infinity, aliquota: 0.275, deducao: 908.73 }  // 27,5%
];

const TABELAS: Record<number, TabelaAnual> = {
  // 2025: INSS com salário mínimo de R$ 1.518,00; IRRF vigente a partir de maio/2025
  2025: {
    inss: [
      { teto: 1518.00, aliquota: 0.075 },
      { teto: 2793.88, aliquota: 0.09 },
      { teto: 4190.83, aliquota: 0.12 },
      { teto: 8157.41, aliquota: 0.14 }
    ],
    irrf: FAIXAS_IRRF_2025,
    deducaoDependente: 189.59,
    descontoSimplificado: 607.20
  },
  // 2026: INSS com salário mínimo de R$ 1.621,00; mesma tabela de IRRF + redução da Lei 15.270/2025
  // (imposto zerado até R$ 5.000 e redução decrescente até R$ 7.350)
  2026: {
    inss: [
      { teto: 1621.00, aliquota: 0.075 },
      { teto: 2902.84, aliquota: 0.09 },
      { teto: 4354.27, aliquota: 0.12 },
      { teto: 8475.55, aliquota: 0.14 }
    ],
    irrf: FAIXAS_IRRF_2025,
    deducaoDependente: 189.59,
    descontoSimplificado: 607.20,
    redutor: { isencaoAte: 5000, reducaoMaxima: 312.89, limite: 7350, constante: 978.62, fator: 0.133145 }
  }
};

const ANOS_DISPONIVEIS = Object.keys(TABELAS).map(Number).sort((a, b) => a - b);

// Usa a tabela do ano pedido ou, se não houver, a mais recente anterior a ele
function tabelaDoAno(ano: number): { ano: number; tabela: TabelaAnual } {
  const escolhido = [...ANOS_DISPONIVEIS].reverse().find((a) => a <= ano) ?? ANOS_DISPONIVEIS[0];
  return { ano: escolhido, tabela: TABELAS[escolhido] };
}

function anoAtual(): number {
  return Number(todayInAppTimezone().slice(0, 4));
}

const anoSchema = z.number().int().min(2000).max(2100).optional();

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
  outros_proventos: z.number().min(0).default(0),
  // Simples Nacional: a contribuição patronal (CPP) já está no DAS (Anexos I, II e III)
  regime_tributario: z.enum(['simples', 'normal']).default('simples'),
  ano: anoSchema
});

// Schema para 13º salário
const decimoTerceiroSchema = z.object({
  salario_bruto: z.number().positive(),
  meses_trabalhados: z.number().int().min(1).max(12),
  parcela: z.enum(['primeira', 'segunda']),
  dependentes: z.number().int().min(0).default(0),
  ano: anoSchema
});

// Schema para férias (dias_ferias = dias de direito no período)
const feriasSchema = z.object({
  salario_bruto: z.number().positive(),
  dias_ferias: z.number().int().min(10).max(30).default(30),
  abono_pecuniario: z.boolean().default(false),
  dependentes: z.number().int().min(0).default(0),
  ano: anoSchema
});

// INSS progressivo, limitado ao teto da tabela
function calcularINSS(salarioBruto: number, tabela: TabelaAnual): { valor: number; aliquotaEfetiva: number } {
  let inss = 0;
  let baseAnterior = 0;

  for (const faixa of tabela.inss) {
    if (salarioBruto > baseAnterior) {
      const baseFaixa = Math.min(salarioBruto, faixa.teto) - baseAnterior;
      inss += baseFaixa * faixa.aliquota;
      baseAnterior = faixa.teto;
    }
  }

  const aliquotaEfetiva = salarioBruto > 0 ? (inss / salarioBruto) * 100 : 0;
  return { valor: round2(inss), aliquotaEfetiva: round2(aliquotaEfetiva) };
}

interface ResultadoIRRF {
  valor: number;
  aliquota: number;
  faixa: string;
  base_calculo: number;
  reducao: number;
  desconto_simplificado: boolean;
}

// IRRF: deduções legais (INSS + dependentes) ou desconto simplificado, o que for maior,
// e a redução para rendas menores quando a tabela do ano prevê
function calcularIRRF(
  rendimentoTributavel: number,
  inss: number,
  dependentes: number,
  tabela: TabelaAnual,
  permitirSimplificado: boolean
): ResultadoIRRF {
  const deducoesLegais = inss + dependentes * tabela.deducaoDependente;
  const usouSimplificado = permitirSimplificado && tabela.descontoSimplificado > deducoesLegais;
  const base = Math.max(0, rendimentoTributavel - (usouSimplificado ? tabela.descontoSimplificado : deducoesLegais));

  const faixa = tabela.irrf.find((f) => base <= f.teto) ?? tabela.irrf[tabela.irrf.length - 1];
  let imposto = Math.max(0, base * faixa.aliquota - faixa.deducao);

  let reducao = 0;
  if (tabela.redutor && imposto > 0) {
    const r = tabela.redutor;
    if (rendimentoTributavel <= r.isencaoAte) {
      reducao = Math.min(imposto, r.reducaoMaxima);
    } else if (rendimentoTributavel <= r.limite) {
      reducao = Math.min(imposto, Math.max(0, r.constante - r.fator * rendimentoTributavel));
    }
  }
  imposto -= reducao;

  let faixaNome = faixa.aliquota === 0 ? 'Isento' : `${String(faixa.aliquota * 100).replace('.', ',')}%`;
  if (faixa.aliquota > 0 && round2(imposto) === 0) faixaNome = 'Isento (redução da Lei 15.270)';

  return {
    valor: round2(imposto),
    aliquota: faixa.aliquota * 100,
    faixa: faixaNome,
    base_calculo: round2(base),
    reducao: round2(reducao),
    desconto_simplificado: usouSimplificado
  };
}

// Calcular folha de pagamento
export async function calcularFolha(req: Request, res: Response) {
  try {
    const dados = folhaSchema.parse(req.body);
    const { ano, tabela } = tabelaDoAno(dados.ano ?? anoAtual());

    // Cálculo de hora extra
    const valorHora = dados.salario_bruto / 220; // 220h mensais (CLT)
    const valorHoraExtra = dados.horas_extras * valorHora * (1 + dados.percentual_hora_extra / 100);

    // Cálculo de adicional noturno (20%)
    const valorAdicionalNoturno = dados.adicional_noturno * valorHora * 0.2;

    // Total de proventos
    const totalProventos = dados.salario_bruto + valorHoraExtra + valorAdicionalNoturno + dados.outros_proventos;

    // Cálculo do INSS
    const { valor: inss, aliquotaEfetiva: aliquotaINSS } = calcularINSS(totalProventos, tabela);

    // IRRF
    const irrf = calcularIRRF(totalProventos, inss, dados.dependentes, tabela, true);

    // Descontos adicionais
    const descontoVT = dados.salario_bruto * (dados.vale_transporte_perc / 100);
    const descontoVR = dados.vale_refeicao;

    // Total de descontos
    const totalDescontos = inss + irrf.valor + descontoVT + descontoVR + dados.outros_descontos;

    // Salário líquido
    const salarioLiquido = totalProventos - totalDescontos;

    // FGTS (8% - encargo do empregador)
    const fgts = totalProventos * 0.08;

    // INSS patronal: no Simples Nacional está incluído no DAS; nos demais regimes,
    // ~28% (20% patronal + RAT + terceiros, valor aproximado)
    const inssPatronal = dados.regime_tributario === 'simples' ? 0 : totalProventos * 0.28;

    res.json({
      ano_tabela: ano,

      // Proventos
      salario_bruto: dados.salario_bruto,
      horas_extras: {
        quantidade: dados.horas_extras,
        percentual: dados.percentual_hora_extra,
        valor: round2(valorHoraExtra)
      },
      adicional_noturno: {
        horas: dados.adicional_noturno,
        valor: round2(valorAdicionalNoturno)
      },
      outros_proventos: dados.outros_proventos,
      total_proventos: round2(totalProventos),

      // Descontos
      inss: {
        valor: inss,
        aliquota_efetiva: aliquotaINSS
      },
      irrf,
      vale_transporte: {
        percentual: dados.vale_transporte_perc,
        valor: round2(descontoVT)
      },
      vale_refeicao: descontoVR,
      outros_descontos: dados.outros_descontos,
      total_descontos: round2(totalDescontos),

      // Líquido
      salario_liquido: round2(salarioLiquido),

      // Encargos do empregador
      encargos: {
        fgts: round2(fgts),
        inss_patronal: round2(inssPatronal),
        total: round2(fgts + inssPatronal),
        regime_tributario: dados.regime_tributario,
        observacao: dados.regime_tributario === 'simples'
          ? 'Simples Nacional: contribuição patronal incluída no DAS'
          : 'INSS patronal aproximado (20% + RAT + terceiros)'
      }
    });
  } catch (error) {
    sendError(res, error, 'Erro ao calcular folha de pagamento');
  }
}

// Calcular 13º Salário
export async function calcularDecimoTerceiro(req: Request, res: Response) {
  try {
    const dados = decimoTerceiroSchema.parse(req.body);
    const { ano, tabela } = tabelaDoAno(dados.ano ?? anoAtual());

    const valorProporcional = (dados.salario_bruto / 12) * dados.meses_trabalhados;

    if (dados.parcela === 'primeira') {
      // Primeira parcela: 50% sem descontos
      const valorPrimeiraParcela = valorProporcional / 2;

      res.json({
        tipo: 'primeira_parcela',
        ano_tabela: ano,
        salario_bruto: dados.salario_bruto,
        meses_trabalhados: dados.meses_trabalhados,
        valor_proporcional: round2(valorProporcional),
        valor_primeira_parcela: round2(valorPrimeiraParcela),
        inss: 0,
        irrf: 0,
        valor_liquido: round2(valorPrimeiraParcela)
      });
    } else {
      // Segunda parcela: restante com descontos
      const valorPrimeiraParcela = valorProporcional / 2;
      const valorSegundaParcela = valorProporcional - valorPrimeiraParcela;

      // INSS sobre o valor total
      const { valor: inss } = calcularINSS(valorProporcional, tabela);

      // IRRF sobre o valor total (tributação exclusiva: só deduções legais)
      const { valor: irrf } = calcularIRRF(valorProporcional, inss, dados.dependentes, tabela, false);

      const valorLiquido = valorSegundaParcela - inss - irrf;

      res.json({
        tipo: 'segunda_parcela',
        ano_tabela: ano,
        salario_bruto: dados.salario_bruto,
        meses_trabalhados: dados.meses_trabalhados,
        valor_proporcional: round2(valorProporcional),
        primeira_parcela_paga: round2(valorPrimeiraParcela),
        valor_bruto_segunda: round2(valorSegundaParcela),
        inss: inss,
        irrf: irrf,
        total_descontos: round2(inss + irrf),
        valor_liquido: round2(valorLiquido)
      });
    }
  } catch (error) {
    sendError(res, error, 'Erro ao calcular 13º salário');
  }
}

// Calcular Férias
export async function calcularFerias(req: Request, res: Response) {
  try {
    const dados = feriasSchema.parse(req.body);
    const { ano, tabela } = tabelaDoAno(dados.ano ?? anoAtual());

    const salarioDia = dados.salario_bruto / 30;

    // Abono pecuniário: vende 1/3 dos dias de direito; o restante é gozado
    const diasAbono = dados.abono_pecuniario ? Math.floor(dados.dias_ferias / 3) : 0;
    const diasGozo = dados.dias_ferias - diasAbono;

    const valorFerias = salarioDia * diasGozo;
    const tercoConstitucional = valorFerias / 3;
    const abonoPecuniario = salarioDia * diasAbono;
    const tercoAbono = abonoPecuniario / 3;

    const totalBruto = valorFerias + tercoConstitucional + abonoPecuniario + tercoAbono;

    // INSS e IRRF sobre as férias gozadas + 1/3 (abono pecuniário e seu 1/3 são isentos)
    const baseINSS = valorFerias + tercoConstitucional;
    const { valor: inss } = calcularINSS(baseINSS, tabela);
    const { valor: irrf } = calcularIRRF(baseINSS, inss, dados.dependentes, tabela, true);

    const totalDescontos = inss + irrf;
    const valorLiquido = totalBruto - totalDescontos;

    res.json({
      ano_tabela: ano,
      salario_bruto: dados.salario_bruto,
      dias_ferias: dados.dias_ferias,
      dias_gozo: diasGozo,
      valor_ferias: round2(valorFerias),
      terco_constitucional: round2(tercoConstitucional),
      abono_pecuniario: {
        vendido: dados.abono_pecuniario,
        dias: diasAbono,
        valor: round2(abonoPecuniario),
        terco: round2(tercoAbono)
      },
      total_bruto: round2(totalBruto),
      inss: inss,
      irrf: irrf,
      total_descontos: round2(totalDescontos),
      valor_liquido: round2(valorLiquido)
    });
  } catch (error) {
    sendError(res, error, 'Erro ao calcular férias');
  }
}
