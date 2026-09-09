import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { WireBatch, WireCoil } from '../types';
import { safeToDate, formatDateBR } from './utils';

// Helper to sanitize Portuguese characters for reliable jsPDF rendering
export const sanitizePdfText = (text: string | null | undefined): string => {
  if (!text) return '';
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x00-\x7F]/g, '');
};

// Safe image loader to Base64
const getLogoBase64 = async (path: string): Promise<string | null> => {
  try {
    return await new Promise<string | null>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/png'));
            return;
          }
        } catch {
          // ignore canvas extraction issues
        }
        resolve(null);
      };
      img.onerror = () => resolve(null);
      img.src = path;
    });
  } catch {
    return null;
  }
};

// Add standardized SecApp footer to all pages of a jsPDF document
const addSecAppFooter = async (doc: jsPDF, batchId: string, logoBase64: string | null) => {
  const totalPages = (doc as any).internal.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    const footerY = pageHeight - 10;

    // Subtle divider
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setLineWidth(0.3);
    doc.line(14, footerY - 3, pageWidth - 14, footerY - 3);

    let textStartX = 14;
    if (logoBase64) {
      try {
        doc.addImage(logoBase64, 'PNG', 14, footerY - 2, 8, 3.5);
        textStartX = 24;
      } catch {
        // fallback
      }
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(5, 150, 105); // emerald-600
    doc.text('SecAPP', textStartX, footerY + 1);

    const secAppWidth = doc.getTextWidth('SecAPP');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text(' | Controle de Arames e Suprimentos - Eldorado Brasil Celulose', textStartX + secAppWidth, footerY + 1);

    const pageText = `Lote: ${batchId.slice(0, 12)}... • Pagina ${p} de ${totalPages}`;
    doc.text(sanitizePdfText(pageText), pageWidth - 14, footerY + 1, { align: 'right' });
  }
};

export interface ExportWireBatchPdfOptions {
  customNotes?: string;
  supervisorName?: string;
}

/**
 * Generates and downloads an official, high-resolution PDF report of a received wire batch (Lote de Arames).
 */
