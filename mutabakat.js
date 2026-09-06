// ---------------------------------------------------------------------------
// mutabakat.js — reconciliation ("mutabakat") text generation + one-tap
// WhatsApp sharing for both customers and vendors (§67-72). Builds a plain-
// text summary (campaign-by-campaign totals + full open cheque details) and
// hands it to WhatsApp's web share URL, with Web Share API / clipboard-copy
// fallbacks for environments where wa.me can't be opened directly.
// ---------------------------------------------------------------------------
import * as repo from './repo.js';
import * as agg from './aggregate.js';
import * as calc from './calc.js';
import { fmt, formatDate, todayISO, escapeHtml, toast } from './util.js';
import { openSheet, closeSheet } from './ui.js';
import { icon } from './icons.js';

// §72: whenever a cheque appears in a reconciliation, ALL available details
// must be included and none of them silently omitted — always print every
// field, falling back to "—" rather than dropping the line.
function chequeDetailLines(cheque) {
  if (!cheque) return '      (çek detayı bulunamadı)\n';
  const status = calc.chequeDisplayStatus(cheque, todayISO());
  return [
    `      Çek No: ${cheque.chequeNumber || '—'}`,
    `      Banka: ${cheque.bank || '—'}`,
    `      Tarih: ${formatDate(cheque.chequeDate)}`,
    `      Vade: ${formatDate(cheque.dueDate)}`,
    `      Durum: ${status}`
  ].join('\n') + '\n';
}

// ============================================================================
// CUSTOMER MUTABAKAT (§68)
// ============================================================================
export async function buildCustomerMutabakatText(clientId) {
  const client = await repo.getClient(clientId);
  if (!client) return '';
  const aggData = await agg.getClientAggregate(clientId);
  const collections = (await repo.getCollectionsForClient(clientId)).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const cheques = await repo.getChequesForClient(clientId);
  const chequeById = new Map(cheques.map((c) => [c.id, c]));
  const s = aggData.totalSummary;

  let text = `MÜTABAKAT\n`;
  text += `Firma: ${client.name}\n`;
  text += `Tarih: ${formatDate(todayISO())}\n`;

  text += `\nKAMPANYALAR\n`;
  if (aggData.campaigns.length === 0) {
    text += '(kampanya yok)\n';
  } else {
    aggData.campaigns.forEach((c) => {
      const name = c.campaign.name || c.campaign.productName || 'Kampanya';
      text += `\n${name}\n`;
      text += `Dönem: ${formatDate(c.campaign.startDate)} – ${formatDate(c.campaign.endDate)}\n`;
      text += `Satış: ${fmt(c.summary.totalSales)}\n`;
      if (calc.hasAgencyFee(c.campaign)) text += `Ajans Bedeli: ${fmt(c.summary.agencyFee)}\n`;
      text += `Toplam Alacak: ${fmt(c.summary.customerReceivable)}\n`;
      text += `Tahsil Edilen: ${fmt(c.summary.customerCollected)}\n`;
      text += `Kalan: ${fmt(c.summary.customerRemaining)}\n`;
    });
  }

  // §68: every collection listed individually — date, amount, payment type,
  // and full cheque details when the payment type is a cheque.
  text += `\nTAHSİLATLAR\n`;
  if (collections.length === 0) {
    text += '(tahsilat yok)\n';
  } else {
    collections.forEach((col) => {
      text += `${formatDate(col.date)} — ${fmt(col.amount)} — ${col.paymentType}${col.campaignName ? ' — ' + col.campaignName : ''}\n`;
      if (col.paymentType === 'Çek' && col.chequeId) {
        text += chequeDetailLines(chequeById.get(col.chequeId));
      }
    });
  }

  text += `\nTOPLAM\n`;
  text += `Toplam Alacak: ${fmt(s.customerReceivable)}\n`;
  text += `Toplam Tahsilat: ${fmt(s.customerCollected)}\n`;
  text += `Kalan: ${fmt(s.customerRemaining)}\n`;
  if (s.customerExcess > 0) text += `Fazla Tahsilat: ${fmt(s.customerExcess)}\n`;

  return text;
}

