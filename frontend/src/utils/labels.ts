import { jsPDF } from 'jspdf';
import JsBarcode from 'jsbarcode';
import type { Product } from '../types';

// Etiqueta da Argox OS-214 plus: 60 x 30 mm, igual ao modelo do BarTender ("Etiqueta Brechó.btw").
// O conteúdo é girado 90° para ser lido com a etiqueta "em pé"; as posições abaixo são em mm
// na página deitada (x ao longo dos 60 mm, y ao longo dos 30 mm).
const LABEL_WIDTH = 60;
const LABEL_HEIGHT = 30;
const TEXT_CENTER_Y = 15;
const MAX_TEXT_LENGTH = 26;

const PT_TO_MM = 0.3528;
const CAP_HEIGHT = 0.72; // altura das maiúsculas em relação ao tamanho da fonte

// Linhas de texto: centro (eixo x) e fonte, de cima para baixo na etiqueta em pé
const LINES = {
  preco: { x: 5.6, size: 15, style: 'bold' },
  descricao: { x: 13.8, size: 11, style: 'normal' },
  cor: { x: 24.2, size: 10, style: 'normal' },
  marca: { x: 33.8, size: 8, style: 'normal' },
  tamanho: { x: 41.8, size: 13, style: 'normal' },
} as const;

// Código de barras: faixa das barras no eixo x e início (pé) no eixo y
const BARS_X = 46.8;
const BARS_HEIGHT = 7.8;
const BARS_START_Y = 26.4;
const DIGITS_X = 57.6;
const DIGITS_SIZE = 8;
// A Argox imprime a 203 dpi (8 pontos/mm): módulo de 0,25 mm = 2 pontos, barras nítidas
const EAN_MODULE = 0.25;
const MIN_MODULE = 0.125;

function ean13CheckDigit(data12: string): number {
  const sum = data12.split('').reduce((acc, digit, index) => acc + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10;
}

interface BarcodeData {
  bits: string;
  ean13: string | null; // 13 dígitos impressos sob as barras, quando EAN-13
}

// Códigos de 12 dígitos (ou 13 com verificador válido) saem em EAN-13, como no BarTender;
// os demais, em CODE128
function encodeBarcode(code: string): BarcodeData {
  const isEan = /^\d{12}$/.test(code) || (/^\d{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === Number(code[12]));
  const target: { encodings?: Array<{ data: string; text: string }> } = {};
  if (isEan) {
    JsBarcode(target, code.slice(0, 12), { format: 'EAN13', flat: true, displayValue: false });
    const bits = target.encodings!.map((e) => e.data).join('');
    return { bits, ean13: code.slice(0, 12) + ean13CheckDigit(code.slice(0, 12)) };
  }
  JsBarcode(target, code, { format: 'CODE128', displayValue: false });
  return { bits: target.encodings!.map((e) => e.data).join(''), ean13: null };
}

const formatPrice = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0).replace(/\s/g, ' ');

// Texto girado 90° (lido de baixo para cima), centralizado no eixo y, encolhendo a fonte se não couber
function rotatedText(doc: jsPDF, text: string, centerX: number, size: number, style: string, centerY = TEXT_CENTER_Y) {
  if (!text) return;
  let fontSize = size;
  doc.setFont('helvetica', style);
  doc.setFontSize(fontSize);
  while (doc.getTextWidth(text) > MAX_TEXT_LENGTH && fontSize > 6) {
    fontSize -= 0.5;
    doc.setFontSize(fontSize);
  }
  let value = text;
  while (doc.getTextWidth(value) > MAX_TEXT_LENGTH && value.length > 1) {
    value = value.slice(0, -1);
  }
  const width = doc.getTextWidth(value);
  const capHeight = fontSize * PT_TO_MM * CAP_HEIGHT;
  // Com rotação de 90°, as letras crescem para a esquerda da linha de base
  doc.text(value, centerX + capHeight / 2, centerY + width / 2, { angle: 90 });
}

function drawBarcode(doc: jsPDF, code: string) {
  const { bits, ean13 } = encodeBarcode(code);
  const available = BARS_START_Y - 2.4;
  let module = ean13 ? EAN_MODULE : Math.max(MIN_MODULE, Math.floor((available / bits.length) / MIN_MODULE) * MIN_MODULE);
  if (!ean13 && module * bits.length > available) module = available / bits.length;
  const length = bits.length * module;
  // EAN-13 começa no pé (deixando a zona livre para o 1º dígito); CODE128 fica centralizado
  const startY = ean13 ? BARS_START_Y : TEXT_CENTER_Y + length / 2;

  doc.setFillColor(0, 0, 0);
  let index = 0;
  while (index < bits.length) {
    if (bits[index] === '1') {
      let run = 1;
      while (bits[index + run] === '1') run++;
      doc.rect(BARS_X, startY - (index + run) * module, BARS_HEIGHT, run * module, 'F');
      index += run;
    } else {
      index++;
    }
  }

  // Números legíveis ao lado das barras
  if (ean13) {
    rotatedText(doc, ean13[0], DIGITS_X, DIGITS_SIZE, 'normal', startY + 1.5);
    rotatedText(doc, ean13.slice(1, 7), DIGITS_X, DIGITS_SIZE, 'normal', startY - 24 * module);
    rotatedText(doc, ean13.slice(7), DIGITS_X, DIGITS_SIZE, 'normal', startY - 71 * module);
  } else {
    rotatedText(doc, code, DIGITS_X, DIGITS_SIZE, 'normal', startY - length / 2);
  }
}

function drawLabel(doc: jsPDF, product: Product) {
  rotatedText(doc, formatPrice(product.valor_venda), LINES.preco.x, LINES.preco.size, LINES.preco.style);
  rotatedText(doc, (product.descricao || '').toUpperCase(), LINES.descricao.x, LINES.descricao.size, LINES.descricao.style);
  rotatedText(doc, (product.cor || '').toUpperCase(), LINES.cor.x, LINES.cor.size, LINES.cor.style);
  rotatedText(doc, (product.marca || '').toUpperCase(), LINES.marca.x, LINES.marca.size, LINES.marca.style);
  rotatedText(doc, (product.tamanho || '').toUpperCase(), LINES.tamanho.x, LINES.tamanho.size, LINES.tamanho.style);
  drawBarcode(doc, product.codigo_barras);
}

// Um PDF com uma página de 60 x 30 mm por etiqueta
export function generateLabelsPdf(products: Product[]): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [LABEL_HEIGHT, LABEL_WIDTH] });
  products.forEach((product, index) => {
    if (index > 0) doc.addPage([LABEL_HEIGHT, LABEL_WIDTH], 'landscape');
    drawLabel(doc, product);
  });
  return doc;
}

// Abre o PDF numa nova aba já com a janela de impressão
export function printLabels(products: Product[]) {
  const doc = generateLabelsPdf(products);
  doc.autoPrint();
  const url = doc.output('bloburl');
  window.open(String(url), '_blank');
}

export function downloadLabels(products: Product[], fileName: string) {
  generateLabelsPdf(products).save(fileName);
}
