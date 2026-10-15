import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Printer, Tags, Download, Info } from 'lucide-react';
import { consignmentsApi, productsApi } from '../../services/api';
import { Button, Input, Select, Table, TableHead, TableBody, TableRow, TableHeader, TableCell, TableEmpty, TableLoading } from '../../components/ui';
import { formatCurrency, formatDate, todayISO } from '../../utils/format';
import { generateLabelsPdf, printLabels, downloadLabels } from '../../utils/labels';
import type { ConsignmentList, Product } from '../../types';

// Etiquetas 60 x 30 mm para a Argox OS-214 plus (mesmo modelo do BarTender)
export default function Etiquetas() {
  const [searchParams] = useSearchParams();
  const [selectedLista, setSelectedLista] = useState(searchParams.get('lista') || '');
  const [desde, setDesde] = useState(todayISO());
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const { data: lists } = useQuery({
    queryKey: ['consignments'],
    queryFn: () => consignmentsApi.getAll(),
  });

  const { data: products, isLoading } = useQuery({
    queryKey: ['label-products', selectedLista, desde, search],
    queryFn: () => productsApi.getAll({
      lista_id: Number(selectedLista),
      status: 'DISPONIVEL',
      criado_desde: desde || undefined,
      search: search || undefined,
    }),
    enabled: Boolean(selectedLista),
  });

  // Ao trocar o filtro, todas as peças encontradas já vêm marcadas
  useEffect(() => {
    setSelected(new Set((products ?? []).map((p) => p.id)));
  }, [products]);

  const selectedProducts = useMemo(
    () => (products ?? []).filter((p) => selected.has(p.id)),
    [products, selected]
  );

  // Pré-visualização da primeira etiqueta marcada
  useEffect(() => {
    if (selectedProducts.length === 0) {
      setPreviewUrl(null);
      return;
    }
    const url = String(generateLabelsPdf(selectedProducts.slice(0, 1)).output('bloburl'));
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedProducts]);

  const toggle = (id: number) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = Boolean(products?.length) && selected.size === products!.length;
  const listCode = lists?.find((l: ConsignmentList) => String(l.id) === selectedLista)?.codigo || 'lista';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Tags className="w-8 h-8 text-primary-600" />
        <h1 className="text-2xl font-bold text-gray-900">Etiquetas</h1>
      </div>

      <div className="card p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <Select
            label="Lista"
            options={[
              { value: '', label: 'Selecione uma lista...' },
              ...(lists?.map((l: ConsignmentList) => ({ value: l.id, label: `${l.codigo} - ${l.fornecedor_nome}` })) || []),
            ]}
            value={selectedLista}
            onChange={(e) => setSelectedLista(e.target.value)}
          />
          <Input
            label="Cadastradas a partir de"
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
          />
          <Input
            label="Buscar (descrição ou código)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button variant="secondary" onClick={() => setDesde('')} disabled={!desde}>
            Todas as datas
          </Button>
        </div>
      </div>

      {selectedLista && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
          <div className="card">
            <div className="p-4 border-b flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-gray-600">
                {selected.size} de {products?.length ?? 0} peça(s) marcada(s)
                {products?.length === 500 && ' (mostrando as 500 mais recentes; refine o filtro)'}
              </p>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => downloadLabels(selectedProducts, `Etiquetas_${listCode}.pdf`)} disabled={selected.size === 0}>
                  <Download className="w-4 h-4 mr-2" /> Baixar PDF
                </Button>
                <Button onClick={() => printLabels(selectedProducts)} disabled={selected.size === 0}>
                  <Printer className="w-4 h-4 mr-2" /> Imprimir {selected.size > 0 ? `(${selected.size})` : ''}
                </Button>
              </div>
            </div>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader className="w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={() => setSelected(allSelected ? new Set() : new Set((products ?? []).map((p) => p.id)))}
                    />
                  </TableHeader>
                  <TableHeader>Código</TableHeader>
                  <TableHeader>Descrição</TableHeader>
                  <TableHeader>Tamanho</TableHeader>
                  <TableHeader className="text-right">Preço</TableHeader>
                  <TableHeader>Cadastro</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {isLoading ? <TableLoading cols={6} /> : !products || products.length === 0 ? (
                  <TableEmpty message={desde ? 'Nenhuma peça disponível cadastrada nesse período' : 'Nenhuma peça disponível'} />
                ) : (
                  products.map((product: Product) => (
                    <TableRow key={product.id} onClick={() => toggle(product.id)}>
                      <TableCell>
                        <input type="checkbox" checked={selected.has(product.id)} onChange={() => toggle(product.id)} onClick={(e) => e.stopPropagation()} />
                      </TableCell>
                      <TableCell className="font-mono text-sm">{product.codigo_barras}</TableCell>
                      <TableCell className="font-medium">{product.descricao}</TableCell>
                      <TableCell>{product.tamanho || '-'}</TableCell>
                      <TableCell className="text-right">{formatCurrency(product.valor_venda)}</TableCell>
                      <TableCell>{formatDate(product.created_at)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-4">
            <div className="card p-4">
              <h3 className="font-semibold text-gray-900 mb-3">Pré-visualização (60 x 30 mm)</h3>
              {previewUrl ? (
                <iframe title="Pré-visualização da etiqueta" src={`${previewUrl}#toolbar=0&view=Fit`} className="w-full h-48 rounded border" />
              ) : (
                <p className="text-sm text-gray-500">Marque uma peça para ver a etiqueta.</p>
              )}
            </div>

            <div className="card p-4 text-sm text-gray-700 space-y-2">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Info className="w-4 h-4" /> Na janela de impressão
              </h3>
              <ol className="list-decimal pl-5 space-y-1">
                <li>Impressora: <strong>Argox OS-214 plus</strong></li>
                <li>Tamanho do papel: <strong>60 x 30 mm</strong></li>
                <li>Escala: <strong>100% / Tamanho real</strong> (nunca "Ajustar")</li>
                <li>Margens: <strong>Nenhuma</strong></li>
              </ol>
              <p className="text-xs text-gray-500">
                Se o tamanho 60 x 30 mm não aparecer, configure-o uma vez nas Preferências de impressão da Argox no Windows.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