// ============================================================================
// VENDOR MUTABAKAT (§69)
// ============================================================================
export async function buildVendorMutabakatText(vendorName) {
  const data = await agg.getVendorAggregate(vendorName);
  const cheques = await repo.getChequesForVendor(vendorName);
  const chequeById = new Map(cheques.map((c) => [c.id, c]));

  let text = `MÜTABAKAT\n`;
  text += `Mecra: ${data.mediaTypes.join(', ') || '—'}\n`;
  text += `Yüklenici: ${vendorName}\n`;
  text += `Tarih: ${formatDate(todayISO())}\n`;

  text += `\nKAMPANYALAR\n`;
  if (data.campaigns.length === 0) {
    text += '(kampanya yok)\n';
  } else {
    data.campaigns.forEach((c) => {
      const name = (c.campaign && (c.campaign.name || c.campaign.productName)) || 'Kampanya';
      text += `\n${name}\n`;
      text += `Müşteri: ${(c.campaign && c.campaign.clientName) || '—'}\n`;
      text += `Ürün: ${(c.campaign && c.campaign.productName) || '—'}\n`;
      text += `Dönem: ${formatDate(c.campaign && c.campaign.startDate)} – ${formatDate(c.campaign && c.campaign.endDate)}\n`;
      text += `Alış: ${fmt(c.purchase)}\n`;
      text += `Ristorno: ${fmt(c.ristorno)}\n`;
      text += `Net Ödenecek: ${fmt(c.netPayable)}\n`;
      text += `Ödenen: ${fmt(c.paid)}\n`;
      text += `Kalan: ${fmt(c.remaining)}\n`;
      text += `Kâr: ${fmt(c.profit)}\n`;
    });
  }

  // §69: every payment listed individually, with full cheque details when applicable.
  text += `\nÖDEMELER\n`;
  const allPayments = data.campaigns.flatMap((c) => c.payments).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  if (allPayments.length === 0) {
    text += '(ödeme yok)\n';
  } else {
    allPayments.forEach((p) => {
      text += `${formatDate(p.date)} — ${fmt(p.amount)} — ${p.paymentType}${p.campaignName ? ' — ' + p.campaignName : ''}\n`;
      if (p.paymentType === 'Çek' && p.chequeId) {
        text += chequeDetailLines(chequeById.get(p.chequeId));
      }
    });
  }

  text += `\nTOPLAM\n`;
  text += `Toplam Borç: ${fmt(data.totalNetPayable)}\n`;
  text += `Toplam Ödenen: ${fmt(data.totalPaid)}\n`;
  text += `Kalan: ${fmt(data.totalRemaining)}\n`;
  if (data.totalExcess > 0) text += `Fazla Ödeme: ${fmt(data.totalExcess)}\n`;

  return text;
}

// ============================================================================
// sharing helpers
// ============================================================================
export function shareToWhatsApp(text) {
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}

export async function shareWithFallback(text) {
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return;
    } catch (e) {
      // user cancelled the native share sheet — fall through to WhatsApp link
    }
  }
  shareToWhatsApp(text);
}

export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Mutabakat metni kopyalandı', 'success');
  } catch (e) {
    toast('Kopyalanamadı', 'error');
  }
}

// ============================================================================
// preview sheet — shown before sending so the user can double-check the text
// ============================================================================
function openPreviewSheet(title, text) {
  const html = `
    <button class="close-x" onclick="H.closeSheet()">✕</button>
    <h2>${escapeHtml(title)}</h2>
    <div class="field"><textarea id="mutabakatText" style="min-height:280px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px;">${escapeHtml(text)}</textarea></div>
    <div class="btn-row">
      <button class="btn primary" style="flex:1" onclick="H.sendMutabakatWhatsApp()">${icon('share', { size: 15, className: 'icon-inline' })} WhatsApp'tan Gönder</button>
    </div>
    <button class="btn small outline" style="width:100%;margin-top:8px;" onclick="H.copyMutabakatText()">Metni Kopyala</button>
  `;
  openSheet(html);
}

export function sendMutabakatWhatsApp() {
  const el = document.getElementById('mutabakatText');
  const text = el ? el.value : '';
  shareToWhatsApp(text);
}

export function copyMutabakatText() {
  const el = document.getElementById('mutabakatText');
  const text = el ? el.value : '';
  copyToClipboard(text);
}

export async function openCustomerMutabakat(clientId) {
  const text = await buildCustomerMutabakatText(clientId);
  const client = await repo.getClient(clientId);
  openPreviewSheet(`Mütabakat — ${client ? client.name : ''}`, text);
}

export async function openVendorMutabakat(vendorName) {
  const text = await buildVendorMutabakatText(vendorName);
  openPreviewSheet(`Mütabakat — ${vendorName}`, text);
}