export const exportWireBatchPdf = async (
  batch: WireBatch,
  coils: WireCoil[] = [],
  options: ExportWireBatchPdfOptions = {}
) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  const logoEldorado = await getLogoBase64('/logo_file/Logo_Eldorado.png');
  const logoSecApp = await getLogoBase64('/logo_file/logo_400pixel.png');

  // 1. Header Banner - Industrial Blue Theme
  doc.setFillColor(30, 64, 175); // blue-800
  doc.rect(0, 0, pageWidth, 28, 'F');

  // Top Accent Stripe
  doc.setFillColor(5, 150, 105); // emerald-600
  doc.rect(0, 0, pageWidth, 3, 'F');

  // Title Text
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(sanitizePdfText('COMPROVANTE DE RECEBIMENTO - LOTE DE ARAMES'), 14, 13);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(219, 234, 254); // blue-100
  doc.text(sanitizePdfText('ELDORADO BRASIL CELULOSE | GESTAO INDUSTRIAL & RASTREABILIDADE'), 14, 19);

  const now = new Date();
  const emissionStr = `Emissao do Relatorio: ${now.toLocaleDateString('pt-BR')} as ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  doc.text(sanitizePdfText(emissionStr), 14, 24);

  // Logos in header
  if (logoEldorado) {
    try {
      doc.addImage(logoEldorado, 'PNG', pageWidth - 46, 5, 32, 12);
    } catch {
      // ignore
    }
  } else if (logoSecApp) {
    try {
      doc.addImage(logoSecApp, 'PNG', pageWidth - 32, 5, 18, 18);
    } catch {
      // ignore
    }
  }

  let currentY = 34;

  // 2. Batch Identification Block (Metadata Table)
  const batchDateObj = safeToDate(batch.date);
  const formattedBatchDate = batchDateObj ? formatDateBR(batchDateObj) : (batch.date || '--');

  const createdDateObj = safeToDate(batch.createdAt);
  const formattedCreatedDate = createdDateObj 
    ? `${createdDateObj.toLocaleDateString('pt-BR')} ${createdDateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
    : '--';

  const metadataRows = [
    [
      sanitizePdfText('Numero da NF:'),
      sanitizePdfText(`#${batch.nfNumber || 'N/A'}`),
      sanitizePdfText('Protocolo do Lote:'),
      sanitizePdfText(batch.id || 'N/A')
    ],
    [
      sanitizePdfText('Fornecedor:'),
      sanitizePdfText(batch.supplierName || 'Nao especificado'),
      sanitizePdfText('Data do Carregamento:'),
      sanitizePdfText(formattedBatchDate)
    ],
    [
      sanitizePdfText('Local de Armazenagem:'),
      sanitizePdfText(batch.storageBayName || 'Almoxarifado Geral'),
      sanitizePdfText('Data/Hora Homologacao:'),
      sanitizePdfText(formattedCreatedDate)
    ],
    [
      sanitizePdfText('Responsavel Recebimento:'),
      sanitizePdfText(batch.responsibleName || options.supervisorName || 'Gestao de Arames'),
      sanitizePdfText('Status do Lote:'),
      sanitizePdfText('HOMOLOGADO / ATIVO')
    ]
  ];

  autoTable(doc, {
    startY: currentY,
    head: [],
    body: metadataRows,
    theme: 'plain',
    styles: { cellPadding: 2, fontSize: 8.5, textColor: [51, 65, 85] },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 42, textColor: [30, 41, 59] },
      1: { cellWidth: 55 },
      2: { fontStyle: 'bold', cellWidth: 42, textColor: [30, 41, 59] },
      3: { cellWidth: 43 }
    }
  });

  currentY = (doc as any).lastAutoTable.finalY + 4;

  // 3. KPI Highlights Cards
  const totalCoils = coils.length > 0 ? coils.length : (batch.coilsCount || 0);
  const totalWeightCalc = coils.length > 0
    ? coils.reduce((acc, c) => acc + (Number(c.weight) || 0), 0)
    : (Number(batch.totalWeight) || 0);
  const avgWeight = totalCoils > 0 ? (totalWeightCalc / totalCoils).toFixed(1) : '0';

  // Group by diameter
  const diameterMap: { [diam: string]: { count: number; weight: number } } = {};
  coils.forEach(c => {
    const dStr = c.diameter ? `${Number(c.diameter).toFixed(2)} mm` : 'Padrao';
    if (!diameterMap[dStr]) {
      diameterMap[dStr] = { count: 0, weight: 0 };
    }
    diameterMap[dStr].count += 1;
    diameterMap[dStr].weight += (Number(c.weight) || 0);
  });

  const cardWidth = (pageWidth - 28 - 9) / 4;
  const cardHeight = 16;

  const kpis = [
    { label: 'TOTAL DE BOBINAS', val: `${totalCoils} un`, bg: [239, 246, 255], border: [191, 219, 254], text: [29, 78, 216] },
    { label: 'MASSA TOTAL REAL', val: `${totalWeightCalc.toLocaleString('pt-BR')} kg`, bg: [236, 253, 245], border: [167, 243, 208], text: [4, 120, 87] },
    { label: 'PESO MEDIO / BOBINA', val: `${Number(avgWeight).toLocaleString('pt-BR')} kg`, bg: [248, 250, 252], border: [226, 232, 240], text: [51, 65, 85] },
    { label: 'FORNECEDOR', val: (batch.supplierName || 'Geral').slice(0, 16), bg: [254, 242, 242], border: [254, 202, 202], text: [185, 28, 28] }
  ];

  kpis.forEach((kpi, idx) => {
    const cardX = 14 + idx * (cardWidth + 3);
    doc.setFillColor(kpi.bg[0], kpi.bg[1], kpi.bg[2]);
    doc.setDrawColor(kpi.border[0], kpi.border[1], kpi.border[2]);
    doc.setLineWidth(0.3);
    doc.roundedRect(cardX, currentY, cardWidth, cardHeight, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(sanitizePdfText(kpi.label), cardX + 3, currentY + 5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(kpi.text[0], kpi.text[1], kpi.text[2]);
    doc.text(sanitizePdfText(kpi.val), cardX + 3, currentY + 12);
  });

  currentY += cardHeight + 5;

  // Notes Box if present
  const notesText = options.customNotes || (batch as any).notes;
  if (notesText && notesText.trim()) {
    doc.setFillColor(254, 249, 195); // amber-100
    doc.setDrawColor(253, 224, 71); // amber-300
    doc.roundedRect(14, currentY, pageWidth - 28, 12, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(133, 77, 14);
    doc.text(sanitizePdfText('OBSERVACOES / NOTAS DO RECEBIMENTO:'), 18, currentY + 4.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(113, 63, 18);
    const cleanNotes = sanitizePdfText(notesText.trim());
    doc.text(cleanNotes.slice(0, 160), 18, currentY + 9, { maxWidth: pageWidth - 36 });

    currentY += 15;
  }

  // 4. Diameters breakdown summary if coils exist and have multiple diameters
  const diameterKeys = Object.keys(diameterMap);
  if (diameterKeys.length > 0) {
    const diamHeaders = [
      sanitizePdfText('Bitola / Especificacao'),
      sanitizePdfText('Qtd. Bobinas'),
      sanitizePdfText('Peso Total (kg)'),
      sanitizePdfText('% do Lote')
    ];

    const diamBody = diameterKeys.map(k => {
      const item = diameterMap[k];
      const pct = totalWeightCalc > 0 ? ((item.weight / totalWeightCalc) * 100).toFixed(1) : '0';
      return [
        sanitizePdfText(k),
        `${item.count} un`,
        `${item.weight.toLocaleString('pt-BR')} kg`,
        `${pct}%`
      ];
    });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59);
    doc.text(sanitizePdfText('Resumo por Bitola / Diametro:'), 14, currentY + 2);

    autoTable(doc, {
      startY: currentY + 4,
      head: [diamHeaders],
      body: diamBody,
      theme: 'grid',
      headStyles: {
        fillColor: [71, 85, 105], // slate-600
        textColor: [255, 255, 255],
        fontSize: 7.5,
        fontStyle: 'bold'
      },
      styles: { fontSize: 7.5, cellPadding: 2 },
      columnStyles: {
        0: { cellWidth: 60, fontStyle: 'bold' },
        1: { cellWidth: 40 },
        2: { cellWidth: 45 },
        3: { cellWidth: 37 }
      }
    });

    currentY = (doc as any).lastAutoTable.finalY + 6;
  }

  // 5. Coils Detailed Table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(30, 64, 175); // blue-800
  doc.text(sanitizePdfText(`Detalhamento das Bobinas Registradas (${totalCoils} itens):`), 14, currentY + 2);

  const coilHeaders = [
    sanitizePdfText('#'),
    sanitizePdfText('Codigo / Numero da Bobina'),
    sanitizePdfText('Bitola'),
    sanitizePdfText('Peso Liq. (kg)'),
    sanitizePdfText('Status Atual'),
    sanitizePdfText('Baia / Localizacao')
  ];

  let coilBody: string[][] = [];

  if (coils.length > 0) {
    coilBody = coils.map((coil, idx) => {
      let statusStr = 'Em Estoque';
      if (coil.status === 'consumed') statusStr = 'Consumida';
      else if (coil.status === 'in_use') statusStr = 'Em Uso';
      if (coil.isDamaged) statusStr += ' (Avariada)';

      const diamStr = coil.diameter ? `${Number(coil.diameter).toFixed(2)} mm` : '--';
      const weightStr = coil.weight ? Number(coil.weight).toLocaleString('pt-BR') : '0';
      const bayStr = coil.storageBayName || batch.storageBayName || 'Almoxarifado';

      return [
        String(idx + 1),
        sanitizePdfText(coil.coilNumber || '--'),
        sanitizePdfText(diamStr),
        weightStr,
        sanitizePdfText(statusStr),
        sanitizePdfText(bayStr)
      ];
    });
  } else {
    coilBody = [
      ['1', sanitizePdfText(`Lote de ${batch.coilsCount} bobinas registrado (detalhes individuais consolidados)`), '--', Number(batch.totalWeight).toLocaleString('pt-BR'), 'Em Estoque', sanitizePdfText(batch.storageBayName || 'Almoxarifado')]
    ];
  }

  autoTable(doc, {
    startY: currentY + 4,
    head: [coilHeaders],
    body: coilBody,
    theme: 'striped',
    headStyles: {
      fillColor: [30, 64, 175], // blue-800
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: 'bold'
    },
    styles: {
      fontSize: 7.5,
      cellPadding: 2,
      overflow: 'linebreak'
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 65, fontStyle: 'bold' },
      2: { cellWidth: 25 },
      3: { cellWidth: 28, halign: 'right' },
      4: { cellWidth: 26 },
      5: { cellWidth: 28 }
    }
  });

  currentY = (doc as any).lastAutoTable.finalY + 10;

  // 6. Signature & Validation Block
  // Ensure we don't draw signatures on top of the page bottom
  const pageHeight = doc.internal.pageSize.getHeight();
  if (currentY + 30 > pageHeight - 16) {
    doc.addPage();
    currentY = 25;
  }

  const sigColWidth = (pageWidth - 28 - 14) / 2;

  // Signature 1: Receiver
  doc.setDrawColor(148, 163, 184); // slate-400
  doc.setLineWidth(0.4);
  doc.line(14, currentY + 12, 14 + sigColWidth, currentY + 12);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  doc.text(sanitizePdfText(batch.responsibleName || 'Responsavel pelo Recebimento'), 14, currentY + 16);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(sanitizePdfText('Conferente / Operador de Recebimento de Arames'), 14, currentY + 20);

  // Signature 2: Manager / Supervisor
  const sig2X = 14 + sigColWidth + 14;
  doc.line(sig2X, currentY + 12, sig2X + sigColWidth, currentY + 12);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  doc.text(sanitizePdfText(options.supervisorName || 'Gestor de Suprimentos & Materiais'), sig2X, currentY + 16);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(sanitizePdfText('Homologacao / Controle de Qualidade da Fabrica'), sig2X, currentY + 20);

  // 7. Add SecApp standardized footer across all pages
  await addSecAppFooter(doc, batch.id, logoSecApp);

  // 8. Save & Download PDF
  const safeNf = (batch.nfNumber || 'LOTE').replace(/[^a-zA-Z0-9]/g, '_');
  const safeDate = (batch.date || '').replace(/[^0-9]/g, '');
  const fileName = `Lote_Arames_NF_${safeNf}_${safeDate || now.getTime()}.pdf`;

  doc.save(fileName);
};
