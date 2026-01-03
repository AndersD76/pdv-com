import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Calculator, TrendingUp, Building2, Briefcase, Factory, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { simulatorsApi } from '../../services/api';
import { Button, Input } from '../../components/ui';
import type { TaxSimulationResult } from '../../types';

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

export default function SimuladorImpostos() {
  const [faturamentoMensal, setFaturamentoMensal] = useState('');
  const [tipoAtividade, setTipoAtividade] = useState<'comercio' | 'servicos' | 'industria'>('comercio');
  const [result, setResult] = useState<TaxSimulationResult | null>(null);

  const simular = useMutation({
    mutationFn: () => simulatorsApi.simularImpostos({
      faturamento_mensal: parseFloat(faturamentoMensal),
      tipo_atividade: tipoAtividade
    }),
    onSuccess: (data) => {
      setResult(data);
      toast.success('Simulacao realizada!');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const atividadeIcons = {
    comercio: Building2,
    servicos: Briefcase,
    industria: Factory
  };

  const atividadeLabels = {
    comercio: 'Comercio',
    servicos: 'Servicos',
    industria: 'Industria'
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Simulador de Impostos</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Formulario */}
        <div className="card p-6 space-y-6">
          <h3 className="font-semibold text-gray-900">Dados para Simulacao</h3>

          <Input
            label="Faturamento Mensal *"
            type="number"
            step="0.01"
            placeholder="Ex: 10000.00"
            value={faturamentoMensal}
            onChange={(e) => setFaturamentoMensal(e.target.value)}
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">Tipo de Atividade</label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(atividadeLabels) as Array<keyof typeof atividadeLabels>).map((tipo) => {
                const Icon = atividadeIcons[tipo];
                return (
                  <button
                    key={tipo}
                    type="button"
                    onClick={() => setTipoAtividade(tipo)}
                    className={`p-3 rounded-lg border-2 transition-colors text-center ${
                      tipoAtividade === tipo
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <Icon className="w-6 h-6 mx-auto mb-1" />
                    <span className="text-xs">{atividadeLabels[tipo]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <Button
            onClick={() => simular.mutate()}
            isLoading={simular.isPending}
            disabled={!faturamentoMensal}
            className="w-full"
          >
            <Calculator className="w-4 h-4 mr-2" /> Simular Impostos
          </Button>
        </div>

        {/* Resultados */}
        {result && (
          <>
            {/* MEI */}
            <div className={`card p-6 ${result.recomendacao === 'MEI' ? 'ring-2 ring-green-500' : ''}`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900">MEI</h3>
                {result.recomendacao === 'MEI' && (
                  <span className="flex items-center gap-1 text-green-600 text-sm font-medium">
                    <CheckCircle2 className="w-4 h-4" /> Recomendado
                  </span>
                )}
              </div>

              {result.mei.elegivel ? (
                <div className="space-y-4">
                  <div className="text-center py-4 bg-green-50 rounded-lg">
                    <p className="text-sm text-gray-600">Imposto Mensal</p>
                    <p className="text-3xl font-bold text-green-600">{formatCurrency(result.mei.imposto_mensal || 0)}</p>
                  </div>
                  <div className="text-sm text-gray-600">
                    <p>Limite mensal: {formatCurrency(result.mei.limite_mensal || 0)}</p>
                    <p className="text-green-600 font-medium mt-2">Voce esta elegivel para o MEI!</p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p>Faturamento acima do limite</p>
                  <p className="text-sm">Limite: {formatCurrency(result.mei.limite_mensal || 0)}/mes</p>
                </div>
              )}
            </div>

            {/* Simples Nacional */}
            <div className={`card p-6 ${result.recomendacao === 'Simples Nacional' ? 'ring-2 ring-green-500' : ''}`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900">Simples Nacional</h3>
                {result.recomendacao === 'Simples Nacional' && (
                  <span className="flex items-center gap-1 text-green-600 text-sm font-medium">
                    <CheckCircle2 className="w-4 h-4" /> Recomendado
                  </span>
                )}
              </div>

              {result.simples.elegivel ? (
                <div className="space-y-4">
                  <div className="text-center py-4 bg-blue-50 rounded-lg">
                    <p className="text-sm text-gray-600">Imposto Mensal</p>
                    <p className="text-3xl font-bold text-blue-600">{formatCurrency(result.simples.imposto_mensal || 0)}</p>
                  </div>
                  <div className="text-sm text-gray-600">
                    <p>Aliquota Efetiva: {result.simples.aliquota_efetiva}%</p>
                    <p className="mt-2">Impostos unificados em uma unica guia (DAS)</p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p>Faturamento acima do limite</p>
                  <p className="text-sm">Limite: R$ 4.800.000/ano</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Lucro Presumido */}
      {result && (
        <div className={`card p-6 ${result.recomendacao === 'Lucro Presumido' ? 'ring-2 ring-green-500' : ''}`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Lucro Presumido</h3>
            {result.recomendacao === 'Lucro Presumido' && (
              <span className="flex items-center gap-1 text-green-600 text-sm font-medium">
                <CheckCircle2 className="w-4 h-4" /> Recomendado
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="text-center py-4 bg-purple-50 rounded-lg">
              <p className="text-sm text-gray-600">Imposto Mensal Total</p>
              <p className="text-3xl font-bold text-purple-600">{formatCurrency(result.lucro_presumido.imposto_mensal)}</p>
            </div>

            <div className="space-y-2 text-sm">
              <h4 className="font-medium text-gray-700">Detalhamento:</h4>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex justify-between">
                  <span>Base Presumida:</span>
                  <span>{formatCurrency(result.lucro_presumido.detalhamento.base_presumida)}</span>
                </div>
                <div className="flex justify-between">
                  <span>IRPJ:</span>
                  <span>{formatCurrency(result.lucro_presumido.detalhamento.irpj)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Adicional IRPJ:</span>
                  <span>{formatCurrency(result.lucro_presumido.detalhamento.adicional_irpj)}</span>
                </div>
                <div className="flex justify-between">
                  <span>CSLL:</span>
                  <span>{formatCurrency(result.lucro_presumido.detalhamento.csll)}</span>
                </div>
                <div className="flex justify-between">
                  <span>PIS:</span>
                  <span>{formatCurrency(result.lucro_presumido.detalhamento.pis)}</span>
                </div>
                <div className="flex justify-between">
                  <span>COFINS:</span>
                  <span>{formatCurrency(result.lucro_presumido.detalhamento.cofins)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Comparativo */}
      {result && (
        <div className="card p-6">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5" /> Comparativo Anual
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Regime</th>
                  <th className="text-right py-2">Mensal</th>
                  <th className="text-right py-2">Anual</th>
                  <th className="text-right py-2">% Faturamento</th>
                </tr>
              </thead>
              <tbody>
                {result.mei.elegivel && (
                  <tr className={`border-b ${result.recomendacao === 'MEI' ? 'bg-green-50' : ''}`}>
                    <td className="py-2 font-medium">MEI</td>
                    <td className="text-right">{formatCurrency(result.mei.imposto_mensal || 0)}</td>
                    <td className="text-right">{formatCurrency((result.mei.imposto_mensal || 0) * 12)}</td>
                    <td className="text-right">{((result.mei.imposto_mensal || 0) / result.faturamento_mensal * 100).toFixed(2)}%</td>
                  </tr>
                )}
                {result.simples.elegivel && (
                  <tr className={`border-b ${result.recomendacao === 'Simples Nacional' ? 'bg-green-50' : ''}`}>
                    <td className="py-2 font-medium">Simples Nacional</td>
                    <td className="text-right">{formatCurrency(result.simples.imposto_mensal || 0)}</td>
                    <td className="text-right">{formatCurrency((result.simples.imposto_mensal || 0) * 12)}</td>
                    <td className="text-right">{result.simples.aliquota_efetiva}%</td>
                  </tr>
                )}
                <tr className={result.recomendacao === 'Lucro Presumido' ? 'bg-green-50' : ''}>
                  <td className="py-2 font-medium">Lucro Presumido</td>
                  <td className="text-right">{formatCurrency(result.lucro_presumido.imposto_mensal)}</td>
                  <td className="text-right">{formatCurrency(result.lucro_presumido.imposto_mensal * 12)}</td>
                  <td className="text-right">{(result.lucro_presumido.imposto_mensal / result.faturamento_mensal * 100).toFixed(2)}%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
