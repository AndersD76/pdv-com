import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Printer, Tags, Settings } from 'lucide-react';
import JsBarcode from 'jsbarcode';
import { useReactToPrint } from 'react-to-print';
import { consignmentsApi, productsApi } from '../../services/api';
import { Button, Select, Input } from '../../components/ui';
import type { ConsignmentList, Product } from '../../types';

// Tamanhos de etiqueta comuns para Argox (em mm)
const LABEL_SIZES = [
  { value: '30x60', label: '30 x 60 mm (Vertical)', width: 30, height: 60 },
  { value: '40x70', label: '40 x 70 mm (Vertical)', width: 40, height: 70 },
  { value: '45x80', label: '45 x 80 mm (Vertical)', width: 45, height: 80 },
  { value: '50x90', label: '50 x 90 mm (Vertical)', width: 50, height: 90 },
  { value: '40x25', label: '40 x 25 mm', width: 40, height: 25 },
  { value: '50x30', label: '50 x 30 mm', width: 50, height: 30 },
  { value: '60x40', label: '60 x 40 mm', width: 60, height: 40 },
];

export default function Etiquetas() {
  const [searchParams] = useSearchParams();
  const listaParam = searchParams.get('lista');
  const [selectedLista, setSelectedLista] = useState(listaParam || '');
  const [labelSize, setLabelSize] = useState('30x60'); // Padrão: Argox OS-214 Plus
  const [showSettings, setShowSettings] = useState(false);
  const [columns, setColumns] = useState(1); // Padrão 1 coluna para etiquetas verticais
  const printRef = useRef<HTMLDivElement>(null);

  const selectedSize = LABEL_SIZES.find(s => s.value === labelSize) || LABEL_SIZES[2];

  const { data: lists } = useQuery({
    queryKey: ['consignments'],
    queryFn: () => consignmentsApi.getAll(),
  });

  const { data: labelsData, isLoading } = useQuery({
    queryKey: ['labels', selectedLista],
    queryFn: () => productsApi.getLabelsData(Number(selectedLista)),
    enabled: !!selectedLista,
  });

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Etiquetas_${labelsData?.list?.codigo || 'lista'}`,
    pageStyle: `
      @page {
        size: ${selectedSize.width * columns + 2}mm ${selectedSize.height + 2}mm;
        margin: 0;
      }
      @media print {
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          width: ${selectedSize.width * columns}mm !important;
        }
        .label-container {
          display: flex !important;
          flex-wrap: wrap !important;
          gap: 0 !important;
        }
        .label-card {
          width: ${selectedSize.width}mm !important;
          height: ${selectedSize.height}mm !important;
          page-break-inside: avoid !important;
          break-inside: avoid !important;
          box-sizing: border-box !important;
          border: none !important;
          margin: 0 !important;
          padding: 1mm !important;
        }
        .no-print {
          display: none !important;
        }
      }
    `,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Tags className="w-8 h-8 text-primary-600" />
          <h1 className="text-2xl font-bold text-gray-900">Etiquetas</h1>
        </div>
        <Button variant="ghost" onClick={() => setShowSettings(!showSettings)}>
          <Settings className="w-4 h-4 mr-2" />
          Configurar
        </Button>
      </div>

      {/* Configurações */}
      {showSettings && (
        <div className="card p-4 bg-yellow-50 border-yellow-200">
          <h3 className="font-semibold text-gray-900 mb-3">Configurações de Impressão (Argox)</h3>
          <div className="grid grid-cols-3 gap-4">
            <Select
              label="Tamanho da Etiqueta"
              options={LABEL_SIZES.map(s => ({ value: s.value, label: s.label }))}
              value={labelSize}
              onChange={(e) => setLabelSize(e.target.value)}
            />
            <Select
              label="Etiquetas por Linha"
              options={[
                { value: 1, label: '1 coluna' },
                { value: 2, label: '2 colunas' },
                { value: 3, label: '3 colunas' },
              ]}
              value={columns}
              onChange={(e) => setColumns(Number(e.target.value))}
            />
            <div className="flex items-end">
              <p className="text-sm text-gray-600">
                Dimensões: <strong>{selectedSize.width}mm x {selectedSize.height}mm</strong>
              </p>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-3">
            Configure de acordo com as etiquetas carregadas na sua impressora Argox.
            Após imprimir, ajuste as configurações da impressora para o tamanho correto se necessário.
          </p>
        </div>
      )}

      <div className="card p-4">
        <div className="flex items-end gap-4">
          <div className="flex-1 max-w-md">
            <Select
              label="Selecione a Lista"
              options={[
                { value: '', label: 'Selecione uma lista...' },
                ...(lists?.map((l: ConsignmentList) => ({
                  value: l.id,
                  label: `${l.codigo} - ${l.fornecedor_nome}`,
                })) || []),
              ]}
              value={selectedLista}
              onChange={(e) => setSelectedLista(e.target.value)}
            />
          </div>
          {labelsData?.products && labelsData.products.length > 0 && (
            <Button onClick={() => handlePrint()}>
              <Printer className="w-4 h-4 mr-2" />
              Imprimir Etiquetas
            </Button>
          )}
        </div>
      </div>

      {isLoading && selectedLista && (
        <div className="text-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto"></div>
          <p className="mt-2 text-gray-600">Carregando etiquetas...</p>
        </div>
      )}

      {labelsData?.products && labelsData.products.length > 0 && (
        <>
          <div className="card p-4">
            <p className="text-sm text-gray-600">
              <strong>{labelsData.products.length}</strong> etiquetas para impressão
              ({labelSize}, {columns} por linha)
            </p>
          </div>

          {/* Preview das etiquetas */}
          <div className="card p-6 bg-gray-100">
            <h2 className="font-semibold text-gray-700 mb-4">Preview das Etiquetas</h2>
            <div
              ref={printRef}
              className="label-container flex flex-wrap gap-4"
            >
              {labelsData.products.map((product: Product) => (
                <LabelCard
                  key={product.id}
                  product={product}
                  width={selectedSize.width}
                  height={selectedSize.height}
                />
              ))}
            </div>
          </div>
        </>
      )}

      {selectedLista && !isLoading && (!labelsData?.products || labelsData.products.length === 0) && (
        <div className="card p-8 text-center text-gray-500">
          Nenhum produto encontrado nesta lista.
        </div>
      )}
    </div>
  );
}

interface LabelCardProps {
  product: Product;
  width: number;
  height: number;
}

function LabelCard({ product, width, height }: LabelCardProps) {
  const barcodeRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (barcodeRef.current) {
      JsBarcode(barcodeRef.current, product.codigo_barras, {
        format: 'CODE128',
        width: 1.2,
        height: 30,
        displayValue: true,
        fontSize: 9,
        margin: 0,
        textMargin: 1,
      });
    }
  }, [product.codigo_barras]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);

  return (
    <div
      className="label-card bg-white border border-gray-300 rounded-xl text-center flex flex-col overflow-hidden"
      style={{
        width: `${width}mm`,
        height: `${height}mm`,
        padding: '1.5mm',
        fontFamily: 'Arial, sans-serif',
      }}
    >
      {/* Preço em destaque */}
      <p className="text-sm font-bold mb-1">
        {formatCurrency(product.valor_venda)}
      </p>

      {/* Descrição do produto */}
      <p className="text-[8px] font-semibold uppercase truncate">
        {product.descricao}
      </p>

      {/* Informações do produto */}
      <div className="flex-1 flex flex-col justify-center text-[7px] leading-relaxed">
        {product.cor && (
          <p className="font-medium uppercase">{product.cor}</p>
        )}
        {product.fornecedor_nome && (
          <p className="uppercase">{product.fornecedor_nome}</p>
        )}
        {product.marca && (
          <p className="font-medium uppercase">{product.marca}</p>
        )}
      </div>

      {/* Tamanho */}
      <p className="text-[10px] font-bold uppercase mb-1">
        {product.tamanho || '-'}
      </p>

      {/* Código de barras */}
      <svg ref={barcodeRef} className="mx-auto" style={{ maxWidth: '100%' }} />
    </div>
  );
}
