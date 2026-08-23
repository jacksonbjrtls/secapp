import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { safeToDate, formatDateBR, formatDateDDMMAAAA } from './utils';
import { formatSessionDisplayTitle } from '../pages/DDS';
import { CachedUserItem } from './usersCache';

// Sanitize string for jsPDF text rendering (converts accented characters to ASCII equivalents)
export const sanitizePdfText = (text: string | null | undefined): string => {
  if (!text) return '';
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x00-\x7F]/g, '');
};

// Safe logo loader with fallback
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
          // ignore canvas extraction error
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
const addSecAppFooter = async (doc: jsPDF, logoBase64: string | null) => {
  const totalPages = (doc as any).internal.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    const footerY = pageHeight - 10;

    // Divider
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setLineWidth(0.3);
    doc.line(14, footerY - 3, pageWidth - 14, footerY - 3);

    let textStartX = 14;
    if (logoBase64) {
      try {
        doc.addImage(logoBase64, 'PNG', 14, footerY - 2, 8, 3.5);
        textStartX = 24;
      } catch {
        // fallback to text
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
    doc.text(' | Sistema de Gestao de Seguranca Operacional - Eldorado Brasil Celulose', textStartX + secAppWidth, footerY + 1);

    const pageText = `Pagina ${p} de ${totalPages}`;
    doc.text(pageText, pageWidth - 14, footerY + 1, { align: 'right' });
  }
};

export interface SingleDdsPdfOptions {
  includeBlankRowsForPending?: boolean;
  extraBlankRows?: number;
  includeDescription?: boolean;
  includeSignaturesBlock?: boolean;
  customNotes?: string;
}

/**
 * Generates and downloads the complete Attendance Sheet and Technical Dossier for a Single DDS Session
 */
export const exportSingleSessionDdsPdf = async (
  session: any,
  signatures: any[] = [],
  registeredUsers: CachedUserItem[] = [],
  options: SingleDdsPdfOptions = {}
) => {
  const {
    includeBlankRowsForPending = true,
    extraBlankRows = 0,
    includeDescription = true,
    includeSignaturesBlock = true,
    customNotes = ''
  } = options;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const logoEldorado = await getLogoBase64('/logo_file/Logo_Eldorado.png');
  const logoSecApp = await getLogoBase64('/logo_file/logo_400pixel.png');

  // Header Banner - Emerald Theme
  doc.setFillColor(5, 150, 105); // emerald-600
  doc.rect(0, 0, pageWidth, 28, 'F');

  // Header Top Accent Line
  doc.setFillColor(4, 120, 87); // emerald-700
  doc.rect(0, 0, pageWidth, 3, 'F');

  // Title Text in Header
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('LISTA DE PRESENCA - DIALOGO DIARIO DE SEGURANCA (DDS)', 14, 13);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(209, 250, 229); // emerald-100
  doc.text('ELDORADO BRASIL CELULOSE | GESTAO DE SEGURANCA OPERACIONAL E MEIO AMBIENTE', 14, 19);
  doc.text(`Emissao: ${new Date().toLocaleDateString('pt-BR')} as ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`, 14, 24);

  // Logo in header if available
  if (logoEldorado) {
    try {
      doc.addImage(logoEldorado, 'PNG', pageWidth - 38, 6, 26, 16);
    } catch {
      // ignore
    }
  }

  let curY = 33;

  // Session Key Data Card
  const totalPrevisto = Number(session.totalPrevisto) || 9;
  const totalAssinados = signatures.length;
  const adesaoPercent = Math.min(100, Math.round((totalAssinados / totalPrevisto) * 100));
  const sessionDateObj = safeToDate(session.createdAt || session.date) || new Date();
  const sessionDateFormatted = formatDateBR(sessionDateObj);

  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setLineWidth(0.3);
  doc.roundedRect(14, curY, pageWidth - 28, 38, 3, 3, 'FD');

  // Top info bar inside card
  doc.setFillColor(241, 245, 249); // slate-100
  doc.rect(14, curY, pageWidth - 28, 8, 'F');
  doc.line(14, curY + 8, pageWidth - 14, curY + 8);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text('DADOS GERAIS DA SESSAO DE DDS', 18, curY + 5.5);

  const displayTitle = formatSessionDisplayTitle(session);
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105); // slate-600
  doc.text('Tema / Titulo:', 18, curY + 14);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(5, 150, 105); // emerald-600
  doc.text(sanitizePdfText(displayTitle).substring(0, 75), 45, curY + 14);

  // Grid line 1: Data, Turno, Letra da Escala
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text('Data do DDS:', 18, curY + 20);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(sessionDateFormatted, 45, curY + 20);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text('Turno / Escala:', 85, curY + 20);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(`${sanitizePdfText(session.shift || 'Turno 1')} - Letra ${session.group || '-'}`, 112, curY + 20);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text('Previsto / Realizado:', 148, curY + 20);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(adesaoPercent >= 75 ? 5 : 220, adesaoPercent >= 75 ? 150 : 38, adesaoPercent >= 75 ? 105 : 38);
  doc.text(`${totalAssinados} de ${totalPrevisto} (${adesaoPercent}% adesao)`, 182, curY + 20, { align: 'right' });

  // Grid line 2: Responsável / Facilitador, Criador, Senha
  const executorName = session.executor || session.createdByName || session.creatorName || 'Nao informado';
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text('Facilitador / Lider:', 18, curY + 26);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(sanitizePdfText(executorName), 45, curY + 26);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text('Registrado por:', 85, curY + 26);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(sanitizePdfText(session.createdByName || session.creatorName || executorName), 112, curY + 26);

  if (session.passcode) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text('Senha Validacao:', 148, curY + 26);
    doc.setFont('courier', 'bold');
    doc.setTextColor(5, 150, 105);
    doc.text(session.passcode, 182, curY + 26, { align: 'right' });
  }

  // Grid line 3: Horário do Turno
  const shiftHours = session.shift === 'Turno 1' 
    ? '00h00 as 08h00' 
    : session.shift === 'Turno 2' 
      ? '08h00 as 16h00' 
      : '16h00 as 00h00';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`Janela Operacional: ${shiftHours} | Setor: Secagem e Enfardamento`, 18, curY + 33);

  curY += 42;

  // Description / Content Box (if exists and enabled)
  if (includeDescription && session.description && session.description.trim()) {
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);

    const splitDesc = doc.splitTextToSize(sanitizePdfText(session.description), pageWidth - 36);
    const descBoxHeight = Math.max(16, (splitDesc.length * 3.8) + 10);

    doc.roundedRect(14, curY, pageWidth - 28, descBoxHeight, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(5, 150, 105);
    doc.text('CONTEUDO E ORIENTACOES DE SEGURANCA ABORDADAS:', 18, curY + 5.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    doc.text(splitDesc, 18, curY + 10.5);

    curY += descBoxHeight + 4;
  }

  // Participants Table Preparation
  // Merge user cache metadata into signatures
  const userMapByEmail = new Map<string, CachedUserItem>();
  const userMapByName = new Map<string, CachedUserItem>();
  registeredUsers.forEach(u => {
    if (u.email) userMapByEmail.set(u.email.toLowerCase().trim(), u);
    if (u.displayName) userMapByName.set(u.displayName.toLowerCase().trim(), u);
  });

  const tableRows: any[] = [];

  signatures.forEach((sig, index) => {
    const rawName = sig.userName || 'Sem nome';
    const cleanName = sanitizePdfText(rawName);
    const matchedUser = userMapByName.get(rawName.toLowerCase().trim()) || (sig.userEmail ? userMapByEmail.get(sig.userEmail.toLowerCase().trim()) : null);

    const matricula = sig.registration || matchedUser?.registration || '-';
    const cargo = sig.cargoName || matchedUser?.cargoName || '-';
    const setor = sig.sectorName || matchedUser?.sectorName || 'Secagem / Enfardamento';
    const turnoLetra = `${sig.shift || session.shift || '-'} (${sig.group || session.group || '-'})`;
    
    let timeStr = 'Validado';
    const sigDate = safeToDate(sig.timestamp);
    if (sigDate) {
      timeStr = sigDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    let moodStr = '-';
    if (sig.mood === 'happy') moodStr = 'FELIZ';
    else if (sig.mood === 'neutral') moodStr = 'NEUTRO';
    else if (sig.mood === 'sad') moodStr = 'TRISTE';

    tableRows.push([
      String(index + 1),
      cleanName,
      matricula,
      sanitizePdfText(cargo),
      sanitizePdfText(setor),
      sanitizePdfText(turnoLetra),
      timeStr,
      moodStr,
      `VALIDADO DIGITALMENTE (${timeStr})`
    ]);
  });

  // If session is printed for field use / pending attendees, append blank lines
  const neededPendingRows = includeBlankRowsForPending ? Math.max(0, totalPrevisto - signatures.length) : 0;
  const totalBlankRowsToAdd = neededPendingRows + extraBlankRows;

  for (let i = 0; i < totalBlankRowsToAdd; i++) {
    const rowNum = signatures.length + i + 1;
    tableRows.push([
      String(rowNum),
      '_________________________________',
      '___________',
      '_________________',
      '_________________',
      `${sanitizePdfText(session.shift || 'Turno 1')} (${session.group || '-'})`,
      '____:____:____',
      '[  ] [  ] [  ]',
      'Assinatura: ________________________________'
    ]);
  }

  // Draw Participants Table
  autoTable(doc, {
    startY: curY,
    head: [[
      '#',
      'Colaborador / Participante',
      'Matricula',
      'Funcao / Cargo',
      'Setor',
      'Turno/Letra',
      'Horario',
      'Humor',
      'Assinatura / Validacao'
    ]],
    body: tableRows,
    theme: 'grid',
    headStyles: {
      fillColor: [15, 23, 42], // slate-900
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.5,
      halign: 'left',
      cellPadding: 2.2
    },
    bodyStyles: {
      fontSize: 7,
      textColor: [30, 41, 59],
      cellPadding: 2
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252]
    },
    columnStyles: {
      0: { cellWidth: 7, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 38, fontStyle: 'bold' },
      2: { cellWidth: 16, halign: 'center' },
      3: { cellWidth: 26 },
      4: { cellWidth: 22 },
      5: { cellWidth: 18, halign: 'center' },
      6: { cellWidth: 16, halign: 'center' },
      7: { cellWidth: 13, halign: 'center' },
      8: { cellWidth: 34, fontSize: 6.5, fontStyle: 'bold', textColor: [5, 150, 105] }
    },
    margin: { left: 14, right: 14 }
  });

  // Calculate final Y after table
  const finalY = (doc as any).lastAutoTable.finalY || curY + 60;

  // Check if we have space on current page for Signatures Block (needs ~35mm)
  if (includeSignaturesBlock) {
    let sigStartY = finalY + 6;
    if (sigStartY + 35 > pageHeight - 15) {
      doc.addPage();
      sigStartY = 20;
    }

    // Signatures and Regulatory Box
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.roundedRect(14, sigStartY, pageWidth - 28, 30, 2, 2, 'FD');

    // Legal / Regulatory note
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      'Documento comprobatório de participação e alinhamento de segurança operacional no Diálogo Diário de Segurança (DDS), conforme preceitos da NR-01 e Diretrizes de SSO da Eldorado Brasil.',
      18,
      sigStartY + 5.5,
      { maxWidth: pageWidth - 36 }
    );

    // Signature lines
    const lineY = sigStartY + 21;
    const colWidth = (pageWidth - 36) / 2;

    // Line 1: Leader / Presenter
    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.4);
    doc.line(22, lineY, 22 + colWidth - 8, lineY);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(30, 41, 59);
    doc.text(sanitizePdfText(executorName), 22 + (colWidth - 8) / 2, lineY + 4, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Facilitador / Responsável pela Aplicação do DDS', 22 + (colWidth - 8) / 2, lineY + 7, { align: 'center' });

    // Line 2: Safety Tech / Supervisor
    const rightColX = 22 + colWidth + 4;
    doc.line(rightColX, lineY, rightColX + colWidth - 8, lineY);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(30, 41, 59);
    doc.text('Lideranca de Area / Seguranca do Trabalho', rightColX + (colWidth - 8) / 2, lineY + 4, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Visto e Aprovacao Operacional', rightColX + (colWidth - 8) / 2, lineY + 7, { align: 'center' });
  }

  // Footer on all pages
  await addSecAppFooter(doc, logoSecApp);

  const cleanFileNameDate = sessionDateFormatted.replace(/\//g, '-');
  const safeShift = (session.shift || 'Turno1').replace(/\s+/g, '');
  const fileName = `DDS_${safeShift}_Letra${session.group || ''}_${cleanFileNameDate}.pdf`;
  doc.save(fileName);
};

export interface HistoryPdfFilterOptions {
  filterDate: string;
  filterShift: string;
  selectedLetter: string;
  participantSearch: string;
}

export interface HistoryPdfOptions {
  mode: 'summary' | 'detailed';
  includeKpiSummary?: boolean;
}

/**
 * Generates and downloads the Filtered DDS History Report (Executive Summary or Complete Multi-Session Dossier)
 */
export const exportDdsHistoryPdf = async (
  filteredSessions: any[],
  allSignaturesList: any[],
  registeredUsers: CachedUserItem[] = [],
  filters: HistoryPdfFilterOptions,
  options: HistoryPdfOptions = { mode: 'summary', includeKpiSummary: true }
) => {
  const { mode = 'summary', includeKpiSummary = true } = options;

  const doc = new jsPDF({ orientation: mode === 'summary' ? 'portrait' : 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const logoEldorado = await getLogoBase64('/logo_file/Logo_Eldorado.png');
  const logoSecApp = await getLogoBase64('/logo_file/logo_400pixel.png');

  // Header Banner - Emerald Theme
  doc.setFillColor(5, 150, 105); // emerald-600
  doc.rect(0, 0, pageWidth, 28, 'F');

  // Top accent line
  doc.setFillColor(4, 120, 87); // emerald-700
  doc.rect(0, 0, pageWidth, 3, 'F');

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(
    mode === 'summary'
      ? 'RELATORIO EXECUTIVO DE SESSOES DE DDS (HISTORICO)'
      : 'DOSSIE COMPLETO DE PARTICIPANTES E SESSOES DE DDS',
    14,
    13
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(209, 250, 229);
  doc.text('ELDORADO BRASIL CELULOSE | GESTAO DE SEGURANCA OPERACIONAL (SecAPP)', 14, 19);

  // Active filters summary line
  const filterDateLabel = filters.filterDate === 'all' ? 'Todas as Datas' : formatDateBR(filters.filterDate);
  const filterShiftLabel = filters.filterShift === 'all' ? 'Todos os Turnos' : filters.filterShift;
  const filterLetterLabel = filters.selectedLetter === 'all' ? 'Todas as Letras' : `Letra ${filters.selectedLetter}`;
  const searchLabel = filters.participantSearch ? ` | Busca: "${sanitizePdfText(filters.participantSearch)}"` : '';

  doc.text(
    `Filtros: ${filterDateLabel} | ${filterShiftLabel} | ${filterLetterLabel}${searchLabel}`,
    14,
    24
  );

  // Logo in header
  if (logoEldorado) {
    try {
      doc.addImage(logoEldorado, 'PNG', pageWidth - 38, 6, 26, 16);
    } catch {
      // ignore
    }
  }

  let curY = 32;

  // Map signatures by session
  const sigsBySessionMap: Record<string, any[]> = {};
  allSignaturesList.forEach((sig: any) => {
    if (sig.sessionId) {
      if (!sigsBySessionMap[sig.sessionId]) sigsBySessionMap[sig.sessionId] = [];
      sigsBySessionMap[sig.sessionId].push(sig);
    }
  });

  // Calculate High-level KPIs
  const totalSessions = filteredSessions.length;
  let totalSignaturesCount = 0;
  let totalPrevistoCount = 0;
  const shiftCountMap: Record<string, number> = { 'Turno 1': 0, 'Turno 2': 0, 'Turno 3': 0 };

  filteredSessions.forEach(s => {
    const sSigs = sigsBySessionMap[s.id] || [];
    totalSignaturesCount += sSigs.length;
    totalPrevistoCount += Number(s.totalPrevisto) || 9;
    if (s.shift && shiftCountMap[s.shift] !== undefined) {
      shiftCountMap[s.shift]++;
    }
  });

  const avgPerSession = totalSessions > 0 ? (totalSignaturesCount / totalSessions).toFixed(1) : '0';
  const globalAdesao = totalPrevistoCount > 0 ? Math.min(100, Math.round((totalSignaturesCount / totalPrevistoCount) * 100)) : 0;

  // KPI Summary Cards
  if (includeKpiSummary) {
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.roundedRect(14, curY, pageWidth - 28, 20, 2.5, 2.5, 'FD');

    const cardWidth = (pageWidth - 28) / 4;

    // KPI 1: Total Sessões
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text('TOTAL SESSOES', 14 + cardWidth * 0 + cardWidth / 2, curY + 6, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(String(totalSessions), 14 + cardWidth * 0 + cardWidth / 2, curY + 14, { align: 'center' });

    // KPI 2: Total Presenças
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text('TOTAL ASSINATURAS', 14 + cardWidth * 1 + cardWidth / 2, curY + 6, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(5, 150, 105);
    doc.text(String(totalSignaturesCount), 14 + cardWidth * 1 + cardWidth / 2, curY + 14, { align: 'center' });

    // KPI 3: Média Participantes
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text('MEDIA PRESENCAS / DDS', 14 + cardWidth * 2 + cardWidth / 2, curY + 6, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(`${avgPerSession} colab.`, 14 + cardWidth * 2 + cardWidth / 2, curY + 14, { align: 'center' });

    // KPI 4: Aderência Global
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text('TAXA GLOBAL ADESA0', 14 + cardWidth * 3 + cardWidth / 2, curY + 6, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(globalAdesao >= 75 ? 5 : 220, globalAdesao >= 75 ? 150 : 38, globalAdesao >= 75 ? 105 : 38);
    doc.text(`${globalAdesao}%`, 14 + cardWidth * 3 + cardWidth / 2, curY + 14, { align: 'center' });

    curY += 24;
  }

  // If Mode is SUMMARY:
  if (mode === 'summary') {
    const summaryRows = filteredSessions.map((session, idx) => {
      const sSigs = sigsBySessionMap[session.id] || [];
      const sPrevisto = Number(session.totalPrevisto) || 9;
      const sAdesao = Math.min(100, Math.round((sSigs.length / sPrevisto) * 100));
      const sDate = formatDateBR(session.createdAt || session.date);
      const titleClean = formatSessionDisplayTitle(session);
      const executor = session.executor || session.createdByName || session.creatorName || '-';

      let statusStr = 'Meta Atingida';
      if (sSigs.length === 0) statusStr = 'Sem Assinaturas';
      else if (sAdesao < 75) statusStr = 'Parcial';

      return [
        String(idx + 1),
        sDate,
        session.shift || 'Turno 1',
        session.group ? `Letra ${session.group}` : '-',
        sanitizePdfText(titleClean).substring(0, 45),
        sanitizePdfText(executor).substring(0, 24),
        `${sSigs.length} / ${sPrevisto}`,
        `${sAdesao}%`,
        statusStr
      ];
    });

    autoTable(doc, {
      startY: curY,
      head: [[
        '#',
        'Data',
        'Turno',
        'Escala',
        'Tema do DDS',
        'Facilitador',
        'Assinaturas',
        'Adesao',
        'Status'
      ]],
      body: summaryRows,
      theme: 'grid',
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7.5,
        cellPadding: 2.5
      },
      bodyStyles: {
        fontSize: 7,
        textColor: [30, 41, 59],
        cellPadding: 2
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      },
      columnStyles: {
        0: { cellWidth: 7, halign: 'center', fontStyle: 'bold' },
        1: { cellWidth: 16, halign: 'center' },
        2: { cellWidth: 16, halign: 'center' },
        3: { cellWidth: 14, halign: 'center' },
        4: { cellWidth: 50, fontStyle: 'bold' },
        5: { cellWidth: 32 },
        6: { cellWidth: 18, halign: 'center', fontStyle: 'bold' },
        7: { cellWidth: 13, halign: 'center' },
        8: { cellWidth: 16, halign: 'center', fontSize: 6.5, fontStyle: 'bold' }
      },
      margin: { left: 14, right: 14 }
    });
  } else {
    // Mode is DETAILED DOSSIER: Loop through each session and print details + participants table
    const userMapByName = new Map<string, CachedUserItem>();
    registeredUsers.forEach(u => {
      if (u.displayName) userMapByName.set(u.displayName.toLowerCase().trim(), u);
    });

    for (let sIdx = 0; sIdx < filteredSessions.length; sIdx++) {
      const session = filteredSessions[sIdx];
      const sSigs = sigsBySessionMap[session.id] || [];
      const sPrevisto = Number(session.totalPrevisto) || 9;
      const sAdesao = Math.min(100, Math.round((sSigs.length / sPrevisto) * 100));
      const sDate = formatDateBR(session.createdAt || session.date);
      const titleClean = formatSessionDisplayTitle(session);
      const executor = session.executor || session.createdByName || session.creatorName || 'Nao informado';

      // Check if we need a new page for next session
      if (curY > pageHeight - 50) {
        doc.addPage();
        curY = 20;
      }

      // Session Header Separator Box
      doc.setFillColor(241, 245, 249);
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.3);
      doc.roundedRect(14, curY, pageWidth - 28, 16, 2, 2, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text(`Sessao ${sIdx + 1}: ${sanitizePdfText(titleClean)}`, 18, curY + 6);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      doc.text(
        `Data: ${sDate} | ${session.shift || 'Turno 1'} (Letra ${session.group || '-'}) | Facilitador: ${sanitizePdfText(executor)} | ${sSigs.length} de ${sPrevisto} assinaturas (${sAdesao}%)`,
        18,
        curY + 11.5
      );

      curY += 18;

      if (sSigs.length === 0) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7);
        doc.setTextColor(148, 163, 184);
        doc.text('Nenhuma assinatura digital registrada para esta sessao.', 18, curY + 2);
        curY += 8;
      } else {
        const participantRows = sSigs.map((sig, pIdx) => {
          const rawName = sig.userName || 'Sem nome';
          const cleanName = sanitizePdfText(rawName);
          const matchedUser = userMapByName.get(rawName.toLowerCase().trim());
          const matricula = sig.registration || matchedUser?.registration || '-';
          const cargo = sig.cargoName || matchedUser?.cargoName || '-';
          const timeDate = safeToDate(sig.timestamp);
          const timeStr = timeDate ? timeDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-';

          return [
            String(pIdx + 1),
            cleanName,
            matricula,
            sanitizePdfText(cargo),
            timeStr,
            sig.mood === 'happy' ? 'FELIZ' : sig.mood === 'neutral' ? 'NEUTRO' : sig.mood === 'sad' ? 'TRISTE' : '-',
            `VALIDADO DIGITALMENTE (${timeStr})`
          ];
        });

        autoTable(doc, {
          startY: curY,
          head: [[
            '#',
            'Colaborador',
            'Matricula',
            'Cargo / Funcao',
            'Horario',
            'Humor',
            'Status'
          ]],
          body: participantRows,
          theme: 'grid',
          headStyles: {
            fillColor: [51, 65, 85],
            textColor: [255, 255, 255],
            fontSize: 7,
            cellPadding: 1.8
          },
          bodyStyles: {
            fontSize: 6.5,
            cellPadding: 1.6
          },
          alternateRowStyles: {
            fillColor: [248, 250, 252]
          },
          columnStyles: {
            0: { cellWidth: 7, halign: 'center' },
            1: { cellWidth: 45, fontStyle: 'bold' },
            2: { cellWidth: 18, halign: 'center' },
            3: { cellWidth: 35 },
            4: { cellWidth: 16, halign: 'center' },
            5: { cellWidth: 15, halign: 'center' },
            6: { cellWidth: 46, fontSize: 6, textColor: [5, 150, 105], fontStyle: 'bold' }
          },
          margin: { left: 14, right: 14 }
        });

        curY = (doc as any).lastAutoTable.finalY + 6;
      }
    }
  }

  // Add standardized footer
  await addSecAppFooter(doc, logoSecApp);

  const filterDateClean = filters.filterDate === 'all' ? 'Geral' : filters.filterDate;
  const fileName = `Relatorio_DDS_${mode === 'summary' ? 'Resumo' : 'Dossie'}_${filterDateClean}.pdf`;
  doc.save(fileName);
};
