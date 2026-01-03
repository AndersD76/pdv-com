import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Calculator, UserMinus, AlertTriangle, Users, LogOut, TrendingUp, TrendingDown, Shield } from 'lucide-react';
import toast from 'react-hot-toast';
import { simulatorsApi } from '../../services/api';
import { Button, Input } from '../../components/ui';
import type { TerminationResult } from '../../types';

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

export default function SimuladorRescisao() {
  const [form, setForm] = useState({
    salario_bruto: '',
    data_admissao: '',
    data_demissao: new Date().toISOString().split('T')[0],
    tipo_rescisao: 'sem_justa_causa' as 'sem_justa_causa' | 'com_justa_causa' | 'pedido_demissao' | 'acordo',
    saldo_fgts: '',
    aviso_previo_trabalhado: false,
    ferias_vencidas: false,
    meses_ferias_proporcionais: '0'
  });

  const [result, setResult] = useState<TerminationResult | null>(null);

  const simular = useMutation({
    mutationFn: () => simulatorsApi.simularRescisao({
      salario_bruto: parseFloat(form.salario_bruto),
      data_admissao: form.data_admissao,
      data_demissao: form.data_demissao,
      tipo_rescisao: form.tipo_rescisao,
      saldo_fgts: form.saldo_fgts ? parseFloat(form.saldo_fgts) : 0,
      aviso_previo_trabalhado: form.aviso_previo_trabalhado,
      ferias_vencidas: form.ferias_vencidas,
      meses_ferias_proporcionais: parseInt(form.meses_ferias_proporcionais)
    }),
    onSuccess: (data) => {
      setResult(data);
      toast.success('Simulacao realizada!');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const tiposRescisao = [
    { id: 'sem_justa_causa', label: 'Demissao sem Justa Causa', icon: UserMinus, color: 'blue' },
    { id: 'com_justa_causa', label: 'Demissao com Justa Causa', icon: AlertTriangle, color: 'red' },
    { id: 'pedido_demissao', label: 'Pedido de Demissao', icon: LogOut, color: 'orange' },
    { id: 'acordo', label: 'Acordo (CLT)', icon: Users, color: 'green' },
  ];

  const verbasLabels: Record<string, string> = {
    saldo_salario: 'Saldo de Salario',
    aviso_previo_indenizado: 'Aviso Previo Indenizado',
    aviso_previo_trabalhado: 'Aviso Previo Trabalhado',
    desconto_aviso_previo: 'Desconto Aviso Previo',
    ferias_vencidas: 'Ferias Vencidas',
    terco_ferias_vencidas: '1/3 Ferias Vencidas',
    ferias_proporcionais: 'Ferias Proporcionais',
    terco_ferias_proporcionais: '1/3 Ferias Proporcionais',
    decimo_terceiro_proporcional: '13o Proporcional',
    multa_fgts: 'Multa FGTS',
    saque_fgts: 'Saque FGTS'
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Simulador de Rescisao</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Formulario */}
        <div className="card p-6 space-y-6">
          <h3 className="font-semibold text-gray-900">Dados do Contrato</h3>

          <Input
            label="Salario Bruto *"
            type="number"
            step="0.01"
            value={form.salario_bruto}
            onChange={(e) => setForm({ ...form, salario_bruto: e.target.value })}
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Data de Admissao *"
              type="date"
              value={form.data_admissao}
              onChange={(e) => setForm({ ...form, data_admissao: e.target.value })}
            />
            <Input
              label="Data de Demissao *"
              type="date"
              value={form.data_demissao}
              onChange={(e) => setForm({ ...form, data_demissao: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">Tipo de Rescisao</label>
            <div className="grid grid-cols-2 gap-2">
              {tiposRescisao.map((tipo) => {
                const Icon = tipo.icon;
                return (
                  <button
                    key={tipo.id}
                    type="button"
                    onClick={() => setForm({ ...form, tipo_rescisao: tipo.id as typeof form.tipo_rescisao })}
                    className={`p-3 rounded-lg border-2 transition-colors text-left ${
                      form.tipo_rescisao === tipo.id
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <Icon className="w-5 h-5 mb-1" />
                    <span className="text-xs block">{tipo.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <Input
            label="Saldo FGTS (para calculo da multa)"
            type="number"
            step="0.01"
            value={form.saldo_fgts}
            onChange={(e) => setForm({ ...form, saldo_fgts: e.target.value })}
            placeholder="0.00"
          />

          <Input
            label="Meses de Ferias Proporcionais"
            type="number"
            min="0"
            max="12"
            value={form.meses_ferias_proporcionais}
            onChange={(e) => setForm({ ...form, meses_ferias_proporcionais: e.target.value })}
          />

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="aviso"
                checked={form.aviso_previo_trabalhado}
                onChange={(e) => setForm({ ...form, aviso_previo_trabalhado: e.target.checked })}
                className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
              />
              <label htmlFor="aviso" className="text-sm text-gray-700">Aviso previo sera trabalhado</label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="ferias"
                checked={form.ferias_vencidas}
                onChange={(e) => setForm({ ...form, ferias_vencidas: e.target.checked })}
                className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
              />
              <label htmlFor="ferias" className="text-sm text-gray-700">Possui ferias vencidas</label>
            </div>
          </div>

          <Button
            onClick={() => simular.mutate()}
            isLoading={simular.isPending}
            disabled={!form.salario_bruto || !form.data_admissao || !form.data_demissao}
            className="w-full"
          >
            <Calculator className="w-4 h-4 mr-2" /> Calcular Rescisao
          </Button>
        </div>

        {/* Resultado */}
        {result && (
          <div className="space-y-6">
            {/* Info do Contrato */}
            <div className="card p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Dados do Contrato</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Salario Base:</span>
                  <p className="font-medium">{formatCurrency(result.dados_contrato.salario_bruto)}</p>
                </div>
                <div>
                  <span className="text-gray-500">Tempo de Servico:</span>
                  <p className="font-medium">
                    {result.dados_contrato.tempo_servico.anos} anos, {result.dados_contrato.tempo_servico.meses} meses
                  </p>
                </div>
                <div>
                  <span className="text-gray-500">Admissao:</span>
                  <p className="font-medium">{new Date(result.dados_contrato.data_admissao).toLocaleDateString('pt-BR')}</p>
                </div>
                <div>
                  <span className="text-gray-500">Demissao:</span>
                  <p className="font-medium">{new Date(result.dados_contrato.data_demissao).toLocaleDateString('pt-BR')}</p>
                </div>
              </div>
            </div>

            {/* Verbas Rescisorias */}
            <div className="card p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Verbas Rescisorias</h3>
              <div className="space-y-2">
                {Object.entries(result.verbas_rescisorias).map(([key, value]) => {
                  if (value === 0 || key === 'multa_fgts' || key === 'saque_fgts') return null;
                  const isDesconto = key.includes('desconto');
                  return (
                    <div key={key} className={`flex justify-between text-sm py-1 ${isDesconto ? 'text-red-600' : ''}`}>
                      <span className="flex items-center gap-1">
                        {isDesconto ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3 text-green-600" />}
                        {verbasLabels[key] || key}
                      </span>
                      <span className="font-medium">
                        {isDesconto ? '-' : ''}{formatCurrency(value)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* FGTS */}
            <div className="card p-6">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Shield className="w-5 h-5" /> FGTS
              </h3>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Saldo</p>
                  <p className="font-bold">{formatCurrency(result.resumo.fgts.saldo)}</p>
                </div>
                <div className="bg-green-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Multa</p>
                  <p className="font-bold text-green-600">{formatCurrency(result.resumo.fgts.multa)}</p>
                </div>
                <div className="bg-primary-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Total Saque</p>
                  <p className="font-bold text-primary-600">{formatCurrency(result.resumo.fgts.saque_total)}</p>
                </div>
              </div>
            </div>

            {/* Resumo Final */}
            <div className="card p-6 bg-gradient-to-r from-primary-50 to-primary-100">
              <h3 className="font-semibold text-gray-900 mb-4">Resumo</h3>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-green-600 flex items-center gap-1">
                    <TrendingUp className="w-4 h-4" /> Total Proventos
                  </span>
                  <span className="font-bold text-green-600">{formatCurrency(result.resumo.total_proventos)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-red-600 flex items-center gap-1">
                    <TrendingDown className="w-4 h-4" /> Total Descontos
                  </span>
                  <span className="font-bold text-red-600">-{formatCurrency(result.resumo.total_descontos)}</span>
                </div>
                <div className="border-t pt-3">
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-semibold">Total da Rescisao</span>
                    <span className="text-2xl font-bold text-primary-600">{formatCurrency(result.resumo.total_rescisao)}</span>
                  </div>
                </div>
                {result.resumo.fgts.saque_total > 0 && (
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>+ Saque FGTS</span>
                    <span>{formatCurrency(result.resumo.fgts.saque_total)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center text-lg font-bold border-t pt-3">
                  <span>Total a Receber</span>
                  <span className="text-primary-600">
                    {formatCurrency(result.resumo.total_rescisao + result.resumo.fgts.saque_total)}
                  </span>
                </div>
              </div>

              {result.resumo.direito_seguro_desemprego && (
                <div className="mt-4 p-3 bg-green-100 rounded-lg text-green-700 text-sm flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  <span>O funcionario tem direito ao Seguro-Desemprego</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
