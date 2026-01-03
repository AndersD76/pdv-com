import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, LogIn, LogOut, Edit2, Trash2, Settings, Calendar } from 'lucide-react';
import toast from 'react-hot-toast';
import { timeclockApi, jornadaApi, employeesApi } from '../../services/api';
import {
  Button, Input, Modal, ModalFooter,
  Table, TableHead, TableBody, TableRow, TableHeader, TableCell, TableEmpty, TableLoading
} from '../../components/ui';
import type { TimeClockRecord, Employee, WorkSchedule } from '../../types';

export default function Ponto() {
  const queryClient = useQueryClient();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [dataInicio, setDataInicio] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date.toISOString().split('T')[0];
  });
  const [dataFim, setDataFim] = useState(() => new Date().toISOString().split('T')[0]);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showJornadaModal, setShowJornadaModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState<TimeClockRecord | null>(null);
  const [editForm, setEditForm] = useState({ data: '', hora: '', tipo: 'entrada', observacao: '' });
  const [jornadaForm, setJornadaForm] = useState<Partial<WorkSchedule>>({
    seg_sex_entrada: '08:00',
    seg_sex_saida: '18:00',
    intervalo_inicio: '12:00',
    intervalo_fim: '13:00',
    sabado_entrada: '',
    sabado_saida: '',
    carga_horaria_diaria: 8,
    tolerancia_minutos: 10
  });

  // Relogio em tempo real
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const { data: employees } = useQuery({
    queryKey: ['employees-active'],
    queryFn: () => employeesApi.getAll({ status: 'ativo' }),
  });

  const { data: records, isLoading } = useQuery({
    queryKey: ['timeclock', dataInicio, dataFim],
    queryFn: () => timeclockApi.getAll({ data_inicio: dataInicio, data_fim: dataFim }),
  });

  const { data: jornada } = useQuery({
    queryKey: ['jornada'],
    queryFn: () => jornadaApi.get(),
  });

  useEffect(() => {
    if (jornada) {
      setJornadaForm({
        seg_sex_entrada: jornada.seg_sex_entrada?.substring(0, 5) || '08:00',
        seg_sex_saida: jornada.seg_sex_saida?.substring(0, 5) || '18:00',
        intervalo_inicio: jornada.intervalo_inicio?.substring(0, 5) || '12:00',
        intervalo_fim: jornada.intervalo_fim?.substring(0, 5) || '13:00',
        sabado_entrada: jornada.sabado_entrada?.substring(0, 5) || '',
        sabado_saida: jornada.sabado_saida?.substring(0, 5) || '',
        carga_horaria_diaria: jornada.carga_horaria_diaria || 8,
        tolerancia_minutos: jornada.tolerancia_minutos || 10
      });
    }
  }, [jornada]);

  const registrarPonto = useMutation({
    mutationFn: (tipo: 'entrada' | 'saida') => {
      if (!selectedEmployee) throw new Error('Selecione um funcionario');
      const emp = employees?.find((e: Employee) => e.nome === selectedEmployee);
      return timeclockApi.registrar({
        funcionario_id: emp?.id,
        funcionario_nome: selectedEmployee,
        tipo
      });
    },
    onSuccess: (_, tipo) => {
      toast.success(`${tipo === 'entrada' ? 'Entrada' : 'Saida'} registrada!`);
      queryClient.invalidateQueries({ queryKey: ['timeclock'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateRecord = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { data: string; hora: string; tipo: string; observacao?: string } }) =>
      timeclockApi.update(id, data),
    onSuccess: () => {
      toast.success('Registro atualizado!');
      queryClient.invalidateQueries({ queryKey: ['timeclock'] });
      setShowEditModal(false);
      setEditingRecord(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteRecord = useMutation({
    mutationFn: timeclockApi.delete,
    onSuccess: () => {
      toast.success('Registro excluido!');
      queryClient.invalidateQueries({ queryKey: ['timeclock'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveJornada = useMutation({
    mutationFn: () => jornadaApi.save(jornadaForm),
    onSuccess: () => {
      toast.success('Jornada salva!');
      queryClient.invalidateQueries({ queryKey: ['jornada'] });
      setShowJornadaModal(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const openEdit = (record: TimeClockRecord) => {
    setEditingRecord(record);
    setEditForm({
      data: record.data.split('T')[0],
      hora: record.hora.substring(0, 5),
      tipo: record.tipo,
      observacao: record.observacao || ''
    });
    setShowEditModal(true);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingRecord) {
      updateRecord.mutate({ id: editingRecord.id, data: editForm });
    }
  };

  const formatDate = (date: string) => new Date(date).toLocaleDateString('pt-BR');
  const formatTime = (time: string) => time.substring(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Controle de Ponto</h1>
        <Button variant="secondary" onClick={() => setShowJornadaModal(true)}>
          <Settings className="w-4 h-4 mr-2" /> Configurar Jornada
        </Button>
      </div>

      {/* Relogio e Registro */}
      <div className="card p-6">
        <div className="flex flex-col md:flex-row items-center gap-8">
          {/* Relogio Digital */}
          <div className="text-center">
            <div className="flex items-center gap-2 text-gray-500 mb-2">
              <Clock className="w-5 h-5" />
              <span>Hora Atual</span>
            </div>
            <div className="text-5xl font-mono font-bold text-primary-600">
              {currentTime.toLocaleTimeString('pt-BR')}
            </div>
            <div className="text-lg text-gray-500 mt-2">
              {currentTime.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          </div>

          {/* Divisor */}
          <div className="hidden md:block w-px h-32 bg-gray-200"></div>

          {/* Seletor e Botoes */}
          <div className="flex-1 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Funcionario</label>
              <select
                value={selectedEmployee}
                onChange={(e) => setSelectedEmployee(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-lg"
              >
                <option value="">Selecione um funcionario...</option>
                {employees?.map((emp: Employee) => (
                  <option key={emp.id} value={emp.nome}>{emp.nome}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-4">
              <Button
                className="flex-1 py-4 text-lg"
                onClick={() => registrarPonto.mutate('entrada')}
                disabled={!selectedEmployee || registrarPonto.isPending}
              >
                <LogIn className="w-5 h-5 mr-2" /> Registrar Entrada
              </Button>
              <Button
                variant="secondary"
                className="flex-1 py-4 text-lg"
                onClick={() => registrarPonto.mutate('saida')}
                disabled={!selectedEmployee || registrarPonto.isPending}
              >
                <LogOut className="w-5 h-5 mr-2" /> Registrar Saida
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="card p-4">
        <div className="flex items-center gap-4">
          <Calendar className="w-5 h-5 text-gray-400" />
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="w-40"
            />
            <span className="text-gray-500">ate</span>
            <Input
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              className="w-40"
            />
          </div>
        </div>
      </div>

      {/* Tabela de Registros */}
      <div className="card">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Funcionario</TableHeader>
              <TableHeader>Data</TableHeader>
              <TableHeader>Hora</TableHeader>
              <TableHeader>Tipo</TableHeader>
              <TableHeader>Observacao</TableHeader>
              <TableHeader className="w-24">Acoes</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? <TableLoading cols={6} /> : records?.length === 0 ? (
              <TableEmpty />
            ) : (
              records?.map((record: TimeClockRecord) => (
                <TableRow key={record.id}>
                  <TableCell className="font-medium">{record.funcionario_nome}</TableCell>
                  <TableCell>{formatDate(record.data)}</TableCell>
                  <TableCell className="font-mono">{formatTime(record.hora)}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      record.tipo === 'entrada' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {record.tipo === 'entrada' ? 'Entrada' : 'Saida'}
                    </span>
                  </TableCell>
                  <TableCell className="text-gray-500">{record.observacao || '-'}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(record)}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => {
                        if (confirm('Excluir registro?')) deleteRecord.mutate(record.id);
                      }}>
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Modal Editar Registro */}
      <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="Editar Registro">
        <form onSubmit={handleEditSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Data"
              type="date"
              value={editForm.data}
              onChange={(e) => setEditForm({ ...editForm, data: e.target.value })}
            />
            <Input
              label="Hora"
              type="time"
              value={editForm.hora}
              onChange={(e) => setEditForm({ ...editForm, hora: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
            <select
              value={editForm.tipo}
              onChange={(e) => setEditForm({ ...editForm, tipo: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            >
              <option value="entrada">Entrada</option>
              <option value="saida">Saida</option>
            </select>
          </div>
          <Input
            label="Observacao"
            value={editForm.observacao}
            onChange={(e) => setEditForm({ ...editForm, observacao: e.target.value })}
          />
          <ModalFooter>
            <Button type="button" variant="secondary" onClick={() => setShowEditModal(false)}>Cancelar</Button>
            <Button type="submit" isLoading={updateRecord.isPending}>Salvar</Button>
          </ModalFooter>
        </form>
      </Modal>

      {/* Modal Configurar Jornada */}
      <Modal isOpen={showJornadaModal} onClose={() => setShowJornadaModal(false)} title="Configurar Jornada de Trabalho">
        <form onSubmit={(e) => { e.preventDefault(); saveJornada.mutate(); }} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Entrada (Seg-Sex)"
              type="time"
              value={jornadaForm.seg_sex_entrada || ''}
              onChange={(e) => setJornadaForm({ ...jornadaForm, seg_sex_entrada: e.target.value })}
            />
            <Input
              label="Saida (Seg-Sex)"
              type="time"
              value={jornadaForm.seg_sex_saida || ''}
              onChange={(e) => setJornadaForm({ ...jornadaForm, seg_sex_saida: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Inicio Intervalo"
              type="time"
              value={jornadaForm.intervalo_inicio || ''}
              onChange={(e) => setJornadaForm({ ...jornadaForm, intervalo_inicio: e.target.value })}
            />
            <Input
              label="Fim Intervalo"
              type="time"
              value={jornadaForm.intervalo_fim || ''}
              onChange={(e) => setJornadaForm({ ...jornadaForm, intervalo_fim: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Entrada Sabado (opcional)"
              type="time"
              value={jornadaForm.sabado_entrada || ''}
              onChange={(e) => setJornadaForm({ ...jornadaForm, sabado_entrada: e.target.value || null })}
            />
            <Input
              label="Saida Sabado (opcional)"
              type="time"
              value={jornadaForm.sabado_saida || ''}
              onChange={(e) => setJornadaForm({ ...jornadaForm, sabado_saida: e.target.value || null })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Carga Horaria Diaria (horas)"
              type="number"
              min="1"
              max="12"
              value={jornadaForm.carga_horaria_diaria || 8}
              onChange={(e) => setJornadaForm({ ...jornadaForm, carga_horaria_diaria: parseInt(e.target.value) })}
            />
            <Input
              label="Tolerancia (minutos)"
              type="number"
              min="0"
              max="30"
              value={jornadaForm.tolerancia_minutos || 10}
              onChange={(e) => setJornadaForm({ ...jornadaForm, tolerancia_minutos: parseInt(e.target.value) })}
            />
          </div>
          <ModalFooter>
            <Button type="button" variant="secondary" onClick={() => setShowJornadaModal(false)}>Cancelar</Button>
            <Button type="submit" isLoading={saveJornada.isPending}>Salvar</Button>
          </ModalFooter>
        </form>
      </Modal>
    </div>
  );
}
