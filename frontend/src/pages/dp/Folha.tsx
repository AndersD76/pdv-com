import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Calculator, FileText, Gift, Palmtree, DollarSign, TrendingDown, TrendingUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { payrollApi, employeesApi } from '../../services/api';
import { Button, Input } from '../../components/ui';
import type { Employee, PayrollResult } from '../../types';

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

export default function Folha() {
  const [activeTab, setActiveTab] = useState<'mensal' | '13' | 'ferias'>('mensal');
  const [result, setResult] = useState<PayrollResult | null>(null);
  const [result13, setResult13] = useState<Record<string, unknown> | null>(null);
  const [resultFerias, setResultFerias] = useState<Record<string, unknown> | null>(null);

  // Formulario Folha Mensal
  const [formMensal, setFormMensal] = useState({
    funcionario_id: '',
    salario_bruto: '',
    dependentes: '0',
    horas_extras: '0',
    percentual_hora_extra: '50',
    adicional_noturno: '0',
    vale_transporte_perc: '6',
    vale_refeicao: '0',
    outros_descontos: '0',
    outros_proventos: '0'
  });

  // Formulario 13o Salario
  const [form13, setForm13] = useState({
    salario_bruto: '',
    meses_trabalhados: '12',
    parcela: 'primeira' as 'primeira' | 'segunda',
    dependentes: '0'
  });

  // Formulario Ferias
  const [formFerias, setFormFerias] = useState({
    salario_bruto: '',
    dias_ferias: '30',
    abono_pecuniario: false,
    dependentes: '0'
  });

  const { data: employees } = useQuery({
    queryKey: ['employees-active'],
    queryFn: () => employeesApi.getAll({ status: 'ativo' }),
  });

  const calcularMensal = useMutation({
    mutationFn: () => payrollApi.calcular({
      salario_bruto: parseFloat(formMensal.salario_bruto),
      dependentes: parseInt(formMensal.dependentes),
      horas_extras: parseFloat(formMensal.horas_extras),
      percentual_hora_extra: parseFloat(formMensal.percentual_hora_extra),
      adicional_noturno: parseFloat(formMensal.adicional_noturno),
      vale_transporte_perc: parseFloat(formMensal.vale_transporte_perc),
      vale_refeicao: parseFloat(formMensal.vale_refeicao),
      outros_descontos: parseFloat(formMensal.outros_descontos),
      outros_proventos: parseFloat(formMensal.outros_proventos)
    }),
    onSuccess: (data) => {
      setResult(data);
      toast.success('Folha calculada!');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const calcular13 = useMutation({
    mutationFn: () => payrollApi.calcularDecimoTerceiro({
      salario_bruto: parseFloat(form13.salario_bruto),
      meses_trabalhados: parseInt(form13.meses_trabalhados),
      parcela: form13.parcela,
      dependentes: parseInt(form13.dependentes)
    }),
    onSuccess: (data) => {
      setResult13(data);
      toast.success('13o calculado!');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const calcularFerias = useMutation({
    mutationFn: () => payrollApi.calcularFerias({
      salario_bruto: parseFloat(formFerias.salario_bruto),
      dias_ferias: parseInt(formFerias.dias_ferias),
      abono_pecuniario: formFerias.abono_pecuniario,
      dependentes: parseInt(formFerias.dependentes)
    }),
    onSuccess: (data) => {
      setResultFerias(data);
      toast.success('Ferias calculadas!');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const handleSelectEmployee = (id: string) => {
    const emp = employees?.find((e: Employee) => e.id === parseInt(id));
    if (emp) {
      setFormMensal({
        ...formMensal,
        funcionario_id: id,
        salario_bruto: String(emp.salario_base),
        dependentes: String(emp.dependentes)
      });
      setForm13({
        ...form13,
        salario_bruto: String(emp.salario_base),
        dependentes: String(emp.dependentes)
      });
      setFormFerias({
        ...formFerias,
        salario_bruto: String(emp.salario_base),
        dependentes: String(emp.dependentes)
      });
    }
  };

  const tabs = [
    { id: 'mensal', label: 'Folha Mensal', icon: FileText },
    { id: '13', label: '13o Salario', icon: Gift },
    { id: 'ferias', label: 'Ferias', icon: Palmtree },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Folha de Pagamento</h1>
      </div>

      {/* Seletor de Funcionario */}
      <div className="card p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Selecionar Funcionario (opcional)</label>
        <select
          value={formMensal.funcionario_id}
          onChange={(e) => handleSelectEmployee(e.target.value)}
          className="w-full md:w-96 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
        >
          <option value="">Calcular manualmente...</option>
          {employees?.map((emp: Employee) => (
            <option key={emp.id} value={emp.id}>{emp.nome} - {formatCurrency(emp.salario_base)}</option>
          ))}
        </select>
      </div>

      {/* Tabs */}
      <div className="card">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {/* Folha Mensal */}
          {activeTab === 'mensal' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-4">
                <h3 className="font-semibold text-gray-900">Dados para Calculo</h3>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Salario Bruto *"
                    type="number"
                    step="0.01"
                    value={formMensal.salario_bruto}
                    onChange={(e) => setFormMensal({ ...formMensal, salario_bruto: e.target.value })}
                  />
                  <Input
                    label="Dependentes"
                    type="number"
                    min="0"
                    value={formMensal.dependentes}
                    onChange={(e) => setFormMensal({ ...formMensal, dependentes: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Horas Extras"
                    type="number"
                    step="0.5"
                    value={formMensal.horas_extras}
                    onChange={(e) => setFormMensal({ ...formMensal, horas_extras: e.target.value })}
                  />
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">% Hora Extra</label>
                    <select
                      value={formMensal.percentual_hora_extra}
                      onChange={(e) => setFormMensal({ ...formMensal, percentual_hora_extra: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="50">50% (Dias Uteis)</option>
                      <option value="100">100% (Domingos/Feriados)</option>
                    </select>
                  </div>
                </div>
                <Input
                  label="Adicional Noturno (horas)"
                  type="number"
                  step="0.5"
                  value={formMensal.adicional_noturno}
                  onChange={(e) => setFormMensal({ ...formMensal, adicional_noturno: e.target.value })}
                />
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Vale Transporte (%)"
                    type="number"
                    min="0"
                    max="6"
                    value={formMensal.vale_transporte_perc}
                    onChange={(e) => setFormMensal({ ...formMensal, vale_transporte_perc: e.target.value })}
                  />
                  <Input
                    label="Vale Refeicao (R$)"
                    type="number"
                    step="0.01"
                    value={formMensal.vale_refeicao}
                    onChange={(e) => setFormMensal({ ...formMensal, vale_refeicao: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Outros Descontos (R$)"
                    type="number"
                    step="0.01"
                    value={formMensal.outros_descontos}
                    onChange={(e) => setFormMensal({ ...formMensal, outros_descontos: e.target.value })}
                  />
                  <Input
                    label="Outros Proventos (R$)"
                    type="number"
                    step="0.01"
                    value={formMensal.outros_proventos}
                    onChange={(e) => setFormMensal({ ...formMensal, outros_proventos: e.target.value })}
                  />
                </div>
                <Button
                  onClick={() => calcularMensal.mutate()}
                  isLoading={calcularMensal.isPending}
                  disabled={!formMensal.salario_bruto}
                  className="w-full"
                >
                  <Calculator className="w-4 h-4 mr-2" /> Calcular Folha
                </Button>
              </div>

              {/* Resultado */}
              {result && (
                <div className="bg-gray-50 rounded-lg p-6 space-y-4">
                  <h3 className="font-semibold text-gray-900 border-b pb-2">Resultado do Calculo</h3>

                  {/* Proventos */}
                  <div>
                    <h4 className="text-sm font-medium text-green-600 flex items-center gap-1 mb-2">
                      <TrendingUp className="w-4 h-4" /> Proventos
                    </h4>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span>Salario Base</span>
                        <span>{formatCurrency(result.salario_bruto)}</span>
                      </div>
                      {result.horas_extras.valor > 0 && (
                        <div className="flex justify-between">
                          <span>Horas Extras ({result.horas_extras.quantidade}h x {result.horas_extras.percentual}%)</span>
                          <span>{formatCurrency(result.horas_extras.valor)}</span>
                        </div>
                      )}
                      {result.adicional_noturno.valor > 0 && (
                        <div className="flex justify-between">
                          <span>Adicional Noturno</span>
                          <span>{formatCurrency(result.adicional_noturno.valor)}</span>
                        </div>
                      )}
                      {result.outros_proventos > 0 && (
                        <div className="flex justify-between">
                          <span>Outros Proventos</span>
                          <span>{formatCurrency(result.outros_proventos)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-semibold border-t pt-1">
                        <span>Total Proventos</span>
                        <span className="text-green-600">{formatCurrency(result.total_proventos)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Descontos */}
                  <div>
                    <h4 className="text-sm font-medium text-red-600 flex items-center gap-1 mb-2">
                      <TrendingDown className="w-4 h-4" /> Descontos
                    </h4>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span>INSS ({result.inss.aliquota_efetiva}%)</span>
                        <span>-{formatCurrency(result.inss.valor)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>IRRF ({result.irrf.faixa})</span>
                        <span>-{formatCurrency(result.irrf.valor)}</span>
                      </div>
                      {result.vale_transporte.valor > 0 && (
                        <div className="flex justify-between">
                          <span>Vale Transporte ({result.vale_transporte.percentual}%)</span>
                          <span>-{formatCurrency(result.vale_transporte.valor)}</span>
                        </div>
                      )}
                      {result.vale_refeicao > 0 && (
                        <div className="flex justify-between">
                          <span>Vale Refeicao</span>
                          <span>-{formatCurrency(result.vale_refeicao)}</span>
                        </div>
                      )}
                      {result.outros_descontos > 0 && (
                        <div className="flex justify-between">
                          <span>Outros Descontos</span>
                          <span>-{formatCurrency(result.outros_descontos)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-semibold border-t pt-1">
                        <span>Total Descontos</span>
                        <span className="text-red-600">-{formatCurrency(result.total_descontos)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Liquido */}
                  <div className="bg-primary-50 rounded-lg p-4">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-lg flex items-center gap-2">
                        <DollarSign className="w-5 h-5" /> Salario Liquido
                      </span>
                      <span className="text-2xl font-bold text-primary-600">{formatCurrency(result.salario_liquido)}</span>
                    </div>
                  </div>

                  {/* Encargos */}
                  <div className="text-xs text-gray-500 border-t pt-3">
                    <p className="font-medium mb-1">Encargos do Empregador:</p>
                    <p>FGTS (8%): {formatCurrency(result.encargos.fgts)} | INSS Patronal: {formatCurrency(result.encargos.inss_patronal)}</p>
                    <p className="font-medium">Custo Total: {formatCurrency(result.total_proventos + result.encargos.total)}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 13o Salario */}
          {activeTab === '13' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-4">
                <h3 className="font-semibold text-gray-900">Calculo do 13o Salario</h3>
                <Input
                  label="Salario Bruto *"
                  type="number"
                  step="0.01"
                  value={form13.salario_bruto}
                  onChange={(e) => setForm13({ ...form13, salario_bruto: e.target.value })}
                />
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Meses Trabalhados"
                    type="number"
                    min="1"
                    max="12"
                    value={form13.meses_trabalhados}
                    onChange={(e) => setForm13({ ...form13, meses_trabalhados: e.target.value })}
                  />
                  <Input
                    label="Dependentes"
                    type="number"
                    min="0"
                    value={form13.dependentes}
                    onChange={(e) => setForm13({ ...form13, dependentes: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Parcela</label>
                  <select
                    value={form13.parcela}
                    onChange={(e) => setForm13({ ...form13, parcela: e.target.value as 'primeira' | 'segunda' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="primeira">1a Parcela (ate Nov)</option>
                    <option value="segunda">2a Parcela (ate Dez)</option>
                  </select>
                </div>
                <Button
                  onClick={() => calcular13.mutate()}
                  isLoading={calcular13.isPending}
                  disabled={!form13.salario_bruto}
                  className="w-full"
                >
                  <Calculator className="w-4 h-4 mr-2" /> Calcular 13o
                </Button>
              </div>

              {result13 && (
                <div className="bg-gray-50 rounded-lg p-6 space-y-4">
                  <h3 className="font-semibold text-gray-900 border-b pb-2">
                    {result13.tipo === 'primeira_parcela' ? '1a Parcela do 13o' : '2a Parcela do 13o'}
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Salario Base</span>
                      <span>{formatCurrency(Number(result13.salario_bruto))}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Meses Trabalhados</span>
                      <span>{String(result13.meses_trabalhados)}/12</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Valor Proporcional</span>
                      <span>{formatCurrency(Number(result13.valor_proporcional))}</span>
                    </div>
                    {result13.tipo === 'segunda_parcela' && (
                      <>
                        <div className="flex justify-between text-gray-500">
                          <span>1a Parcela Paga</span>
                          <span>-{formatCurrency(Number(result13.primeira_parcela_paga))}</span>
                        </div>
                        <div className="flex justify-between text-red-600">
                          <span>INSS</span>
                          <span>-{formatCurrency(Number(result13.inss))}</span>
                        </div>
                        <div className="flex justify-between text-red-600">
                          <span>IRRF</span>
                          <span>-{formatCurrency(Number(result13.irrf))}</span>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="bg-primary-50 rounded-lg p-4">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold">Valor Liquido</span>
                      <span className="text-2xl font-bold text-primary-600">{formatCurrency(Number(result13.valor_liquido))}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Ferias */}
          {activeTab === 'ferias' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-4">
                <h3 className="font-semibold text-gray-900">Calculo de Ferias</h3>
                <Input
                  label="Salario Bruto *"
                  type="number"
                  step="0.01"
                  value={formFerias.salario_bruto}
                  onChange={(e) => setFormFerias({ ...formFerias, salario_bruto: e.target.value })}
                />
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Dias de Ferias"
                    type="number"
                    min="10"
                    max="30"
                    value={formFerias.dias_ferias}
                    onChange={(e) => setFormFerias({ ...formFerias, dias_ferias: e.target.value })}
                  />
                  <Input
                    label="Dependentes"
                    type="number"
                    min="0"
                    value={formFerias.dependentes}
                    onChange={(e) => setFormFerias({ ...formFerias, dependentes: e.target.value })}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="abono"
                    checked={formFerias.abono_pecuniario}
                    onChange={(e) => setFormFerias({ ...formFerias, abono_pecuniario: e.target.checked })}
                    className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                  />
                  <label htmlFor="abono" className="text-sm text-gray-700">Vender 1/3 das ferias (abono pecuniario)</label>
                </div>
                <Button
                  onClick={() => calcularFerias.mutate()}
                  isLoading={calcularFerias.isPending}
                  disabled={!formFerias.salario_bruto}
                  className="w-full"
                >
                  <Calculator className="w-4 h-4 mr-2" /> Calcular Ferias
                </Button>
              </div>

              {resultFerias && (
                <div className="bg-gray-50 rounded-lg p-6 space-y-4">
                  <h3 className="font-semibold text-gray-900 border-b pb-2">Calculo de Ferias</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Valor das Ferias ({String(resultFerias.dias_ferias)} dias)</span>
                      <span>{formatCurrency(Number(resultFerias.valor_ferias))}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>1/3 Constitucional</span>
                      <span>{formatCurrency(Number(resultFerias.terco_constitucional))}</span>
                    </div>
                    {Boolean((resultFerias.abono_pecuniario as Record<string, unknown>)?.vendido) && (
                      <>
                        <div className="flex justify-between text-green-600">
                          <span>Abono Pecuniario</span>
                          <span>+{formatCurrency(Number((resultFerias.abono_pecuniario as Record<string, unknown>).valor))}</span>
                        </div>
                        <div className="flex justify-between text-green-600">
                          <span>1/3 sobre Abono</span>
                          <span>+{formatCurrency(Number((resultFerias.abono_pecuniario as Record<string, unknown>).terco))}</span>
                        </div>
                      </>
                    )}
                    <div className="flex justify-between font-semibold border-t pt-1">
                      <span>Total Bruto</span>
                      <span>{formatCurrency(Number(resultFerias.total_bruto))}</span>
                    </div>
                    <div className="flex justify-between text-red-600">
                      <span>INSS</span>
                      <span>-{formatCurrency(Number(resultFerias.inss))}</span>
                    </div>
                    <div className="flex justify-between text-red-600">
                      <span>IRRF</span>
                      <span>-{formatCurrency(Number(resultFerias.irrf))}</span>
                    </div>
                  </div>
                  <div className="bg-primary-50 rounded-lg p-4">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold">Valor Liquido</span>
                      <span className="text-2xl font-bold text-primary-600">{formatCurrency(Number(resultFerias.valor_liquido))}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
