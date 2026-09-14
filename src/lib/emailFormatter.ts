/**
 * Helper to generate emails with SecApp / Eldorado Brasil visual identity
 * Compatible with Outlook (Desktop & Web), Gmail, Apple Mail, and Clipboard copy.
 */

export interface SecAppEmailOptions {
  toEmail: string;
  toName: string;
  userGroup?: string;
  cargoName?: string;
  sectorName?: string;
  rating?: number;
  observation?: string;
  highlights?: string[];
  replyMessage: string;
  senderName: string;
  senderEmail?: string;
  subject: string;
  appUrl?: string;
}

export function generateSecAppEmailCardHtml(options: SecAppEmailOptions): string {
  const {
    toName,
    userGroup,
    cargoName,
    sectorName,
    rating,
    observation,
    highlights,
    replyMessage,
    senderName,
    senderEmail,
    appUrl = (typeof window !== 'undefined' && window.location?.origin) ? window.location.origin : 'https://secapp.eldorado.com.br'
  } = options;

  const escapedName = (toName || 'Colaborador')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const escapedObservation = observation
    ? observation.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>')
    : '';

  const escapedMessage = replyMessage
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>');

  const ratingNum = rating ? Math.max(1, Math.min(5, Math.round(Number(rating)))) : 0;
  const starsString = ratingNum > 0 ? '★'.repeat(ratingNum) + '☆'.repeat(5 - ratingNum) : '';

  const detailsList = [
    userGroup ? `Turno ${userGroup}` : '',
    cargoName || '',
    sectorName || ''
  ].filter(Boolean).join(' • ');

  const highlightsHtml = highlights && highlights.length > 0
    ? `<div style="margin-top: 8px; font-size: 11px; color: #78350f;">
        <strong>Destaques:</strong> ${highlights.map(h => `<span style="display: inline-block; background-color: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 9999px; margin: 2px 4px 2px 0; font-weight: 600; font-size: 10px; border: 1px solid #fde68a;">${h}</span>`).join('')}
       </div>`
    : '';

  return `
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 16px rgba(15, 23, 42, 0.08); border: 1px solid #cbd5e1; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 12px 0;">
      
      <!-- Top Accent Bar (Eldorado Green) -->
      <tr>
        <td style="height: 6px; background-color: #059669; font-size: 0; line-height: 0;">&nbsp;</td>
      </tr>

      <!-- Header Section with SecApp Brand -->
      <tr>
        <td style="padding: 24px 28px 18px 28px; background-color: #f0fdf4; border-bottom: 1px solid #e2e8f0;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td>
                <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="background-color: #047857; color: #ffffff; padding: 6px 14px; border-radius: 8px; font-weight: 800; font-size: 15px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; letter-spacing: -0.5px;">
                      🛡️ SecApp
                    </td>
                    <td style="padding-left: 10px; font-size: 11px; font-weight: 700; color: #047857; letter-spacing: 0.5px; text-transform: uppercase;">
                      Eldorado Brasil Celulose
                    </td>
                  </tr>
                </table>
              </td>
              <td align="right">
                <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #059669; background-color: #d1fae5; border: 1px solid #a7f3d0; padding: 4px 10px; border-radius: 20px;">
                  Pesquisa de Avaliação
                </span>
              </td>
            </tr>
          </table>
          
          <div style="margin-top: 14px; font-size: 17px; font-weight: 800; color: #0f172a; letter-spacing: -0.3px;">
            Retorno sobre sua Avaliação no SecApp
          </div>
        </td>
      </tr>

      <!-- Main Body Content -->
      <tr>
        <td style="padding: 24px 28px; background-color: #ffffff;">
          
          <!-- Greeting -->
          <p style="font-size: 15px; margin: 0 0 12px 0; color: #0f172a; font-weight: 500;">
            Olá, <strong style="color: #047857;">${escapedName}</strong>!
          </p>

          <p style="font-size: 13.5px; line-height: 1.6; color: #334155; margin: 0 0 18px 0;">
            Agradecemos imensamente pela sua participação na nossa <strong>Pesquisa de Avaliação do SecApp</strong>. 
            Sua avaliação e seus apontamentos sinceros são fundamentais para que possamos aprimorar continuamente a ferramenta, a agilidade das checagens e a rotina operacional da sua equipe.
          </p>

          ${detailsList ? `
          <div style="font-size: 11px; color: #64748b; margin-bottom: 16px; background-color: #f8fafc; padding: 6px 12px; border-radius: 6px; border: 1px solid #e2e8f0;">
            Identificação: <strong>${detailsList}</strong>
          </div>` : ''}

          <!-- Evaluated Item Box -->
          <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-left: 4px solid #f59e0b; border-radius: 8px; padding: 14px 16px; margin: 0 0 20px 0;">
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td>
                  <span style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #b45309;">
                    📌 Sua Avaliação Registrada:
                  </span>
                </td>
                ${ratingNum > 0 ? `
                <td align="right">
                  <span style="font-size: 14px; font-weight: 800; color: #d97706; letter-spacing: 1px;">
                    ${starsString} (${ratingNum}/5)
                  </span>
                </td>` : ''}
              </tr>
            </table>

            ${escapedObservation ? `
            <div style="margin-top: 10px; font-style: italic; color: #334155; font-size: 13px; line-height: 1.55; background-color: #ffffff; padding: 10px 12px; border-radius: 6px; border: 1px solid #fef3c7;">
              "${escapedObservation}"
            </div>` : `
            <div style="margin-top: 6px; color: #92400e; font-size: 12px; font-style: italic;">
              (Avaliação quantitativa com nota registrada)
            </div>`}

            ${highlightsHtml}
          </div>

          <!-- Management Response Box with Distinct SecApp Emerald Styling -->
          <div style="background-color: #ecfdf5; border: 1px solid #a7f3d0; border-left: 4px solid #059669; border-radius: 10px; padding: 16px 18px; margin: 0 0 22px 0;">
            <div style="font-size: 11.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #065f46; margin-bottom: 10px;">
              💬 Retorno da Gestão / Analisado por: <strong>${senderName}</strong>
            </div>
            <div style="font-size: 13.5px; line-height: 1.65; color: #064e3b; font-weight: 500;">
              ${escapedMessage}
            </div>
          </div>

          <!-- Reassurance / Follow-up -->
          <p style="font-size: 12.5px; line-height: 1.55; color: #64748b; margin: 0 0 22px 0;">
            Continuamos à total disposição para ouvir suas sugestões. Se desejar esclarecer qualquer ponto ou acrescentar novos detalhes, sinta-se à vontade para responder a esta mensagem.
          </p>

          <!-- CTA Button -->
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td align="center">
                <a href="${appUrl}" target="_blank" style="display: inline-block; background-color: #059669; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 13px; font-weight: 700; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; box-shadow: 0 2px 6px rgba(5, 150, 105, 0.25);">
                  Acessar o SecApp
                </a>
              </td>
            </tr>
          </table>

        </td>
      </tr>

      <!-- Corporate Footer -->
      <tr>
        <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 28px; text-align: center;">
          <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: 800; color: #334155; letter-spacing: -0.2px;">
            SecApp • Gestão de Segurança e Operações
          </p>
          <p style="margin: 0 0 4px 0; font-size: 11px; font-weight: 600; color: #059669;">
            Eldorado Brasil Celulose S.A.
          </p>
          <p style="margin: 0; font-size: 10px; color: #94a3b8;">
            Mensagem oficial enviada por ${senderName}${senderEmail ? ` (${senderEmail})` : ''} • Três Lagoas - MS
          </p>
        </td>
      </tr>

    </table>
  `.trim();
}

