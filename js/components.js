// ---------------------------------------------------------------------------
// components.js — reusable HTML-fragment builders shared across screens.
// ---------------------------------------------------------------------------
import { fmt, fmtN, formatDate, escapeHtml, hashColor, initials, jsAttr } from './util.js';
import * as calc from './calc.js';
import { todayISO } from './util.js';
import { icon } from './icons.js';
import { isAdmin } from './cloud/team.js';
import { logoForName } from './logos.js';

// §logos: a curated real-brand logo (see logos.js) replaces the generic
// colored-initials avatar wherever one is available for this exact
// müşteri/yüklenici name — everywhere avatarHtml() is already used (Ana
// Sayfa, Müşteriler, Finans müşteri/yüklenici rows, payment rows), with zero
// call-site changes. Any name without a curated logo falls back to the
// original colored-initials look, unchanged.
export function avatarHtml(name) {
  const logo = logoForName(name);
  if (logo) {
    return `<div class="avatar logo"><img src="${logo}" alt="${escapeHtml(name)}"></div>`;
  }
  return `<div class="avatar" style="background:${hashColor(name)}">${escapeHtml(initials(name))}</div>`;
}

// §home-campaigns: clientName + mediaByType are optional — only the
// redesigned Ana Sayfa (cross-customer list) passes them, so every existing
// call site (Product Detail's own campaign list, already scoped to one
// customer/product) renders byte-identical to before.
export function campaignCardHtml({ campaign, summary, active, clientName, mediaByType }) {
  const displayName = campaign.name || campaign.productName || 'Kampanya';
  const statusChip = active ? `<span class="chip green">Aktif</span>` : `<span class="chip neutral">Pasif</span>`;
  return `
  <div class="campaign-card ${active ? 'active' : 'passive'}" onclick="H.goto('/campaigns/${campaign.id}')">
    <div class="cc-top">
      <div>
        ${clientName ? `<div class="cc-client">${escapeHtml(clientName)}</div>` : ''}
        <div class="cc-name">${escapeHtml(displayName)}</div>
        ${campaign.productName ? `<div class="cc-product">${escapeHtml(campaign.productName)}</div>` : ''}
        <div class="cc-status">${statusChip}</div>
      </div>
      <div class="cc-dates">${formatDate(campaign.startDate)}<br>— ${formatDate(campaign.endDate)}</div>
    </div>
    ${mediaByType && mediaByType.length ? `
    <div class="usage-tags">
      ${mediaByType.map((g) => `<span class="usage-tag"><span onclick="event.stopPropagation();H.goto('/finance/vendor/t/${encodeURIComponent(g.mediaType)}')" style="cursor:pointer;"><b>${escapeHtml(g.mediaType)}</b></span> <span class="vendors">${g.vendors.map((v) => `<span onclick="event.stopPropagation();H.goto('/finance/vendor/${encodeURIComponent(v)}')" style="cursor:pointer;text-decoration:underline;">${escapeHtml(v)}</span>`).join(', ')}</span></span>`).join('')}
    </div>` : ''}
    <div class="cc-main-grid">
      <div class="fi"><span class="label">Satış</span><span class="value">${fmtN(summary.totalSales)}</span></div>
      ${isAdmin() ? `
      <div class="fi"><span class="label">Alış</span><span class="value">${fmtN(summary.totalPurchase)}</span></div>
      <div class="fi amber"><span class="label">Ristorno</span><span class="value">${fmtN(summary.totalRistorno)}</span></div>
      <div class="fi primary"><span class="label">Ajans Ücreti</span><span class="value">${summary.agencyFee > 0 ? fmtN(summary.agencyFee) : '—'}</span></div>
      <div class="fi green"><span class="label">Kâr</span><span class="value">${fmtN(summary.campaignProfit)}</span></div>` : ''}
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
      <div style="display:flex;gap:8px;align-items:flex-start;">
        ${avatarHtml(media.vendor)}
        <div>
          <div class="mr-vendor"><span onclick="event.stopPropagation();H.goto('/finance/vendor/${encodeURIComponent(media.vendor)}')" style="cursor:pointer;">${escapeHtml(media.vendor)}</span></div>
          <div class="mr-work"><span onclick="event.stopPropagation();H.goto('/finance/vendor/t/${encodeURIComponent(media.mediaType)}')" style="cursor:pointer;">${escapeHtml(media.mediaType)}</span> · ${escapeHtml(media.workType)}</div>
        </div>
      </div>
      <div style="display:flex;gap:4px;align-items:center;">
        ${calc.isTV(media.mediaType) ? '<span class="chip amber">TV</span>' : ''}
        ${vatBadge(media.vatRate)}
      </div>
    </div>
    <div class="mr-grid"${isAdmin() ? '' : ' style="grid-template-columns:1fr;"'}>
      <div class="fi"><span class="label">Satış</span><span class="value">${fmtN(media.sales)}</span></div>
      ${isAdmin() ? `
      <div class="fi"><span class="label">Alış</span><span class="value">${fmtN(media.purchase)}</span></div>
      <div class="fi amber"><span class="label">Ristorno</span><span class="value">${fmtN(ristorno)}</span></div>` : ''}
    </div>
    <div class="mr-grid" style="margin-top:4px;">
      <div class="fi"><span class="label">Net Ödenecek (KDV Hariç)</span><span class="value">${fmtN(net)}</span></div>
      <div class="fi"><span class="label">Ödenen${group.shared ? ' (grup)' : ''}</span><span class="value">${groupPaid != null ? fmtN(groupPaid) : '—'}</span></div>
      <div class="fi"><span class="label">Kalan${group.shared ? ' (grup)' : ''}</span><span class="value">${groupRemaining != null ? fmtN(groupRemaining) : '—'}</span></div>
    </div>
    ${isAdmin() ? `
    <div class="mr-grid" style="margin-top:4px;grid-template-columns:1fr;">
      <div class="fi green" style="text-align:left;"><span class="label">Kâr</span><span class="value" style="font-size:12.5px;">${fmtN(profit)}</span></div>
    </div>` : ''}
    <button class="btn small outline" style="width:100%;margin-top:8px;" onclick="event.stopPropagation();H.openMediaForm('${media.campaignId}','${media.id}')">${icon('pencil', { size: 13, className: 'icon-inline' })} Alış / Satış / Ristorno / Tarih Düzenle</button>
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
    'Elde': 'cyan', 'Kullanıldı': 'cyan', 'Vadesi Gelen': 'amber',
    'Ödendi': 'green', 'Karşılıksız': 'red', 'İptal': 'gray'
  };
  return `<span class="chip ${map[status] || 'neutral'}">${status}</span>`;
}

// Short "→ nereye/kime verildi" fragment shown wherever a cheque row is
// listed (the CURRENT holder — last entry of the movement history), so
// where a cheque ended up is visible without opening it.
export function chequeUsedFragment(cheque) {
  const last = (cheque.movements && cheque.movements.length) ? cheque.movements[cheque.movements.length - 1] : null;
  return last ? calc.chequeMovementLabel(last) : '';
}

// `onDelete(cheque)` is optional — pass it to get an inline "✕" delete
// button on the row itself, matching payRowHtml's pattern, so a cheque can
// be removed from wherever it's listed (client/campaign/vendor pages, the
// Çekler list) — not only from its own detail page.
export function chequeRowHtml(cheque, { onDelete, urgent } = {}) {
  const who = cheque.counterpartyName || '—';
  const usedFrag = chequeUsedFragment(cheque);
  return `
  <div class="row-card${urgent ? ' urgent' : ''}" onclick="H.goto('/finance/cheques/${cheque.id}')">
    ${avatarHtml(who)}
    <div class="info">
      <div class="name">${escapeHtml(who)}</div>
      <div class="sub">
        <span>Vade ${formatDate(cheque.dueDate)}</span>
        ${cheque.campaignName ? `<span>· ${escapeHtml(cheque.campaignName)}</span>` : ''}
        ${usedFrag ? `<span>· → ${escapeHtml(usedFrag)}</span>` : ''}
      </div>
    </div>
    <div class="right-col">
      <div class="big">${fmt(cheque.amount)}</div>
      <div class="small">${chequeStatusChip(cheque)}</div>
    </div>
    ${onDelete ? `<button class="pay-del" onclick="event.stopPropagation();${onDelete(cheque)}">${icon('x', { size: 13 })}</button>` : ''}
  </div>`;
}

// §takip: Takip (reminders) sayfasındaki tek satır — vadesi yaklaşan bir çek
// ya da bitişi yaklaşan bir kampanya. `onDismiss` verilirse sağda küçük bir
// X çıkar (chequeRowHtml/payRowHtml'deki aynı .pay-del düğmesi), o satırı
// kalıcı olarak kapatır.
export function reminderRowHtml(r, { onDismiss } = {}) {
  const iconName = r.type === 'cheque' ? 'receipt' : (r.type === 'appointment' ? 'calendar' : 'megaphone');
  return `
  <div class="row-card${r.overdue ? ' urgent' : ''}" onclick="H.goto('${r.link}')">
    <div class="avatar" style="background:${r.overdue ? 'var(--rose-bg)' : 'var(--bg-soft)'};color:${r.overdue ? 'var(--rose-dark)' : 'var(--primary-dark)'}">${icon(iconName, { size: 16 })}</div>
    <div class="info">
      <div class="name">${escapeHtml(r.title)}</div>
      <div class="sub">
        <span>${r.overdue ? 'Vadesi geçti · ' + formatDate(r.date) : formatDate(r.date)}</span>
        ${r.subtitle ? `<span>· ${escapeHtml(r.subtitle)}</span>` : ''}
      </div>
    </div>
    ${r.amount != null ? `<div class="right-col"><div class="big">${fmt(r.amount)}</div></div>` : ''}
    ${onDismiss ? `<button class="pay-del" onclick="event.stopPropagation();${onDismiss(r)}">${icon('x', { size: 13 })}</button>` : ''}
  </div>`;
}

// ---- VAT / KDV display -------------------------------------------------------
// Renders a detail-row whose value has a small secondary line: either the
// "KDV Dahil" inclusive amount (when a rate is set) or a subtle "KDV Hariç"
// label (when it isn't). The net (VAT-exclusive) amount is always the
// prominent, primary figure — VAT is always secondary/informational (§55.3).
export function vatDetailRow(label, netAmount, vatRate, rowClass = '') {
  const rate = vatRate === '' || vatRate == null ? null : Number(vatRate);
  // §kdv-tutari: kullanıcı, ödenecek/tahsil edilecek KDV'nin kendisini
  // (sadece vergi payını) ayrı ve açık bir kalem olarak görmek istedi — daha
  // önce sadece "KDV Dahil toplam" gösteriliyordu, verginin kendisi hiçbir
  // yerde ayrıca yazmıyordu. calc.vatAmount() zaten doğru hesaplıyordu, burada
  // sadece görünür kılındı; mevcut "KDV Dahil" satırı KALDIRILMADI, yanına
  // eklendi.
  const sub = rate
    ? `<div class="vat-sub vat-on">%${rate} KDV Tutarı: <b>${fmt(calc.vatAmount(netAmount, rate))}</b> · KDV Dahil Toplam: <b>${fmt(calc.vatInclusive(netAmount, rate))}</b></div>`
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

// ---- künye (şirket profili) kartı --------------------------------------------
// Müşteri ve Mecra/Yüklenici detay sayfalarında ortak kullanılan salt-okunur
// künye kartı — Fatura Adresi, Adres, VKN, IBAN (VKN/IBAN yanında panoya
// kopyalama düğmesiyle) ve varsa kaşe fotoğrafı. `entity` hiçbir künye alanı
// doldurulmamışsa (yeni/eski kayıt) kart hiç basılmaz — mevcut sayfa
// düzenine hiçbir boş alan eklenmez.
export function kunyeCardHtml(entity) {
  if (!entity) return '';
  const { billingAddress, address, vkn, iban, stampPhoto } = entity;
  if (!billingAddress && !address && !vkn && !iban && !stampPhoto) return '';
  return `
  <div class="detail-card">
    <h3>${icon('receipt', { size: 15, className: 'icon-inline' })} Künye</h3>
    ${billingAddress ? `<div class="detail-row stacked"><span class="k">Fatura Adresi</span><span class="v" style="white-space:pre-wrap;">${escapeHtml(billingAddress)}</span></div>` : ''}
    ${address ? `<div class="detail-row stacked"><span class="k">Adres</span><span class="v" style="white-space:pre-wrap;">${escapeHtml(address)}</span></div>` : ''}
    ${vkn ? `<div class="detail-row"><span class="k">VKN</span><span class="v" style="display:flex;align-items:center;gap:6px;">${escapeHtml(vkn)}<button type="button" class="copy-btn" onclick="event.stopPropagation();H.copyToClipboard('${jsAttr(vkn)}')" title="Kopyala">${icon('copy', { size: 13 })}</button></span></div>` : ''}
    ${iban ? `<div class="detail-row"><span class="k">IBAN</span><span class="v" style="display:flex;align-items:center;gap:6px;">${escapeHtml(iban)}<button type="button" class="copy-btn" onclick="event.stopPropagation();H.copyToClipboard('${jsAttr(iban)}')" title="Kopyala">${icon('copy', { size: 13 })}</button></span></div>` : ''}
    ${stampPhoto ? `<div class="field" style="margin-top:6px;"><label>Kaşe</label>${photoGalleryHtml([stampPhoto])}</div>` : ''}
  </div>`;
}

// ---- fatura / dekont (invoice attachment) ------------------------------------
// Müşteri/Mecra Finans kartlarındaki basit fatura-dekont ekleme alanı — çek
// satırının (chequeRowHtml) sadeleştirilmiş hâli: hareket geçmişi yok,
// satıra tıklanınca aynı form hem görüntüleme hem düzenleme için açılır,
// satırdaki ✕ ile doğrudan silinebilir (openInvoiceForm/deleteInvoiceUI —
// screens-forms.js).
export function invoiceRowHtml(inv, { onClick, onDelete } = {}) {
  const dirLabel = inv.direction === 'alinan' ? 'Aldığımız' : 'Kestiğimiz';
  const dirChip = inv.direction === 'alinan' ? 'amber' : 'cyan';
  return `
  <div class="row-card" onclick="${onClick(inv)}">
    <div class="avatar" style="background:var(--bg-soft);color:var(--primary-dark)">${icon('receipt', { size: 16 })}</div>
    <div class="info">
      <div class="name">${escapeHtml(inv.no || 'Fatura/Dekont')} <span class="chip ${dirChip}">${dirLabel}</span></div>
      <div class="sub">
        ${inv.date ? `<span>${formatDate(inv.date)}</span>` : ''}
        ${inv.amount ? `<span>· ${fmt(inv.amount)}</span>` : ''}
        ${inv.photos && inv.photos.length ? `<span>· ${inv.photos.length} foto</span>` : ''}
      </div>
    </div>
    ${onDelete ? `<button class="pay-del" onclick="event.stopPropagation();${onDelete(inv)}">${icon('x', { size: 13 })}</button>` : ''}
  </div>`;
}

// ---- randevu / toplantı satırı ------------------------------------------------
// Randevu Ajandası'nın ana ve geçmiş listelerinde ortak satır — çek/ödeme
// satırlarıyla aynı row-card deseni. Tıklanınca detay sayfasına gider
// (düzenleme oradaki ayrı kalem düğmesinden); satırdaki ✕ ile de doğrudan
// silinebilir.
export function appointmentRowHtml(a, { onClick, onDelete } = {}) {
  return `
  <div class="row-card" onclick="${onClick(a)}">
    ${avatarHtml(a.person || a.subject || '?')}
    <div class="info">
      <div class="name">${escapeHtml(a.subject || a.person || 'Randevu')}</div>
      <div class="sub">
        <span>${formatDate(a.date)}${a.time ? ' · ' + escapeHtml(a.time) : ''}</span>
        ${a.person && a.subject ? `<span>· ${escapeHtml(a.person)}</span>` : ''}
      </div>
    </div>
    ${onDelete ? `<button class="pay-del" onclick="event.stopPropagation();${onDelete(a)}">${icon('x', { size: 13 })}</button>` : ''}
  </div>`;
}

// Fatura/dekont bölümünün tamamı (başlık + "+ Ekle" + liste) — müşteri ve
// mecra finans sayfalarında birebir aynı şekilde kullanılır, sadece
// entityType ('client'|'vendor') / entityId farklı.
export function invoiceSectionHtml(list, entityType, entityId) {
  let html = `<div class="section-title">Fatura / Dekont <span class="link" onclick="H.openInvoiceForm('${entityType}','${jsAttr(entityId)}')">+ Ekle</span></div>`;
  if (!list.length) {
    html += emptyState(icon('receipt', { size: 32 }), 'Henüz fatura/dekont eklenmedi', 'Kestiğin veya aldığın fatura ya da dekontu buradan ekle.');
  } else {
    const sorted = [...list].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    html += sorted.map((inv) => invoiceRowHtml(inv, {
      onClick: (i) => `H.openInvoiceForm('${entityType}','${jsAttr(entityId)}','${i.id}')`,
      onDelete: (i) => `H.deleteInvoiceUI('${i.id}')`
    })).join('');
  }
  return html;
}
