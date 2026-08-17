// ---------------------------------------------------------------------------
// components.js — reusable HTML-fragment builders shared across screens.
// ---------------------------------------------------------------------------
import { fmt, fmtN, formatDate, escapeHtml, hashColor, initials, jsAttr } from './util.js';
import * as calc from './calc.js';
import { todayISO } from './util.js';
import { icon } from './icons.js';

export function avatarHtml(name) {
  return `<div class="avatar" style="background:${hashColor(name)}">${escapeHtml(initials(name))}</div>`;
}

export function campaignCardHtml({ campaign, summary, active }) {
  const displayName = campaign.name || campaign.productName || 'Kampanya';
  const statusChip = active ? `<span class="chip green">Aktif</span>` : `<span class="chip neutral">Pasif</span>`;
  return `
  <div class="campaign-card ${active ? 'active' : 'passive'}" onclick="H.goto('/campaigns/${campaign.id}')">
    <div class="cc-top">
      <div>
        <div class="cc-name">${escapeHtml(displayName)}</div>
        ${campaign.productName ? `<div class="cc-product">${escapeHtml(campaign.productName)}</div>` : ''}
        <div class="cc-status">${statusChip}</div>
      </div>
      <div class="cc-dates">${formatDate(campaign.startDate)}<br>— ${formatDate(campaign.endDate)}</div>
    </div>
    <div class="cc-main-grid">
      <div class="fi"><span class="label">Satış</span><span class="value">${fmtN(summary.totalSales)}</span></div>
      <div class="fi"><span class="label">Alış</span><span class="value">${fmtN(summary.totalPurchase)}</span></div>
      <div class="fi amber"><span class="label">Ristorno</span><span class="value">${fmtN(summary.totalRistorno)}</span></div>
      <div class="fi primary"><span class="label">Ajans Ücreti</span><span class="value">${summary.agencyFee > 0 ? fmtN(summary.agencyFee) : '—'}</span></div>
      <div class="fi green"><span class="label">Kâr</span><span class="value">${fmtN(summary.campaignProfit)}</span></div>
      <div class="fi"><span class="label">Kalan</span><span class="value">${fmtN(summary.customerRemaining)}</span></div>
    </div>
  </div>`;
}

// §65: campaign media breakdown rows must show, at minimum, Media Type,
// Vendor, Work Type, Purchase, Sales, Ristorno, Net Payable, Paid, Remaining,
// Profit. Paid/Remaining are tracked at (campaign, vendor) group level (spec
// §23/§62 — a vendor payment covers the whole group, not one media line), so
// the caller passes the group's paid/remaining in `group`; every media row
// from the same vendor within a campaign shows that shared figure.
export function mediaRowHtml(media, group = {}) {
  const ristorno = calc.mediaRistorno(media);
  const net = calc.mediaNetPayable(media);
  const profit = calc.mediaProfit(media);
  const groupPaid = group.paid != null ? group.paid : null;
  const groupRemaining = group.remaining != null ? group.remaining : null;
  return `
  <div class="media-row" onclick="H.goto('/media/${media.id}')">
    <div class="mr-top">
      <div>
        <div class="mr-vendor"><span onclick="event.stopPropagation();H.goto('/finance/vendor/${encodeURIComponent(media.vendor)}')" style="cursor:pointer;">${escapeHtml(media.vendor)}</span></div>
        <div class="mr-work"><span onclick="event.stopPropagation();H.goto('/finance/vendor/t/${encodeURIComponent(media.mediaType)}')" style="cursor:pointer;">${escapeHtml(media.mediaType)}</span> · ${escapeHtml(media.workType)}</div>
      </div>
      <div style="display:flex;gap:4px;">
        ${calc.isTV(media.mediaType) ? '<span class="chip amber">TV</span>' : ''}
        ${vatBadge(media.vatRate)}
      </div>
    </div>
    <div class="mr-grid">
      <div class="fi"><span class="label">Satış</span><span class="value">${fmtN(media.sales)}</span></div>
      <div class="fi"><span class="label">Alış</span><span class="value">${fmtN(media.purchase)}</span></div>
      <div class="fi amber"><span class="label">Ristorno</span><span class="value">${fmtN(ristorno)}</span></div>
    </div>
    <div class="mr-grid" style="margin-top:4px;">
      <div class="fi"><span class="label">Net Ödenecek</span><span class="value">${fmtN(net)}</span></div>
      <div class="fi"><span class="label">Ödenen${group.shared ? ' (grup)' : ''}</span><span class="value">${groupPaid != null ? fmtN(groupPaid) : '—'}</span></div>
      <div class="fi"><span class="label">Kalan${group.shared ? ' (grup)' : ''}</span><span class="value">${groupRemaining != null ? fmtN(groupRemaining) : '—'}</span></div>
    </div>
    <div class="mr-grid" style="margin-top:4px;grid-template-columns:1fr;">
      <div class="fi green" style="text-align:left;"><span class="label">Kâr</span><span class="value" style="font-size:12.5px;">${fmtN(profit)}</span></div>
    </div>
  </div>`;
}