export function generateSecAppEmailHtml(options: SecAppEmailOptions): string {
  const cardHtml = generateSecAppEmailCardHtml(options);
  const { subject } = options;

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #1e293b;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f1f5f9; padding: 24px 12px;">
    <tr>
      <td align="center">
        ${cardHtml}
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Generates an artistic structured plain-text memo that maintains visual hierarchy
 * and official SecApp identity even in plain text clients or default mailto links.
 */
export function generateSecAppEmailPlainText(options: SecAppEmailOptions): string {
  const {
    toName,
    rating,
    observation,
    replyMessage,
    senderName,
    senderEmail,
    appUrl = 'https://secapp.eldorado.com.br'
  } = options;

  const ratingNum = rating ? Math.max(1, Math.min(5, Math.round(Number(rating)))) : 0;
  const stars = ratingNum > 0 ? '★'.repeat(ratingNum) + '☆'.repeat(5 - ratingNum) + ` (${ratingNum}/5)` : '';

  let body = `════════════════════════════════════════════════════════════\n`;
  body += `  🛡️ SECAPP — ELDORADO BRASIL CELULOSE\n`;
  body += `     Retorno Oficial da Pesquisa de Avaliação\n`;
  body += `════════════════════════════════════════════════════════════\n\n`;

  body += `Olá, ${toName || 'Colaborador'}!\n\n`;
  body += `Agradecemos imensamente pela sua participação na Pesquisa de Avaliação do SecApp. A sua opinião e seus apontamentos são fundamentais para que possamos aprimorar continuamente a ferramenta e apoiar a rotina da sua equipe.\n\n`;

  if (observation || stars) {
    body += `────────────────────────────────────────────────────────────\n`;
    body += `📌 SUA AVALIAÇÃO REGISTRADA ${stars ? `[ ${stars} ]` : ''}:\n`;
    if (observation) {
      body += `"${observation.trim()}"\n`;
    }
    body += `────────────────────────────────────────────────────────────\n\n`;
  }

  body += `💬 RETORNO DA GESTÃO / RESPOSTA:\n`;
  body += `${replyMessage.trim()}\n\n`;

  body += `────────────────────────────────────────────────────────────\n`;
  body += `Continuamos à total disposição para ouvir suas sugestões.\n`;
  body += `Caso deseje acrescentar detalhes, sinta-se à vontade para responder este e-mail.\n\n`;

  body += `Atenciosamente,\n`;
  body += `${senderName}\n`;
  if (senderEmail) body += `${senderEmail}\n`;
  body += `SecApp • Gestão de Segurança e Operações\n`;
  body += `Eldorado Brasil Celulose S.A. • Três Lagoas/MS\n`;
  body += `🌐 Acessar o sistema: ${appUrl}\n`;
  body += `════════════════════════════════════════════════════════════\n`;

  return body;
}

/**
 * Copies rich formatted HTML to the user's clipboard.
 * Uses the clean <table> snippet so that when pasted into Outlook (desktop or web)
 * or Gmail, it renders with full styling, colors, and borders!
 */
export async function copyFormattedEmailToClipboard(options: SecAppEmailOptions): Promise<boolean> {
  const cardHtml = generateSecAppEmailCardHtml(options);
  const text = generateSecAppEmailPlainText(options);

  try {
    if (navigator.clipboard && typeof window.ClipboardItem !== 'undefined') {
      const htmlBlob = new Blob([cardHtml], { type: 'text/html' });
      const textBlob = new Blob([text], { type: 'text/plain' });
      const item = new ClipboardItem({
        'text/html': htmlBlob,
        'text/plain': textBlob
      });
      await navigator.clipboard.write([item]);
      return true;
    }
  } catch (err) {
    console.warn('Navigator clipboard.write failed, trying execCommand fallback:', err);
  }

  // Fallback for older browsers / iframe restrictions using temporary DOM node
  try {
    const container = document.createElement('div');
    container.innerHTML = cardHtml;
    container.style.position = 'fixed';
    container.style.pointerEvents = 'none';
    container.style.opacity = '0';
    container.style.left = '-9999px';
    document.body.appendChild(container);

    const range = document.createRange();
    range.selectNodeContents(container);
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand('copy');
      selection.removeAllRanges();
    }
    document.body.removeChild(container);
    return true;
  } catch (fallbackErr) {
    console.warn('Fallback copy failed, trying plain text:', fallbackErr);
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
}

export interface WebMailOpenOptions {
  /** If true, fills the URL query parameter with ASCII plain text memo. If false (default), keeps body clean for pasting the rich card */
  withPlainTextBody?: boolean;
}

/**
 * Opens Outlook Web (Office 365 / Corporate or Live) compose window.
 * By default leaves the body clean so the user can paste (Ctrl+V) the rich visual card.
 */
export function openOutlookWeb(options: SecAppEmailOptions, openOpts?: WebMailOpenOptions): void {
  const to = options.toEmail || '';
  const subject = options.subject || 'SecApp - Retorno de Avaliação';

  let officeUrl = `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(to)}&subject=${encodeURIComponent(subject)}`;
  if (openOpts?.withPlainTextBody) {
    const body = generateSecAppEmailPlainText(options);
    officeUrl += `&body=${encodeURIComponent(body)}`;
  }

  window.open(officeUrl, '_blank');
}

/**
 * Opens Gmail Web compose window.
 * By default leaves the body clean so the user can paste (Ctrl+V) the rich visual card.
 */
export function openGmailWeb(options: SecAppEmailOptions, openOpts?: WebMailOpenOptions): void {
  const to = options.toEmail || '';
  const subject = options.subject || 'SecApp - Retorno de Avaliação';

  let gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}`;
  if (openOpts?.withPlainTextBody) {
    const body = generateSecAppEmailPlainText(options);
    gmailUrl += `&body=${encodeURIComponent(body)}`;
  }

  window.open(gmailUrl, '_blank');
}

/**
 * Opens default mail app (Outlook desktop, Apple Mail, mobile mail app).
 */
export function openDefaultMailClient(options: SecAppEmailOptions, openOpts?: WebMailOpenOptions): void {
  const to = options.toEmail || '';
  const subject = options.subject || 'SecApp - Retorno de Avaliação';

  let mailtoUrl = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}`;
  if (openOpts?.withPlainTextBody) {
    const body = generateSecAppEmailPlainText(options);
    mailtoUrl += `&body=${encodeURIComponent(body)}`;
  }

  try {
    window.location.href = mailtoUrl;
  } catch {
    window.open(mailtoUrl, '_blank');
  }
}
