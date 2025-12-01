import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ConsignmentList, Product } from '../types';

const conditionLabels: Record<string, string> = {
  NOVA: 'Nova',
  SEMI_NOVA: 'Semi Nova',
  USADA: 'Usada',
};

export function generateConsignmentPDF(list: ConsignmentList, products: Product[]) {
  const doc = new jsPDF();

  const formatDate = (date: string) => new Date(date).toLocaleDateString('pt-BR');
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

  // Cabeçalho
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('Apega Desapega Brechó', 105, 20, { align: 'center' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Rua Uruguai, 701 - Sala 01 - Passo Fundo - RS', 105, 27, { align: 'center' });
  doc.text('(54) 9.9609.6202 - Amanda Maier', 105, 32, { align: 'center' });

  // Linha divisória
  doc.setLineWidth(0.5);
  doc.line(14, 36, 196, 36);

  // Título
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('LISTA DE PRODUTOS CONSIGNADOS', 105, 45, { align: 'center' });

  // Código da lista
  doc.setFontSize(12);
  doc.text(`Lista: ${list.codigo}`, 14, 55);

  // Informações do fornecedor
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');

  const infoY = 65;
  doc.text(`Fornecedor: ${list.fornecedor_nome || ''}`, 14, infoY);
  doc.text(`CPF: ${list.fornecedor_cpf || '___________________'}`, 120, infoY);

  doc.text(`Telefone: ${list.fornecedor_telefone || '___________________'}`, 14, infoY + 7);
  doc.text(`E-mail: ${list.fornecedor_email || '___________________'}`, 120, infoY + 7);

  doc.text(`Data Recebimento: ${formatDate(list.data_recebimento)}`, 14, infoY + 14);
  doc.text(`Prazo Retirada: ${formatDate(list.prazo_retirada)}`, 120, infoY + 14);

  // Tabela de produtos
  const tableData = products.map((p, index) => [
    index + 1,
    p.descricao,
    p.cor || '',
    p.marca || '',
    p.tamanho || '',
    conditionLabels[p.condicao] || p.condicao,
    formatCurrency(Number(p.valor_compra) || 0),
    formatCurrency(Number(p.valor_venda) || 0),
  ]);

  autoTable(doc, {
    startY: infoY + 22,
    head: [['#', 'Descrição', 'Cor', 'Marca', 'Tam.', 'Condição', 'V. Compra', 'V. Venda']],
    body: tableData,
    headStyles: {
      fillColor: [124, 58, 237],
      textColor: 255,
      fontSize: 8,
      fontStyle: 'bold',
    },
    bodyStyles: {
      fontSize: 8,
    },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 40 },
      2: { cellWidth: 25 },
      3: { cellWidth: 25 },
      4: { cellWidth: 15 },
      5: { cellWidth: 20 },
      6: { cellWidth: 22 },
      7: { cellWidth: 22 },
    },
    alternateRowStyles: {
      fillColor: [245, 245, 245],
    },
  });

  // Totais
  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  const totalCompra = products.reduce((sum, p) => sum + (Number(p.valor_compra) || 0), 0);
  const totalVenda = products.reduce((sum, p) => sum + (Number(p.valor_venda) || 0), 0);

  doc.setFont('helvetica', 'bold');
  doc.text(`Total de Peças: ${products.length}`, 14, finalY);
  doc.text(`Valor Total de Compra: ${formatCurrency(totalCompra)}`, 14, finalY + 7);
  doc.text(`Valor Total de Venda: ${formatCurrency(totalVenda)}`, 14, finalY + 14);

  // Termos
  const termsY = finalY + 30;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('TERMOS E CONDIÇÕES:', 14, termsY);
  doc.setFontSize(8);
  const terms = [
    '1. Os produtos acima descritos foram entregues em consignação.',
    '2. O prazo para retirada é de 30 dias a partir da data de recebimento.',
    '3. Os produtos vendidos serão pagos conforme o valor de compra acordado.',
    '4. Produtos não vendidos poderão ser retirados após o prazo ou renovados.',
    '5. A loja não se responsabiliza por produtos não retirados após o prazo.',
  ];
  terms.forEach((term, i) => {
    doc.text(term, 14, termsY + 6 + (i * 5));
  });

  // Assinaturas
  const signY = termsY + 45;
  doc.line(14, signY, 90, signY);
  doc.line(120, signY, 196, signY);

  doc.setFontSize(9);
  doc.text('Assinatura do Fornecedor', 52, signY + 5, { align: 'center' });
  doc.text('Assinatura da Loja', 158, signY + 5, { align: 'center' });

  // Data
  doc.text(`Passo Fundo, ${formatDate(new Date().toISOString())}`, 105, signY + 15, { align: 'center' });

  // Salvar
  doc.save(`Lista_${list.codigo}_${list.fornecedor_nome?.replace(/\s/g, '_') || 'fornecedor'}.pdf`);
}