export function payRowHtml(p, { onDelete, showTarget, onClick } = {}) {
  const iconName = p.paymentType === 'Çek' ? 'receipt' : (p.paymentType === 'Nakit' ? 'banknote' : (p.paymentType === 'Vadeli' ? 'clock' : 'landmark'));
  return `
  <div class="pay-row" ${onClick ? `onclick="${onClick(p)}"` : ''}>
    <div class="pay-thumb">${icon(iconName, { size: 18 })}</div>
    <div class="pay-info">
      <div class="pay-tutar">${fmt(p.amount)}</div>
      <div class="pay-meta">
        <span>${formatDate(p.date)}</span>
        <span>·</span>
        <span>${escapeHtml(p.paymentType)}</span>
        ${showTarget ? `<span>·</span><span>${escapeHtml(showTarget(p))}</span>` : ''}
        ${p.note ? `<span>·</span><span>${escapeHtml(p.note)}</span>` : ''}
      </div>
    </div>
    ${onDelete ? `<button class="pay-del" onclick="event.stopPropagation();${onDelete(p)}">✕</button>` : ''}
  </div>`;
}

export function chequeStatusChip(cheque) {
  const status = calc.chequeDisplayStatus(cheque, todayISO());
  const map = {
    'Alındı': 'cyan', 'Verildi': 'cyan', 'Vadesi Gelen': 'amber',
    'Ödendi': 'green', 'Karşılıksız': 'red', 'İptal': 'gray'
  };
  return `<span class="chip ${map[status] || 'neutral'}">${status}</span>`;
}

export function chequeRowHtml(cheque) {
  const who = cheque.counterpartyName || '—';
  return `
  <div class="row-card" onclick="H.goto('/finance/cheques/${cheque.id}')">
    ${avatarHtml(who)}
    <div class="info">
      <div class="name">${escapeHtml(who)}</div>
      <div class="sub">
        <span>Vade ${formatDate(cheque.dueDate)}</span>
        ${cheque.campaignName ? `<span>· ${escapeHtml(cheque.campaignName)}</span>` : ''}
      </div>
    </div>
    <div class="right-col">
      <div class="big">${fmt(cheque.amount)}</div>
      <div class="small">${chequeStatusChip(cheque)}</div>
    </div>
  </div>`;
}

// ---- VAT / KDV display -------------------------------------------------------
// Renders a detail-row whose value has a small secondary line: either the
// "KDV Dahil" inclusive amount (when a rate is set) or a subtle "KDV Hariç"
// label (when it isn't). The net (VAT-exclusive) amount is always the
// prominent, primary figure — VAT is always secondary/informational (§55.3).
export function vatDetailRow(label, netAmount, vatRate, rowClass = '') {
  const rate = vatRate === '' || vatRate == null ? null : Number(vatRate);
  const sub = rate
    ? `<div class="vat-sub vat-on">%${rate} KDV → <b>${fmt(calc.vatInclusive(netAmount, rate))}</b> KDV Dahil</div>`
    : `<div class="vat-sub vat-off">KDV Hariç</div>`;
  return `
  <div class="detail-row stacked ${rowClass}">
    <span class="k">${label}</span>
    <span class="v-wrap"><span class="v">${fmt(netAmount)}</span>${sub}</span>
  </div>`;
}

export function vatBadge(vatRate) {
  const rate = vatRate === '' || vatRate == null ? null : Number(vatRate);
  return rate ? `<span class="chip amber">KDV %${rate}</span>` : '';
}

export function emptyState(emoji, title, sub, actionHtml) {
  // `sub` and `actionHtml` are wrapped in their own block-level tags so they
  // always stack on separate lines. Previously `sub` was a bare inline text
  // node sitting directly next to the (inline-block) action button — on
  // narrow mobile widths that wrapped onto its own line by accident, but on
  // wide desktop screens there was room for both on one line, so the hint
  // text and the button visually ran into each other.
  return `<div class="empty-state"><span class="emoji">${emoji}</span><b>${escapeHtml(title)}</b>${sub ? `<p>${escapeHtml(sub)}</p>` : ''}${actionHtml || ''}</div>`;
}

// ---- multi-photo strip (up to `max` receipt/cheque images) ------------------
// Generic renderer shared by every photo-capable form (tahsilat, ödeme, çek).
// `onRemove(i)` / `onView(src)` return literal onclick JS strings so callers
// can route removes/views to whichever module-level state they're using.
export function photoStripHtml(photos, { onRemove, onView, max = 3 } = {}) {
  const list = photos || [];
  const thumbs = list.map((src, i) => `
    <div class="photo-thumb">
      <img src="${src}" onclick="${onView(jsAttr(src))}">
      <button type="button" class="rm" onclick="event.stopPropagation();${onRemove(i)}">${icon('x', { size: 12 })}</button>
    </div>`).join('');
  if (!list.length) return '';
  return `<div class="photo-strip">${thumbs}</div>${list.length >= max ? `<p class="hint" style="margin-top:6px;">En fazla ${max} fotoğraf eklenebilir.</p>` : ''}`;
}

// Read-only photo gallery (detail pages) — same grid, no remove button.
export function photoGalleryHtml(photos) {
  const list = photos || [];
  if (!list.length) return '';
  return `<div class="photo-strip">${list.map((src) => `<div class="photo-thumb"><img src="${src}" onclick="H.viewPhotoDataUrl('${jsAttr(src)}')"></div>`).join('')}</div>`;
}
