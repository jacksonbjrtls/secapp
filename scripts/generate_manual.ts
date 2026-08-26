import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as fs from 'fs';
import * as path from 'path';

// Clean text for standard jsPDF encoding
const cleanText = (text: string | null | undefined): string => {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x00-\x7F]/g, '');
};

const generateManual = () => {
  console.log('Iniciando geracao do Manual Completo do Sistema SecApp...');

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297mm
  const emeraldColor: [number, number, number] = [5, 150, 105]; // #059669
  const darkSlateColor: [number, number, number] = [15, 23, 42]; // #0F172A
  const slate700: [number, number, number] = [51, 65, 85];
  const lightBg: [number, number, number] = [248, 250, 252]; // #F8FAFC

  // Read logo if exists
  let logoBase64: string | null = null;
  try {
    const logoPath = path.join(process.cwd(), 'public', 'logo_file', 'logo_400pixel.png');
    if (fs.existsSync(logoPath)) {
      const logoBuffer = fs.readFileSync(logoPath);
      logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;
    }
  } catch (e) {
    console.warn('Logo file not read, using text branding');
  }

  // Helper for Section Header Banner
  const addPageHeader = (title: string, subtitle?: string) => {
    doc.setFillColor(...emeraldColor);
    doc.rect(0, 0, pageWidth, 35, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(cleanText(title), 15, 20);

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(209, 250, 229); // emerald-100
    doc.text(cleanText(subtitle || 'SecApp - Manual Oficial de Operacoes e Funcionalidades'), 15, 28);

    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text('MANUAL DO USUARIO', pageWidth - 15, 20, { align: 'right' });
  };

  // Helper for Module Sub-header
  const addSectionTitle = (title: string, yPos: number): number => {
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(15, yPos, pageWidth - 30, 8, 1.5, 1.5, 'F');
    doc.setTextColor(...emeraldColor);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(cleanText(title), 19, yPos + 5.5);
    return yPos + 12;
  };

  // ----------------------------------------------------
  // CAPA (PAGE 1)
  // ----------------------------------------------------
  doc.setFillColor(...darkSlateColor);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  // Accent top stripe
  doc.setFillColor(...emeraldColor);
  doc.rect(0, 0, pageWidth, 12, 'F');

  // Decorative badge
  doc.setFillColor(...emeraldColor);
  doc.roundedRect(pageWidth / 2 - 40, 42, 80, 80, 16, 16, 'F');

  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', pageWidth / 2 - 30, 52, 60, 60);
    } catch (err) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(28);
      doc.setTextColor(255, 255, 255);
      doc.text('SecApp', pageWidth / 2, 88, { align: 'center' });
    }
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(32);
    doc.setTextColor(255, 255, 255);
    doc.text('SecApp', pageWidth / 2, 88, { align: 'center' });
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text(cleanText('MANUAL COMPLETO DO SISTEMA'), pageWidth / 2, 140, { align: 'center' });

  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(52, 211, 153); // emerald-400
  doc.text(cleanText('Guia Operacional, Instrucoes de Primeiro Acesso e Modulos Industriais'), pageWidth / 2, 149, { align: 'center' });

  doc.setTextColor(148, 163, 184); // slate-400
  doc.setFontSize(9);
  doc.text(cleanText('Sistema Integrado de Gestao Operacional, Seguranca e Manutencao Industrial'), pageWidth / 2, 157, { align: 'center' });

  // Specs card in Cover
  doc.setFillColor(30, 41, 59); // slate-800
  doc.roundedRect(25, 175, pageWidth - 50, 82, 4, 4, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text('INFORMACOES CORPORATIVAS & DIRETRIZES DE ACESSO', 34, 187);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(203, 213, 225);
  doc.text('Plataforma: SecApp Web & Mobile PWA (Progressive Web App)', 34, 196);
  doc.text('Unidade: Eldorado Brasil Celulose - Complexo Industrial', 34, 203);
  doc.text('Dominio Autorizado de E-mail: @eldoradobrasil.com.br', 34, 210);
  doc.text('Senha Padrao de 1o Acesso: Mudarsenha123 (Troca obrigatoria no primeiro login)', 34, 217);
  doc.text('Versao do Sistema: 2026.1 Enterprise Edition', 34, 224);
  doc.text(`Data de Emissao: ${new Date().toLocaleDateString('pt-BR')}`, 34, 231);
  doc.text('Perfis Habilitados: Operador, Inspetor, Lider de Turno, Gestor e Administrador', 34, 238);
  doc.text('Abrangencia: 17 Telas, Modulos Operacionais e Auditoria em Tempo Real', 34, 245);

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('Documento oficial para consulta operacional, integracao de novos colaboradores e auditorias.', pageWidth / 2, 280, { align: 'center' });

  // ----------------------------------------------------
  // PAGINA 2: SUMARIO EXECUTIVO & GOVERNANCA
  // ----------------------------------------------------
  doc.addPage();
  addPageHeader('SUMARIO EXECUTIVO & ESTRUTURA', 'Indice completo de todos os modulos e diretrizes corporativas');

  const summaryModules = [
    ['1', 'Instrucoes de 1o Acesso, Login e Seguranca', 'Dominio @eldoradobrasil.com.br, senha temporaria, troca obrigatoria e PWA.', '03'],
    ['2', 'Painel Geral (Dashboard) & Overview', 'Indicadores operacionais, status de linhas, OEE e gestao a vista da planta.', '04'],
    ['3', 'Passagem de Turno Operacional', 'Registro de ocorrencias de turno (A, B, C, D), metas de producao e pendencias.', '05'],
    ['4', 'Controle de Paradas Industriais', 'Paradas programadas/emergenciais, frentes de trabalho e cronometros.', '06'],
    ['5', 'Inspecao Diaria de Empilhadeiras', 'Checklist pre-operacional, bloqueio de seguranca (tag vermelha) e laudos.', '07'],
    ['6', 'Controle de Arames & Enfardamento', 'Rastreabilidade de lotes, bobinas, amarradoras (Enfardamento 2 e 3) e quebras.', '08'],
    ['7', 'Controle de Insumos Industriais', 'Gestao de estoque de fitas, capas, tintas e alertas de ponto de pedido.', '09'],
    ['8', 'Inspecao de Qualidade & Processos', 'Roteiros tecnicos, umidade, gramatura, fotos de desvios e relatorios RNC.', '10'],
    ['9', 'DDS Online (Dialogo Diario de Seguranca)', 'Temas de NRs, presenca nominal, assinatura na tela e fotos de equipe.', '11'],
    ['10', 'Rotas Operacionais & Rondas', 'Checkpoints fisicos com QR Code, auditoria em campo e historico de rondas.', '12'],
    ['11', 'Observacoes de Seguranca & Quase Acidentes', 'Relato de condicoes inseguras, matriz de risco e plano de acao no Kanban.', '13'],
    ['12', 'Escala de Trabalho & Turnos', 'Calendario 6x2 / 4x2 / 3T, letras A/B/C/D, folgas e trocas de plantao.', '14'],
    ['13', 'Treinamentos & Certificados (NRs)', 'Matriz de capacitacao (NR-11, 12, 33, 35), alertas 30/60/90 dias e PDFs.', '15'],
    ['14', 'Manutencao & Ordens de Servico', 'Abertura de chamados mecanica/eletrica, status e validacao operacional.', '16'],
    ['15', 'Justificativa de Horas Extras & Ferias', 'Solicitacao e aprovacao hierarquica de HE; Mapa anual de programacao de ferias.', '17'],
    ['16', 'Painel Administrativo & Relatorios Gerais', 'Gestao de contas @eldoradobrasil, modulos ativos e exportacao em PDF/Excel.', '18']
  ];

  autoTable(doc, {
    startY: 42,
    margin: { left: 15, right: 15 },
    head: [['#', 'Modulo / Tela', 'Objetivo Principal no Sistema', 'Pag.']],
    body: summaryModules,
    theme: 'grid',
    headStyles: { fillColor: emeraldColor, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    styles: { fontSize: 7.4, cellPadding: 1.8 },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 55, fontStyle: 'bold', textColor: darkSlateColor },
      2: { cellWidth: 105 },
      3: { cellWidth: 12, halign: 'center', fontStyle: 'bold', textColor: emeraldColor }
    }
  });

  const currentY = (doc as any).lastAutoTable.finalY + 6;
  addSectionTitle('Perfis de Acesso (RBAC) e Governanca de Dados', currentY);

  const permissions = [
    ['Operador / Tecnico', 'Acesso aos modulos operacionais do seu turno: Passagem de Turno, Empilhadeiras, Arames, DDS, Insumos, Rotas e Observacoes.'],
    ['Lider / Inspetor', 'Aprovacao de horas extras, validacao de rotas operacionais, auditoria de inspecao, emissao de DDS e fechamento de turno.'],
    ['Gestor (Manager)', 'Acesso a todos os Dashboards, visao panoramica da fabrica, relatorios executivos, exportacoes completas e gestao de equipe.'],
    ['Administrador (Admin/Master)', 'Controle total de usuarios @eldoradobrasil.com.br, reset de senhas, ativacao/desativacao de modulos globais e configuracoes.']
  ];

  autoTable(doc, {
    startY: currentY + 11,
    margin: { left: 15, right: 15 },
    head: [['Perfil', 'Responsabilidades e Permissoes']],
    body: permissions,
    theme: 'plain',
    styles: { fontSize: 7.5, cellPadding: 1.6 },
    columnStyles: {
      0: { cellWidth: 50, fontStyle: 'bold', textColor: emeraldColor },
      1: { cellWidth: 130, textColor: slate700 }
    }
  });

  // ----------------------------------------------------
  // PAGINA 3: PRIMEIRO ACESSO, LOGIN & POLÍTICA DE SENHAS
  // ----------------------------------------------------
  doc.addPage();
  addPageHeader('1. INSTRUCOES DE 1o ACESSO, LOGIN & SEGURANCA', 'Acesso com e-mail @eldoradobrasil.com.br, senha temporaria e definicao de senha pessoal');

  let y = 42;
  y = addSectionTitle('Passo a Passo Oficial para o Primeiro Acesso', y);

  const firstAccessSteps = [
    ['1. Dominio Autorizado', 'O acesso ao SecApp e restrito a colaboradores da empresa. O e-mail informado deve obrigatoriamente possuir a terminacao oficial: @eldoradobrasil.com.br (exemplo: jackson.junior@eldoradobrasil.com.br).'],
    ['2. Senha Temporaria Padrao', 'No primeiro acesso de qualquer colaborador, a senha inicial padrao cadastrada pela Administracao e: Mudarsenha123 (respeitando a primeira letra maiuscula "M" e os numeros ao final).'],
    ['3. Login Inicial', 'Insira seu e-mail corporativo completo e a senha Mudarsenha123 na tela de login e clique no botao verde "Entrar".'],
    ['4. Tela de Troca Obrigatoria', 'Ao detectar que o usuario esta utilizando a senha inicial temporaria, o SecApp bloqueia a navegacao e abre imediatamente a tela de Troca Obrigatoria de Senha.'],
    ['5. Criacao da Senha Pessoal', 'O colaborador devera criar sua senha pessoal exclusiva, digita-la novamente no campo de confirmacao e clicar em "Salvar Nova Senha".'],
    ['6. Acesso Liberado', 'Apos a definicao da senha pessoal, o sistema autentica a sessao e libera o menu de navegacao de acordo com o perfil atribuido ao colaborador (Operador, Lider, Gestor ou Admin).']
  ];

  autoTable(doc, {
    startY: y,
    margin: { left: 15, right: 15 },
    head: [['Etapa do 1o Acesso', 'Instrucao Detalhada']],
    body: firstAccessSteps,
    theme: 'grid',
    headStyles: { fillColor: darkSlateColor, textColor: [255, 255, 255], fontSize: 8 },
    styles: { fontSize: 7.8, cellPadding: 2 },
    columnStyles: { 0: { cellWidth: 48, fontStyle: 'bold', textColor: emeraldColor }, 1: { cellWidth: 132 } }
  });

  y = (doc as any).lastAutoTable.finalY + 7;
  y = addSectionTitle('Recursos Adicionais de Acesso e Experiencia do Usuario', y);

  const loginMore = [
    ['Esqueci Minha Senha', 'Caso o colaborador esqueca sua senha pessoal, basta clicar em "Esqueci minha senha" na tela de login. O sistema enviara um link seguro de redefinicao diretamente para a caixa de e-mail @eldoradobrasil.com.br.'],
    ['Aplicativo PWA (Instalacao no Celular/Desktop)', 'O SecApp e compativel com instalacao como aplicativo (PWA). No navegador (Chrome/Safari), basta clicar em "Instalar aplicativo" ou "Adicionar a tela de inicio" para acesso com icone na tela.'],
    ['Acessibilidade (Tamanho da Fonte)', 'No cabecalho superior da aplicacao ha o controle de acessibilidade (A- / A / A+). O colaborador pode aumentar ou diminuir o tamanho dos textos para facilitar a leitura em telas de diferentes dimensoes.'],
    ['Menu Personalizado (Arrastar e Soltar)', 'No menu lateral (Desktop e Mobile), o colaborador pode segurar o icone de seis pontos e arrastar os botoes para organizar as telas na ordem que melhor atende sua rotina de trabalho.']
  ];

  autoTable(doc, {
    startY: y,
    margin: { left: 15, right: 15 },
    head: [['Recurso de Interface', 'Descricao e Modo de Uso']],
    body: loginMore,
    theme: 'grid',
    headStyles: { fillColor: emeraldColor, textColor: [255, 255, 255], fontSize: 8 },
    styles: { fontSize: 7.8, cellPadding: 2 },
    columnStyles: { 0: { cellWidth: 48, fontStyle: 'bold', textColor: darkSlateColor }, 1: { cellWidth: 132 } }
  });

  // ----------------------------------------------------
  // PAGINA 4: MODULOS 1 E 2 - DASHBOARD & OVERVIEW
  // ----------------------------------------------------
  doc.addPage();
  addPageHeader('2. DASHBOARD GERAL & OVERVIEW OPERACIONAL', 'Paineis executivos em tempo real, monitoramento de linhas e gestao a vista');

  y = 42;
  y = addSectionTitle('1. Painel Overview - Monitoramento em Tempo Real da Fabrica', y);

  const overviewDetails = [
    ['Status das Linhas de Producao', 'Acompanhamento simultaneo das linhas: Enfardamento 2, Enfardamento 3, Secagem e Parte Umida. Indicadores visuais de status: Em Operacao (Verde), Operando com Restricao (Amarelo) e Parada (Vermelho).'],
    ['Monitoramento da Frota de Empilhadeiras', 'Controle em tempo real de todas as empilhadeiras em operacao no turno atual, identificando operador conectado, horimetro e status de checklist OK ou Maquina Bloqueada.'],
    ['Quadro de Alertas de Seguranca', 'Exibicao imediata de observacoes de seguranca criticas abertas nas ultimas horas, garantindo atencao prioritaria da lideranca.'],
    ['Resumo de Entregas de Turno', 'Visualizacao do fechamento da passagem de turno mais recente com anotacoes de producao e pendencias para a equipe que esta atuando.']
  ];

  autoTable(doc, {
    startY: y,
    margin: { left: 15, right: 15 },
    head: [['Modulo Overview', 'Detalhamento dos Indicadores']],
    body: overviewDetails,
    theme: 'grid',
    headStyles: { fillColor: darkSlateColor, textColor: [255, 255, 255], fontSize: 8 },
    styles: { fontSize: 7.8, cellPadding: 2 },
    columnStyles: { 0: { cellWidth: 50, fontStyle: 'bold', textColor: emeraldColor }, 1: { cellWidth: 130 } }
  });

  y = (doc as any).lastAutoTable.finalY + 7;
  y = addSectionTitle('2. Dashboard Analitico - Metricas, Graficos e Tendencias', y);

  const dashMetrics = [
    ['Metricas de Eficiencia (OEE & Disponibilidade)', 'Calculo automatico da disponibilidade operacional das linhas de enfardamento cruzando horas planejadas vs horas de parada registradas.'],
    ['Graficos de Paradas por Categoria', 'Distribuicao grafica do tempo de paradas: Mecanica, Eletrica, Automacao, Operacional, Troca de Arame ou Falta de Insumo.'],
    ['Conformidade de Inspecao & Qualidade', 'Indice percentual de conformidade dos lotes inspecionados e taxa de resolucao de Relatorios de Nao Conformidade (RNC).'],
    ['Aderencia ao DDS e Treinamentos', 'Grafico de participacao dos colaboradores nos Dialogos Diarios de Seguranca e matriz de validade das NRs da equipe.'],
    ['Filtros por Data e Turno (A, B, C, D)', 'Possibilidade de segmentar todos os graficos por periodo customizado e por letra de turno para comparacao de desempenho.']
  ];

  autoTable(doc, {
    startY: y,
    margin: { left: 15, right: 15 },
    head: [['Recurso Analitico', 'Descricao e Utilidade Gerencial']],
    body: dashMetrics,
    theme: 'grid',
    headStyles: { fillColor: emeraldColor, textColor: [255, 255, 255], fontSize: 8 },
    styles: { fontSize: 7.8, cellPadding: 2 },
    columnStyles: { 0: { cellWidth: 50, fontStyle: 'bold', textColor: darkSlateColor }, 1: { cellWidth: 130 } }
  });

  // ----------------------------------------------------
  // PAGINA 5: MODULO 3 - PASSAGEM DE TURNO
  // ----------------------------------------------------
  doc.addPage();
  addPageHeader('3. PASSAGEM DE TURNO OPERACIONAL', 'Garantia de continuidade operacional, registro de ocorrencias e alinhamento de metas');

  y = 42;
  y = addSectionTitle('Objetivo e Fluxo de Trabalho do Modulo', y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(...slate700);
  const shiftIntro = 'O modulo de Passagem de Turno foi desenvolvido para eliminar falhas de comunicacao na troca de equipes industriais. Ele permite que lideres e operadores registrem com precisao o status dos equipamentos, metas alcancadas, pendencias de manutencao e avisos prioritarios.';
  doc.text(doc.splitTextToSize(cleanText(shiftIntro), pageWidth - 30), 15, y);

  y += 12;
  y = addSectionTitle('Estrutura de Preenchimento da Passagem de Turno', y);

  const shiftFields = [
    ['Identificacao do Turno', 'Selecao do Turno que entrega e do Turno que assume (Turno A, B, C ou D / 1o, 2o ou 3o Turno), data e horario exato da troca.'],
    ['Equipe e Presentes', 'Selecao dos operadores, tecnicos e lideres presentes no turno para historico oficial e controle de presenca.'],
    ['Metas e Producao Realizada', 'Registro do volume produzido em toneladas de celulose, numero total de fardos gerados e velocidade media das amarradoras.'],
    ['Status das Linhas de Producao', 'Condicao detalhada de cada linha (Enfardamento 2, Enfardamento 3, Secagem, Parte Umida) com indicacao de restricoes operacionais.'],
    ['Ocorrencias e Desvios do Turno', 'Relato minucioso de imprevistos, problemas mecanicos/eletricos ou paradas ocorridas durante a jornada de trabalho.'],
    ['Pendencias para o Proximo Turno', 'Checklist de acoes obrigatorias que a equipe que esta entrando deve executar nas primeiras horas do plantao.'],
    ['Anexo de Fotos de Evidencia', 'Upload de fotos de quadros, pecas com desgaste, amostras de produto ou condicoes fisicas da maquina diretamente pelo celular.'],
    ['Validacao & Assinatura Digital', 'Assinatura digital do lider emissor e confirmacao formal de ciencia do lider receptor do turno.']
  ];

  autoTable(doc, {
    startY: y,
    margin: { left: 15, right: 15 },
    head: [['Secao do Formulario', 'O que deve ser preenchido / Regra de Negocio']],
    body: shiftFields,
    theme: 'grid',
    headStyles: { fillColor: emeraldColor, textColor: [255, 255, 255], fontSize: 8 },
    styles: { fontSize: 7.8, cellPadding: 2 },
    columnStyles: { 0: { cellWidth: 50, fontStyle: 'bold', textColor: darkSlateColor }, 1: { cellWidth: 130 } }
  });

  y = (doc as any).lastAutoTable.finalY + 6;
  doc.setFillColor(...lightBg);
  doc.roundedRect(15, y, pageWidth - 30, 22, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...emeraldColor);
  doc.text('DICA OPERACIONAL PARA OS LIDERES DE TURNO:', 19, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.6);
  doc.setTextColor(...slate700);
  const tipShift = 'Sempre preencha a passagem de turno com 15 minutos de antecedencia do encerramento oficial. Isso permite que a reuniao de troca no painel de gestao a vista seja rapida, objetiva e baseada em dados confiaveis registrados no SecApp.';
  doc.text(doc.splitTextToSize(cleanText(tipShift), pageWidth - 38), 19, y + 12);

  // ----------------------------------------------------
  // PAGINA 6: MODULO 4 - CONTROLE DE PARADAS
  // ----------------------------------------------------
  doc.addPage();
  addPageHeader('4. CONTROLE DE PARADAS INDUSTRIAIS', 'Gestao de paradas programadas, gerais, corretivas e frentes de trabalho');

  y = 42;
  y = addSectionTitle('Tipos de Paradas e Procedimentos Operacionais', y);

  const stopTypes = [
    ['Parada Programada', 'Intervencoes planejadas de manutencao preventiva, trocas de arame, limpeza tecnica de esteiras ou ajustes de amarradoras.'],
    ['Parada Geral', 'Grandes paradas semestrais/anuais envolvendo todas as disciplinas (Mecanica, Eletrica, Automacao, Civil e Utilidades).'],
    ['Parada de Emergencia / Corretiva', 'Quedas inesperadas de linha que exigem mobilizacao rapida da manutencao de plantao e investigacao de causa raiz.'],
    ['Inspecao Operacional', 'Paradas de curta duracao para conferencia de parametros de seguranca, troca de facas ou calibracao de balancas.']
  ];

  autoTable(doc, {
    startY: y,
    margin: { left: 15, right: 15 },
    head: [['Tipo de Parada', 'Aplicacao e Procedimento']],
    body: stopTypes,
    theme: 'grid',
    headStyles: { fillColor: darkSlateColor, textColor: [255, 255, 255], fontSize: 8 },
    styles: { fontSize: 7.8, cellPadding: 2 },
    columnStyles: { 0: { cellWidth: 48, fontStyle: 'bold', textColor: emeraldColor }, 1: { cellWidth: 132 } }
  });

  y = (doc as any).lastAutoTable.finalY + 7;
  y = addSectionTitle('Recursos da Tela de Controle de Paradas', y);

  const stopFeatures = [
    ['Cadastro de Linhas e Velocidades', 'Controle dinamico de velocidade das linhas (ex: Enfardamento 2, Enfardamento 3, Secagem e Parte Umida).'],
    ['Frentes de Trabalho Simultaneas', 'Adicao de multiplas frentes de servico (Caldeiraria, Mecanica, Eletrica, Hidraulica) vinculadas a uma mesma parada.'],
    ['Cronometro de Tempo Real', 'Calculo automatico da duracao exata da parada em horas/minutos e seu impacto percentual na disponibilidade.'],
    ['Galeria de Evidencias Fotograficas', 'Registro visual de componentes danificados, soldas executadas e condicoes antes/depois da intervencao.'],
    ['Exportacao de Relatorio de Parada em PDF', 'Geracao imediata de relatorio detalhado da parada no padrao visual esmeralda com logo institucional.']
  ];

  autoTable(doc, {
    startY: y,
    margin: { left: 15, right: 15 },
    head: [['Recurso do Sistema', 'Descricao Detalhada']],
    body: stopFeatures,
    theme: 'grid',
    headStyles: { fillColor: emeraldColor, textColor: [255, 255, 255], fontSize: 8 },
    styles: { fontSize: 7.8, cellPadding: 2 },
    columnStyles: { 0: { cellWidth: 48, fontStyle: 'bold' }, 1: { cellWidth: 132 } }
  });

  // ----------------------------------------------------
  // PAGINA 7: MODULO 5 - EMPILHADEIRAS
  // ----------------------------------------------------
  doc.addPage();
  addPageHeader('5. INSPECAO E CHECKLIST DE EMPILHADEIRAS', 'Inspecao diaria, bloqueio de seguranca e conservacao de frota');

  y = 42;
  y = addSectionTitle('Fluxo de Inspecao Pre-Operacional do Condutor', y);

  const forkliftSteps = [
    ['Selecao do Equipamento', 'O operador seleciona o numero da empilhadeira cadastrada na frota da sua area operacional.'],
    ['Turno e Identificacao', 'Identificacao automatica do operador conectado no SecApp, turno de trabalho e letra de escala atual.'],
    ['Checklist Obrigatorio de Seguranca', 'Verificacao item a item: freios, pneus, buzina, vazamentos de oleo hidraulico, garfos, cinto de seguranca, torre e iluminacao.'],
    ['Registro de Conformidade', 'Classificacao em Conforme (OK) ou Nao Conforme (Anormal), com campo para observacao detalhada de desvios.'],
    ['Bloqueio Automatico (Tag Vermelha)', 'Se um item critico impeditivo (ex: freio ou cinto) estiver anormal, o sistema aplica bloqueio digital imediato no maquinario.'],
    ['Anexo de Fotos de Avarias', 'Captura de fotos de amassados, vazamentos ou desgastes no momento exato da inspecao pelo celular.'],
    ['Emissao de Laudo Tecnico em PDF', 'Exportacao de laudo individual de inspecao com status colorido e evidencia fotografica para arquivo do SESMT.']
  ];

  autoTable(doc, {
    startY: y,
    margin: { left: 15, right: 15 },
    head: [['Etapa do Checklist', 'Procedimento Operacional']],
    body: forkliftSteps,
    theme: 'grid',
    headStyles: { fillColor: emeraldColor, textColor: [255, 255, 255], fontSize: 8 },
    styles: { fontSize: 7.8, cellPadding: 2 },
    columnStyles: { 0: { cellWidth: 50, fontStyle: 'bold', textColor: darkSlateColor }, 1: { cellWidth: 130 } }
  });

  y = (doc as any).lastAutoTable.finalY + 7;
  y = addSectionTitle('Aba Administrativa e Gestao de Frota (Lideres / Gestores)', y);

  const forkliftAdmin = [
    ['Cadastro de Equipamentos', 'Inclusao de novas empilhadeiras com numero de frota, modelo, marca, capacidade de carga e horimetro inicial.'],
    ['Configuracao dos Itens do Checklist', 'Personalizacao das perguntas da inspecao, definicao de itens obrigatorios e criticidade de bloqueio.'],
    ['Liberacao Formal de Maquinas Bloqueadas', 'Desbloqueio formal no sistema apos comprovacao de manutencao corretiva realizada pela oficina.']
  ];

  autoTable(doc, {
    startY: y,
    margin: { left: 15, right: 15 },
    head: [['Funcao Administrativa', 'Descricao']],
    body: forkliftAdmin,
    theme: 'plain',
    styles: { fontSize: 7.8, cellPadding: 2 },
    columnStyles: { 0: { cellWidth: 50, fontStyle: 'bold', textColor: emeraldColor }, 1: { cellWidth: 130 } }
  });

  // ----------------------------------------------------
  // PAGINA 8: MODULO 6 - CONTROLE DE ARAMES
  // ----------------------------------------------------
  doc.addPage();
  addPageHeader('6. CONTROLE DE ARAMES & ENFARDAMENTO', 'Rastreabilidade de bobinas, consumo por linha e controle de fornecedores');

  y = 42;
  y = addSectionTitle('Objetivo e Importancia da Rastreabilidade de Arames', y);

  const wireDetails = [
    ['Controle de Lotes de Arame', 'Registro do numero de lote, certificado de qualidade, diametro e fabricante de cada bobina instalada na maquina.'],
    ['Vinculo com a Linha Produtiva', 'Apontamento exato da amarradora e linha onde o arame foi aplicado (ex: Linha Enfardamento 2 ou Enfardamento 3).'],
    ['Registro de Rompimentos e Falhas', 'Apontamento estatistico de quebras de arame durante o processo para avaliacao de qualidade do fornecedor.'],
    ['Calculo de Consumo Real por Tonelada', 'Cruzamento do numero de fardos amarrados com a metragem gasta de arame por tonelada de celulose produzida.'],
    ['Historico e Rastreamento de Lotes', 'Busca rapida para responder a eventuais reclamacoes de clientes sobre amarracao atraves do lote do arame.']
  ];

  autoTable(doc, {
    startY: y,
    margin: { left: 15, right: 15 },
    head: [['Funcionalidade', 'Impacto Operacional']],
    body: wireDetails,
    theme: 'grid',
    headStyles: { fillColor: emeraldColor, textColor: [255, 255, 255], fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 2.3 },
    columnStyles: { 0: { cellWidth: 50, fontStyle: 'bold', textColor: darkSlateColor }, 1: { cellWidth: 130 } }
  });

  // ----------------------------------------------------
  // PAGINA 9: MODULO 7 - INSUMOS INDUSTRIAIS
  // ----------------------------------------------------
  doc.addPage();
  addPageHeader('7. CONTROLE DE INSUMOS INDUSTRIAIS', 'Gestao de estoque, movimentacoes de entrada/saida e alertas de reposicao');

  y = 42;
  y = addSectionTitle('Controle Inteligente de Estoque de Insumos', y);

  const consumableDetails = [
    ['Catalogo Geral de Insumos', 'Cadastro completo de materiais: tintas de marcacao, cintas, lacres, capas protetoras, oleos lubrificantes, EPIs e etiquetas.'],
    ['Saldo em Tempo Real', 'Atualizacao automatica das quantidades fisicas disponiveis no almoxarifado de producao e frentes de trabalho.'],
    ['Entradas e Devolucoes de Turno', 'Registro de notas de remessa, recebimento de fornecedores ou devolucao de materiais nao utilizados.'],
    ['Baixa por Consumo Direto', 'O operador informa a quantidade retirada e em qual maquina/linha o material foi aplicado.'],
    ['Alertas de Ponto de Pedido (Minimo/Critico)', 'Sinalizacao visual em vermelho quando o insumo atinge a quantidade de seguranca para compras.'],
    ['Historico e Log de Auditoria', 'Rastreabilidade total de quem retirou, quantidade, data e hora de cada movimentacao.']
  ];

  autoTable(doc, {
    startY: y,
    margin: { left: 15, right: 15 },
    head: [['Recurso de Gestao', 'Como Funciona']],
    body: consumableDetails,
    theme: 'grid',
    headStyles: { fillColor: emeraldColor, textColor: [255, 255, 255], fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 2.3 },
    columnStyles: { 0: { cellWidth: 52, fontStyle: 'bold', textColor: darkSlateColor }, 1: { cellWidth: 128 } }
  });

  // ----------------------------------------------------
  // PAGINA 10: MODULO 8 - INSPECOES DE QUALIDADE
  // ----------------------------------------------------
  doc.addPage();
  addPageHeader('8. INSPECAO DE QUALIDADE & PROCESSOS', 'Roteiros de conformidade de produto, peso de fardos e padroes tecnicos');

  y = 42;
  y = addSectionTitle('Rotina de Inspecao e Controle de Qualidade', y);

  const qualityDetails = [
    ['Roteiros Padronizados de Inspecao', 'Formularios especificos para Parte Umida, Secagem, Enfardamento e Produto Acabado.'],
    ['Conferencia de Especificacoes Tecnicas', 'Medicao de umidade da folha, gramatura, alinhamento de fardos, qualidade de impressao e integridade do lamelar.'],
    ['Tratamento de Nao Conformidades (RNC)', 'Abertura imediata de desvios com descricao da causa provavel e segregacao de produto fora do padrao.'],
    ['Evidencias Fotograficas Macro', 'Inclusao de fotos macro de defeitos em folhas, rasgos ou manchas para laudo do laboratorio de celulose.'],
    ['Exportacao de Laudos em PDF', 'Emissao de certificados e fichas de inspecao assinadas digitalmente para auditorias ISO 9001 e ISO 14001.']
  ];

  autoTable(doc, {
    startY: y,
    margin: { left: 15, right: 15 },
    head: [['Etapa da Inspecao', 'Procedimento Operacional']],
    body: qualityDetails,
    theme: 'grid',
    headStyles: { fillColor: emeraldColor, textColor: [255, 255, 255], fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 2.3 },
    columnStyles: { 0: { cellWidth: 52, fontStyle: 'bold', textColor: darkSlateColor }, 1: { cellWidth: 128 } }
  });

  // ----------------------------------------------------
  // PAGINA 11: MODULO 9 - DDS ONLINE
  // ----------------------------------------------------
  doc.addPage();
  addPageHeader('9. DDS ONLINE (DIALOGO DIARIO DE SEGURANCA)', 'Engajamento de seguranca, temas diarios, presenca e assinaturas digitais');

  y = 42;
  y = addSectionTitle('Funcionamento do Modulo DDS Online', y);

  const ddsDetails = [
    ['Banco de Temas de Seguranca', 'Biblioteca de assuntos atualizados (NR-11, NR-12, Trabalho em Altura, Bloqueio LOTO, Ergonomia e Regras que Salvam Vidas).'],
    ['Criacao de Novo DDS pelo Lider', 'O lider define o tema do dia, objetivos da conversa e instrucoes de prevencao para a equipe antes de iniciar o turno.'],
    ['Lista de Presenca Digital', 'Marcacao dos colaboradores participantes com registro automatico de horario e confirmacao nominal.'],
    ['Assinatura Digital no Dispositivo', 'Coleta da rubrica digital do lider e dos participantes diretamente na tela do tablet ou celular.'],
    ['Evidencia Fotografica da Reuniao', 'Foto obrigatoria da equipe reunida no dialogo para comprovacao documental junto ao SESMT.'],
    ['Emissao da Folha Oficial de DDS em PDF', 'Geracao de documento oficial pronto para impressao ou arquivamento em auditorias trabalhistas e ISO 45001.']
  ];

  autoTable(doc, {
    startY: y,
    margin: { left: 15, right: 15 },
    head: [['Funcionalidade do DDS', 'Descricao do Processo']],
    body: ddsDetails,
    theme: 'grid',
    headStyles: { fillColor: emeraldColor, textColor: [255, 255, 255], fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 2.3 },
    columnStyles: { 0: { cellWidth: 52, fontStyle: 'bold', textColor: darkSlateColor }, 1: { cellWidth: 128 } }
  });

  // ----------------------------------------------------
  // PAGINA 12: MODULO 10 - ROTAS OPERACIONAIS
  // ----------------------------------------------------
  doc.addPage();
  addPageHeader('10. ROTAS OPERACIONAIS & RONDAS TECNICAS', 'Auditorias de campo, leitura de QR Code e verificacao de pontos criticos');

  y = 42;
  y = addSectionTitle('Metodologia de Rondas com QR Code', y);

  const routeDetails = [
    ['Pontos de Checagem (Checkpoints)', 'Etiquetas com QR Code fixadas em pontos estrategicos da fabrica (bombas, paineis, valvulas e redutores).'],
    ['Leitura Obrigatoria por Camera', 'O operador/inspetor escaneia o QR Code usando a camera do aplicativo SecApp para comprovar presenca fisica no local.'],
    ['Formulario Especifico do Ponto', 'Ao escanear, o sistema abre as perguntas exclusivas daquele equipamento (vibracao, temperatura, vazamentos e pressao).'],
    ['Controle de Rota em Tempo Real', 'O lider visualiza no painel quais pontos da rota ja foram inspecionados no turno atual e quais estao pendentes.'],
    ['Tratamento Imediato de Desvios', 'Se um ponto apresentar anomalia critica, o sistema gera alerta imediato para acao preventiva da equipe.']
  ];

  autoTable(doc, {
    startY: y,
    margin: { left: 15, right: 15 },
    head: [['Fase da Ronda', 'Descricao']],
    body: routeDetails,
    theme: 'grid',
    headStyles: { fillColor: emeraldColor, textColor: [255, 255, 255], fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 2.3 },
    columnStyles: { 0: { cellWidth: 52, fontStyle: 'bold', textColor: darkSlateColor }, 1: { cellWidth: 128 } }
  });

  // ----------------------------------------------------
  // PAGINA 13: MODULO 11 - OBSERVACOES DE SEGURANCA
  // ----------------------------------------------------
  doc.addPage();
  addPageHeader('11. OBSERVACOES DE SEGURANCA & QUASE ACIDENTES', 'Cultura proativa, relato de condicoes inseguras e planos de correcao');

  y = 42;
  y = addSectionTitle('Registro e Tratamento de Desvios de Seguranca', y);

  const safetyDetails = [
    ['Relato de Desvios e Quase Acidentes', 'Qualquer colaborador pode relatar condicoes de risco ou comportamentos fora do padrao com sigilo e rapidez.'],
    ['Classificacao de Severidade e Probabilidade', 'Categorizacao em Matriz de Risco (Baixo, Medio, Alto ou Critico) para definir a urgencia de intervencao.'],
    ['Localizacao Exata do Perigo', 'Indicacao do setor, linha, equipamento ou area comum onde o risco foi detectado.'],
    ['Plano de Acao & Responsavel', 'Designacao da acao corretiva, prazo limite de resolucao e profissional encarregado.'],
    ['Acompanhamento em Kanban Visual', 'Quadro visual: Pendente, Em Andamento, Concluido e Validado pela Seguranca do Trabalho (SESMT).']
  ];

  autoTable(doc, {
    startY: y,
    margin: { left: 15, right: 15 },
    head: [['Etapa do Fluxo', 'Procedimento']],
    body: safetyDetails,
    theme: 'grid',
    headStyles: { fillColor: emeraldColor, textColor: [255, 255, 255], fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 2.3 },
    columnStyles: { 0: { cellWidth: 52, fontStyle: 'bold', textColor: darkSlateColor }, 1: { cellWidth: 128 } }
  });

  // ----------------------------------------------------
  // PAGINA 14: MODULO 12 - ESCALA DE TRABALHO
  // ----------------------------------------------------
  doc.addPage();
  addPageHeader('12. ESCALA DE TRABALHO & CALENDARIO DE TURNOS', 'Visualizacao de letras de trabalho, folgas, trocas de plantao e turnos');

  y = 42;
  y = addSectionTitle('Consulta e Gestao da Escala de Trabalho', y);

  const scheduleDetails = [
    ['Calendario Mensal de Escalas', 'Visualizacao grafica do mes completo com indicacao clara dos dias de trabalho e dias de folga de cada equipe.'],
    ['Letras de Trabalho (A, B, C, D)', 'Identificacao imediata de qual letra de turno esta operando em cada horario (1o, 2o ou 3o Turno).'],
    ['Filtro por Colaborador e Setor', 'Busca individual para conferir a escala de um operador especifico ou de toda a celula operacional.'],
    ['Registro Oficial de Troca de Plantao', 'Registro e comprovacao de substituicoes acordadas entre colaboradores e aprovadas formalmente pela lideranca.']
  ];

  autoTable(doc, {
    startY: y,
    margin: { left: 15, right: 15 },
    head: [['Recurso da Escala', 'Descricao']],
    body: scheduleDetails,
    theme: 'grid',
    headStyles: { fillColor: emeraldColor, textColor: [255, 255, 255], fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 2.3 },
    columnStyles: { 0: { cellWidth: 52, fontStyle: 'bold', textColor: darkSlateColor }, 1: { cellWidth: 128 } }
  });

  // ----------------------------------------------------
  // PAGINA 15: MODULO 13 - TREINAMENTOS E CERTIFICADOS
  // ----------------------------------------------------
  doc.addPage();
  addPageHeader('13. TREINAMENTOS & CERTIFICADOS (NRs)', 'Matriz de capacitacao tecnica, controle de reciclagem e validade de NRs');

  y = 42;
  y = addSectionTitle('Gestao de Treinamentos Obrigatorios e NRs', y);

  const certDetails = [
    ['Normas Regulamentadoras (NRs)', 'Acompanhamento rigoroso de NR-11 (Empilhadeiras e Pontes Rolantes), NR-12 (Maquinas), NR-33 (Espaco Confinado) e NR-35 (Altura).'],
    ['Alertas Automaticos de Vencimento', 'Sinalizacao visual e por aviso de certificados proximos de expirar (com 30, 60 e 90 dias de antecedencia).'],
    ['Upload e Armazenamento de Arquivos', 'Armazenamento do arquivo digital (PDF ou foto) do certificado emitido no cadastro do colaborador.'],
    ['Matriz de Habilidades por Equipe', 'Visao gerencial consolidada indicando quem esta 100% apto e habilitado para operar cada equipamento da planta.']
  ];

  autoTable(doc, {
    startY: y,
    margin: { left: 15, right: 15 },
    head: [['Funcionalidade', 'Aplicacao Pratica']],
    body: certDetails,
    theme: 'grid',
    headStyles: { fillColor: emeraldColor, textColor: [255, 255, 255], fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 2.3 },
    columnStyles: { 0: { cellWidth: 52, fontStyle: 'bold', textColor: darkSlateColor }, 1: { cellWidth: 128 } }
  });

  // ----------------------------------------------------
  // PAGINA 16: MODULO 14 - MANUTENCAO E ORDENS DE SERVICO
  // ----------------------------------------------------
  doc.addPage();
  addPageHeader('14. MANUTENCAO & ORDENS DE SERVICO', 'Abertura de chamados tecnicos, priorizacao e historico de intervencoes');

  y = 42;
  y = addSectionTitle('Fluxo de Solicitacao e Atendimento de Manutencao', y);

  const maintDetails = [
    ['Abertura Rapida de Chamado', 'Qualquer operador pode registrar solicitacao para falha mecanica, eletrica, hidraulica ou automacao.'],
    ['Definicao de Prioridade', 'Classificacao em Baixa, Media, Alta ou Linha Parada (Prioridade Maxima de Atendimento).'],
    ['Atribuicao de Tecnico de Plantao', 'O lider da manutencao delega a ordem de servico ao tecnico especialista responsavel.'],
    ['Apontamento de Pecas e Horas Trabalhadas', 'Registro dos componentes substituidos do estoque e tempo efetivo de mao de obra gasto.'],
    ['Liberacao com Validacao Operacional', 'A maquina/linha so e considerada liberada apos teste em conjunto entre Manutencao e Operacao.']
  ];

  autoTable(doc, {
    startY: y,
    margin: { left: 15, right: 15 },
    head: [['Etapa do Chamado', 'Procedimento Operacional']],
    body: maintDetails,
    theme: 'grid',
    headStyles: { fillColor: emeraldColor, textColor: [255, 255, 255], fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 2.3 },
    columnStyles: { 0: { cellWidth: 52, fontStyle: 'bold', textColor: darkSlateColor }, 1: { cellWidth: 128 } }
  });

  // ----------------------------------------------------
  // PAGINA 17: MODULOS 15 E 16 - HORAS EXTRAS E FERIAS
  // ----------------------------------------------------
  doc.addPage();
  addPageHeader('15. HORAS EXTRAS | 16. CONTROLE DE FERIAS', 'Gestao de jornadas extraordinarias e planejamento anual de ferias');

  y = 42;
  y = addSectionTitle('15. Justificativa de Horas Extras e Aprovacao', y);

  const overtimeDetails = [
    ['Lancamento da Solicitacao', 'Registro da data, horario inicial e final, total de horas e turno coberto pelo colaborador.'],
    ['Motivo da Convocacao', 'Justificativa tecnica clara (cobertura de falta, parada de emergencia, manutencao preventiva ou pico de carga).'],
    ['Fluxo de Aprovacao em 2 Niveis', 'Validacao inicial do lider de turno e aprovacao formal do Gestor Geral no sistema.'],
    ['Consolidacao para RH', 'Relatorio mensal consolidado por colaborador e centro de custo para folha de pagamento.']
  ];

  autoTable(doc, {
    startY: y,
    margin: { left: 15, right: 15 },
    head: [['Etapa da Justificativa', 'Detalhamento']],
    body: overtimeDetails,
    theme: 'grid',
    headStyles: { fillColor: darkSlateColor, textColor: [255, 255, 255], fontSize: 8 },
    styles: { fontSize: 7.8, cellPadding: 2 },
    columnStyles: { 0: { cellWidth: 50, fontStyle: 'bold', textColor: emeraldColor }, 1: { cellWidth: 130 } }
  });

  y = (doc as any).lastAutoTable.finalY + 7;
  y = addSectionTitle('16. Planejamento e Acompanhamento de Ferias', y);

  const vacationDetails = [
    ['Mapa Anual de Ferias', 'Painel visual exibindo a programacao de ferias de toda a equipe para evitar desfalques operacionais.'],
    ['Periodo Aquisitivo e Concessivo', 'Controle automatico das datas limites para gozo de ferias conforme legislacao trabalhista.'],
    ['Fracionamento e Periodos', 'Lancamento dos periodos (10, 15, 20 ou 30 dias) e solicitacao de abono pecuniario se aplicavel.'],
    ['Definicao de Coberturas', 'Apontamento previo dos colaboradores substitutos para as funcoes estrategicas durante a ausencia.']
  ];

  autoTable(doc, {
    startY: y,
    margin: { left: 15, right: 15 },
    head: [['Recurso de Ferias', 'Descricao']],
    body: vacationDetails,
    theme: 'grid',
    headStyles: { fillColor: emeraldColor, textColor: [255, 255, 255], fontSize: 8 },
    styles: { fontSize: 7.8, cellPadding: 2 },
    columnStyles: { 0: { cellWidth: 50, fontStyle: 'bold', textColor: darkSlateColor }, 1: { cellWidth: 130 } }
  });

  // ----------------------------------------------------
  // PAGINA 18: MODULO 17 - ADMINISTRACAO E RELATORIOS GERAIS
  // ----------------------------------------------------
  doc.addPage();
  addPageHeader('17. PAINEL ADMINISTRATIVO & RELATORIOS GERAIS', 'Gestao de usuarios @eldoradobrasil, ativacao de modulos e exportacao');

  y = 42;
  y = addSectionTitle('Painel Administrativo (Exclusivo Admins)', y);

  const adminDetails = [
    ['Gestao de Usuarios @eldoradobrasil.com.br', 'Aprovacao de novos cadastros de e-mail corporativo, atribuicao de perfis (Operador, Lider, Gestor, Admin) e bloqueio de acessos.'],
    ['Reset de Senha com Padrao Inicial', 'Disparo de link de redefinicao de senha ou reatribuicao temporaria da senha inicial Mudarsenha123 para o colaborador.'],
    ['Ativacao / Desativacao de Modulos Globais', 'Chave liga/desliga para habilitar ou ocultar modulos do sistema conforme a necessidade da operacao.'],
    ['Personalizacao Institucional', 'Configuracao do logotipo institucional, dados da unidade e parametros gerais de funcionamento.']
  ];

  autoTable(doc, {
    startY: y,
    margin: { left: 15, right: 15 },
    head: [['Funcao Administrativa', 'Descricao']],
    body: adminDetails,
    theme: 'grid',
    headStyles: { fillColor: darkSlateColor, textColor: [255, 255, 255], fontSize: 8 },
    styles: { fontSize: 7.8, cellPadding: 2 },
    columnStyles: { 0: { cellWidth: 52, fontStyle: 'bold', textColor: emeraldColor }, 1: { cellWidth: 128 } }
  });

  y = (doc as any).lastAutoTable.finalY + 7;
  y = addSectionTitle('Central de Relatorios e Exportacoes (Excel / PDF)', y);

  const reportDetails = [
    ['Relatorios Filtrados por Periodo e Turno', 'Exportacao consolidada de qualquer modulo operacional entre datas selecionadas e turnos especificos.'],
    ['Exportacao em Planilhas Excel / CSV', 'Extracao de dados brutos e tabulares para confeccao de graficos externos e integracao com Power BI.'],
    ['Padrao Visual dos Documentos em PDF', 'Todos os laudos e relatorios gerados seguem rigorosamente a identidade visual com cabecalho esmeralda e logo oficial.']
  ];

  autoTable(doc, {
    startY: y,
    margin: { left: 15, right: 15 },
    head: [['Recurso de Relatorios', 'Descricao']],
    body: reportDetails,
    theme: 'grid',
    headStyles: { fillColor: emeraldColor, textColor: [255, 255, 255], fontSize: 8 },
    styles: { fontSize: 7.8, cellPadding: 2 },
    columnStyles: { 0: { cellWidth: 52, fontStyle: 'bold' }, 1: { cellWidth: 128 } }
  });

  // ----------------------------------------------------
  // FOOTER CORPORATIVO EM TODAS AS PAGINAS
  // ----------------------------------------------------
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    // Skip cover page footer
    if (pageNum === 1) continue;

    doc.setPage(pageNum);
    const footerY = pageHeight - 10;

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(15, footerY - 4, pageWidth - 15, footerY - 4);

    let textStartX = 15;
    if (logoBase64) {
      try {
        doc.addImage(logoBase64, 'PNG', 15, footerY - 3, 9, 4);
        textStartX = 26;
      } catch {
        // fallback
      }
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...emeraldColor);
    doc.text('SecApp', textStartX, footerY + 0.8);

    const titleWidth = doc.getTextWidth('SecApp');
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184);
    doc.text(' | Manual Oficial de Operacoes e Funcionalidades', textStartX + titleWidth, footerY + 0.8);

    doc.text(`Pagina ${pageNum} de ${totalPages}`, pageWidth - 15, footerY + 0.8, { align: 'right' });
  }

  // Save to public directory
  const outputPath = path.join(process.cwd(), 'public', 'Manual_do_Usuario_SecApp.pdf');
  const pdfBytes = doc.output('arraybuffer');
  fs.writeFileSync(outputPath, Buffer.from(pdfBytes));

  console.log(`Manual PDF gerado com sucesso em: ${outputPath}`);
  console.log(`Tamanho final: ${(fs.statSync(outputPath).size / 1024).toFixed(2)} KB | Total de Paginas: ${totalPages}`);
};

generateManual();
