// ---------------------------------------------------------------------------
// screens-finance.js — Finans (Müşteri / Mecra / Çekler) + Mecralar (Media/
// Vendor hierarchy) + TV Yıllık Ristorno screens.
// ---------------------------------------------------------------------------
import * as repo from './repo.js';
import * as calc from './calc.js';
import * as agg from './aggregate.js';
import { fmt, fmtN, formatDate, escapeHtml, jsAttr, todayISO, toast, confirmAction } from './util.js';
import { setTopbar, setContent, setActiveNav, setFabVisible, navigate, refresh, openSheet, closeSheet, openLightbox } from './ui.js';
import { avatarHtml, payRowHtml, chequeRowHtml, chequeStatusChip, emptyState, photoStripHtml, photoGalleryHtml } from './components.js';
import { icon } from './icons.js';

function tabStrip(active) {
  return `<div class="tab-strip">
    <button class="${active === 'customer' ? 'active' : ''}" onclick="H.goto('/finance/customer')">Müşteri</button>
    <button class="${active === 'vendor' ? 'active' : ''}" onclick="H.goto('/finance/vendor')">Mecra</button>
    <button class="${active === 'cheques' ? 'active' : ''}" onclick="H.goto('/finance/cheques')">Çekler</button>
  </div>`;
}

function financeTopbar(title) {
  setTopbar(`<div class="left"><div><h1>Finans</h1><div class="sub">${title}</div></div></div>`);
}

export async function renderFinanceHome() {
  navigate('/finance/customer');
}

// ============================================================================
// FINANS → MÜŞTERİ
// ============================================================================
export async function renderFinanceCustomerList() {
  setActiveNav('finance');
  setFabVisible(true);
  financeTopbar('Müşteri');
  setContent(`<div class="list-loading">Yükleniyor…</div>`);

  const { clients, totals } = await agg.getFinanceCustomerTotals();
  clients.sort((a, b) => b.totalSummary.customerRemaining - a.totalSummary.customerRemaining);

  let html = tabStrip('customer');
  html += `
    <div class="summary-strip">
      <div class="si"><div class="label">Toplam Alacak</div><div class="value">${fmtN(totals.receivable)}</div></div>
      <div class="si green"><div class="label">Tahsil Edilen</div><div class="value">${fmtN(totals.collected)}</div></div>
      <div class="si red"><div class="label">Kalan</div><div class="value">${fmtN(totals.remaining)}</div></div>
    </div>
  `;

  if (clients.length === 0) {
    html += emptyState(icon('creditCard', { size: 32 }), 'Henüz finansal kayıt yok', 'Müşteri ekleyip kampanya oluşturduğunda burada görünecek.');
  } else {
    html += clients.map((c) => `
      <div class="row-card" onclick="H.goto('/finance/customer/${c.client.id}')">
        ${avatarHtml(c.client.name)}
        <div class="info">
          <div class="name">${escapeHtml(c.client.name)}</div>
          <div class="sub">Alacak ${fmtN(c.totalSummary.customerReceivable)} · Tahsil ${fmtN(c.totalSummary.customerCollected)}</div>
        </div>
        <div class="right-col">
          <div class="big">${fmt(c.totalSummary.customerRemaining)}</div>
          <div class="small">kalan</div>
        </div>
      </div>
    `).join('');
  }

  setContent(html);
}

export async function renderFinanceCustomerDetail({ clientId }) {
  setActiveNav('finance');
  setFabVisible(false);
  const client = await repo.getClient(clientId);
  if (!client) { navigate('/finance/customer'); return; }

  setTopbar(`
    <div class="left">
      <button class="back" onclick="H.goto('/finance/customer')">${icon('chevronLeft')}</button>
      <div><h1>${escapeHtml(client.name)}</h1><div class="sub">Finans · Müşteri</div></div>
    </div>
    <div class="right"><button class="icon-btn add" onclick="H.openCollectionForm({clientId:'${client.id}'})">${icon('plus')}</button></div>
  `);
  setContent(`<div class="list-loading">Yükleniyor…</div>`);

  const [aggData, collections, clientCheques] = await Promise.all([
    agg.getClientAggregate(clientId),
    repo.getCollectionsForClient(clientId),
    repo.getChequesForClient(clientId)
  ]);
  const s = aggData.totalSummary;

  let html = `
    <div class="summary-strip">
      <div class="si"><div class="label">Alacak</div><div class="value">${fmtN(s.customerReceivable)}</div></div>
      <div class="si green"><div class="label">Tahsil</div><div class="value">${fmtN(s.customerCollected)}</div></div>
      <div class="si red"><div class="label">Kalan</div><div class="value">${fmtN(s.customerRemaining)}</div></div>
    </div>
  `;
  if (s.customerExcess > 0) html += `<div class="note-box"><b>Fazla Tahsilat</b>${fmt(s.customerExcess)}</div>`;

  html += `<button class="btn primary" onclick="H.openCollectionForm({clientId:'${client.id}'})">+ Tahsilat Ekle</button>`;
  html += `<button class="btn small outline" style="margin-top:8px;" onclick="H.openCustomerMutabakat('${client.id}')">${icon('share', { size: 15 })} Mütabakat Gönder</button>`;

  html += `<div class="section-title">Kampanyalar</div>`;
  if (aggData.campaigns.length === 0) {
    html += emptyState(icon('megaphone', { size: 32 }), 'Kampanya yok', '');
  } else {
    html += aggData.campaigns.map((c) => `
      <div class="detail-card" style="cursor:pointer;" onclick="H.goto('/campaigns/${c.campaign.id}')">
        <div class="detail-row"><span class="k" style="font-weight:800;color:var(--ink);">${escapeHtml(c.campaign.name || c.campaign.productName)}</span><span class="v">${c.active ? '<span class=\"chip green\">Aktif</span>' : '<span class=\"chip neutral\">Pasif</span>'}</span></div>
        <div class="detail-row"><span class="k">Alacak</span><span class="v">${fmt(c.summary.customerReceivable)}</span></div>
        <div class="detail-row green"><span class="k">Tahsil</span><span class="v">${fmt(c.summary.customerCollected)}</span></div>
        <div class="detail-row red"><span class="k">Kalan</span><span class="v">${fmt(c.summary.customerRemaining)}</span></div>
      </div>
    `).join('');
  }

  html += `<div class="section-title">Son Tahsilatlar</div>`;
  if (collections.length === 0) {
    html += emptyState(icon('banknote', { size: 32 }), 'Henüz tahsilat yok', '');
  } else {
    const sorted = [...collections].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    html += sorted.map((c) => payRowHtml(c, {
      onClick: (cc) => `H.openCollectionDetail('${cc.id}')`,
      showTarget: (cc) => cc.campaignName,
      onDelete: (cc) => `H.deleteCollection('${cc.id}')`
    })).join('');
  }

  // §73: cheques tied to this customer, cross-visible from Finans → Müşteri too.
  if (clientCheques.length > 0) {
    html += `<div class="section-title">Çekler</div>`;
    const sortedCheques = [...clientCheques].sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
    html += sortedCheques.map((c) => chequeRowHtml(c)).join('');
  }

  setContent(html);
}

// ============================================================================
// FINANS → MECRA  (Media Type → Vendor → Campaign → Financial Activity, §58-61)
// ============================================================================
// Shared body for the Media/Vendor hierarchy (§58-59) — used by BOTH the
// standalone "Mecralar" top-level tab AND the nested Finans → Mecra tab
// (§62 explicitly wants both as separate entry points to the same data).
function mediaTypeCardHtml(t) {
  return `
    <div class="mtype-card" onclick="H.goto('/finance/vendor/t/${encodeURIComponent(t.mediaType)}')">
      <div class="mtype-top">
        <div>
          <div class="mtype-name">${escapeHtml(t.mediaType)}</div>
          <div class="mtype-meta">${t.vendorCount} yüklenici · ${t.activeCampaignCount} aktif kampanya</div>
        </div>
        <div class="chev">${icon('chevronRight', { size: 16 })}</div>
      </div>
      <div class="mtype-grid">
        <div class="fi"><span class="label">Alış</span><span class="value">${fmtN(t.totalPurchase)}</span></div>
        <div class="fi"><span class="label">Satış</span><span class="value">${fmtN(t.totalSales)}</span></div>
        <div class="fi amber"><span class="label">Ristorno</span><span class="value">${fmtN(t.totalRistorno)}</span></div>
      </div>
      <div class="mtype-grid" style="margin-top:6px;">
        <div class="fi"><span class="label">Borç</span><span class="value">${fmtN(t.totalNetPayable)}</span></div>
        <div class="fi"><span class="label">Ödenen</span><span class="value">${fmtN(t.totalPaid)}</span></div>
        <div class="fi red"><span class="label">Kalan</span><span class="value">${fmtN(t.totalRemaining)}</span></div>
      </div>
    </div>
  `;
}

async function vendorHierarchyBody() {
  const [{ vendors, totals }, allPayments, typeOverview] = await Promise.all([
    agg.getFinanceVendorTotals(),
    repo.getAllPayments(),
    agg.getMediaTypeOverview()
  ]);

  let html = `
    <div class="summary-strip">
      <div class="si"><div class="label">Toplam Borç</div><div class="value">${fmtN(totals.debt)}</div></div>
      <div class="si green"><div class="label">Ödenen</div><div class="value">${fmtN(totals.paid)}</div></div>
      <div class="si red"><div class="label">Kalan</div><div class="value">${fmtN(totals.remaining)}</div></div>
    </div>
  `;

  // §58-59: primary view is Mecra Türü (Media Type) → Yüklenici (Vendor), not
  // a flat vendor list — this is the whole point of the new hierarchy.
  html += `<div class="section-title">Mecra Türleri <span class="link" onclick="H.openPaymentForm({})">+ Ödeme Ekle</span></div>`;
  if (typeOverview.length === 0) {
    html += emptyState(icon('monitor', { size: 32 }), 'Henüz mecra kaydı yok', 'Bir kampanyaya mecra/yüklenici eklediğinde burada görünecek.');
  } else {
    html += typeOverview.map(mediaTypeCardHtml).join('');
  }

  if (vendors.length > 0) {
    html += `<div class="section-title">Tüm Yükleniciler</div>`;
    html += `<div class="pills">` + vendors.map((v) => `<button class="pill" onclick="H.goto('/finance/vendor/${encodeURIComponent(v.vendor)}')">${escapeHtml(v.vendor)}</button>`).join('') + `</div>`;
  }

  // TV Yıllık Ristorno lives here — a Mecra tool, reached from Mecralar
  // (formerly nested under the now-removed "Diğer" section, §10-11).
  html += `
    <div class="row-card" onclick="H.goto('/mecra/tv')">
      <div class="avatar" style="background:#F59E0B">${icon('calendar', { size: 18 })}</div>
      <div class="info"><div class="name">TV Yıllık Ristorno</div><div class="sub">Yıllık TV ristorno hesaplama ve mutabakat</div></div>
      <div class="chev">${icon('chevronRight', { size: 16 })}</div>
    </div>
  `;

  html += `<div class="section-title">Ödeme Listesi</div>`;
  const sorted = [...allPayments].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (sorted.length === 0) {
    html += emptyState(icon('landmark', { size: 32 }), 'Henüz ödeme yok', 'Sağ üstteki + ile bir mecra/yükleniciye ödeme ekle.');
  } else {
    html += sorted.map((p) => `
      <div class="pay-row" onclick="H.openPaymentDetail('${p.id}')">
        <div class="pay-thumb">${icon(p.paymentType === 'Çek' ? 'receipt' : (p.paymentType === 'Nakit' ? 'banknote' : 'landmark'), { size: 18 })}</div>
        <div class="pay-info">
          <div class="pay-tutar">${fmt(p.amount)}</div>
          <div class="pay-meta">
            <span>${formatDate(p.date)}</span><span>·</span>
            <span onclick="event.stopPropagation();H.goto('/finance/vendor/${encodeURIComponent(p.vendor)}')" style="text-decoration:underline;">${escapeHtml(p.vendor)}</span>
            <span>·</span><span>${escapeHtml(p.campaignName || '')}</span>
          </div>
        </div>
        <button class="pay-del" onclick="event.stopPropagation();H.deletePayment('${p.id}')">${icon('x', { size: 13 })}</button>
      </div>
    `).join('');
  }
  return html;
}

// §58/62: standalone top-level "Mecralar" area — same underlying data/screens
// as Finans → Mecra, reached from the bottom nav instead of nested in Finans.
export async function renderMecraHome() {
  setActiveNav('mecra');
  setFabVisible(true);
  setTopbar(`
    <div class="left"><h1>Mecralar</h1></div>
    <div class="right"><button class="icon-btn add" onclick="H.openPaymentForm({})">${icon('plus')}</button></div>
  `);
  setContent(`<div class="list-loading">Yükleniyor…</div>`);
  setContent(await vendorHierarchyBody());
}

export async function renderFinanceVendorList() {
  setActiveNav('finance');
  setFabVisible(true);
  financeTopbar('Mecra');
  setContent(`<div class="list-loading">Yükleniyor…</div>`);
  setContent(tabStrip('vendor') + await vendorHierarchyBody());
}

// §60: vendors used for one media type, e.g. all TV kanalları — one level
// below the Media Type overview, one level above the vendor's own detail.
export async function renderMediaTypeDetail({ mediaType }) {
  setActiveNav('finance');
  setFabVisible(false);
  const typeName = decodeURIComponent(mediaType);
  setTopbar(`
    <div class="left">
      <button class="back" onclick="H.goto('/finance/vendor')">${icon('chevronLeft')}</button>
      <div><h1>${escapeHtml(typeName)}</h1><div class="sub">Finans · Mecra</div></div>
    </div>
  `);
  setContent(`<div class="list-loading">Yükleniyor…</div>`);

  const [overview, vendors] = await Promise.all([
    agg.getMediaTypeOverview(),
    agg.getVendorsForType(typeName)
  ]);
  const t = overview.find((o) => o.mediaType === typeName);

  let html = '';
  if (t) {
    html += `
      <div class="summary-strip">
        <div class="si"><div class="label">Alış</div><div class="value">${fmtN(t.totalPurchase)}</div></div>
        <div class="si"><div class="label">Satış</div><div class="value">${fmtN(t.totalSales)}</div></div>
        <div class="si amber"><div class="label">Ristorno</div><div class="value">${fmtN(t.totalRistorno)}</div></div>
      </div>
      <div class="summary-strip">
        <div class="si"><div class="label">Net Borç</div><div class="value">${fmtN(t.totalNetPayable)}</div></div>
        <div class="si green"><div class="label">Ödenen</div><div class="value">${fmtN(t.totalPaid)}</div></div>
        <div class="si red"><div class="label">Kalan</div><div class="value">${fmtN(t.totalRemaining)}</div></div>
      </div>
    `;
  }

  html += `<div class="section-title">Yükleniciler (${vendors.length})</div>`;
  if (vendors.length === 0) {
    html += emptyState(icon('building', { size: 32 }), 'Bu mecra türünde yüklenici yok', '');
  } else {
    vendors.sort((a, b) => b.totalRemaining - a.totalRemaining);
    html += vendors.map((v) => `
      <div class="row-card" onclick="H.goto('/finance/vendor/${encodeURIComponent(v.vendor)}')">
        ${avatarHtml(v.vendor)}
        <div class="info">
          <div class="name">${escapeHtml(v.vendor)}</div>
          <div class="sub">Borç ${fmtN(v.totalNetPayable)} · Ödenen ${fmtN(v.totalPaid)} · Kâr ${fmtN(v.totalProfit)}</div>
        </div>
        <div class="right-col">
          <div class="big">${fmt(v.totalRemaining)}</div>
          <div class="small">kalan</div>
        </div>
      </div>
    `).join('');
  }

  setContent(html);
}

export async function renderFinanceVendorDetail({ vendor }) {
  setActiveNav('finance');
  setFabVisible(false);
  const vendorName = decodeURIComponent(vendor);
  setTopbar(`
    <div class="left">
      <button class="back" onclick="H.goto('/finance/vendor')">${icon('chevronLeft')}</button>
      <div><h1>${escapeHtml(vendorName)}</h1><div class="sub">Finans · Mecra</div></div>
    </div>
    <div class="right"><button class="icon-btn add" onclick="H.openPaymentForm({vendor:'${jsAttr(vendorName)}'})">${icon('plus')}</button></div>
  `);
  setContent(`<div class="list-loading">Yükleniyor…</div>`);

  const [data, vendorCheques] = await Promise.all([
    agg.getVendorAggregate(vendorName),
    repo.getChequesForVendor(vendorName)
  ]);

  let html = '';
  if (data.mediaTypes.length > 0) {
    html += `<div class="usage-tags" style="margin-bottom:10px;">${data.mediaTypes.map((mt) => `<span class="usage-tag" style="cursor:pointer;" onclick="H.goto('/finance/vendor/t/${encodeURIComponent(mt)}')">${icon('monitor', { size: 13 })} ${escapeHtml(mt)}</span>`).join('')}</div>`;
  }
  // §61: vendor detail must show purchase/ristorno/sales totals too, not just
  // net payable/paid/remaining/profit.
  html += `
    <div class="summary-strip">
      <div class="si"><div class="label">Alış</div><div class="value">${fmtN(data.totalPurchase)}</div></div>
      <div class="si"><div class="label">Satış</div><div class="value">${fmtN(data.totalSales)}</div></div>
      <div class="si amber"><div class="label">Ristorno</div><div class="value">${fmtN(data.totalRistorno)}</div></div>
    </div>
    <div class="summary-strip cols4">
      <div class="si"><div class="label">Net Borç</div><div class="value">${fmtN(data.totalNetPayable)}</div></div>
      <div class="si green"><div class="label">Ödenen</div><div class="value">${fmtN(data.totalPaid)}</div></div>
      <div class="si red"><div class="label">Kalan</div><div class="value">${fmtN(data.totalRemaining)}</div></div>
      <div class="si green"><div class="label">Kâr</div><div class="value">${fmtN(data.totalProfit)}</div></div>
    </div>
  `;
  if (data.totalExcess > 0) html += `<div class="note-box"><b>Fazla Ödeme</b>${fmt(data.totalExcess)}</div>`;

  html += `<button class="btn small outline" onclick="H.openPaymentForm({vendor:'${jsAttr(vendorName)}'})">${icon('landmark', { size: 15 })} Ödeme Ekle</button>`;
  html += `<button class="btn small outline" style="margin-top:8px;" onclick="H.openVendorMutabakat('${jsAttr(vendorName)}')">${icon('share', { size: 15 })} Mütabakat Gönder</button>`;

  // §61: each campaign row must show Customer, Product, Campaign, Media,
  // Purchase, Sales, Ristorno, Net payable, Paid, Remaining — not just totals.
  html += `<div class="section-title">Kampanyalar (${data.campaigns.length})</div>`;
  if (data.campaigns.length === 0) {
    html += emptyState(icon('megaphone', { size: 32 }), 'Kampanya yok', '');
  } else {
    html += data.campaigns.map((c) => `
      <div class="detail-card" style="cursor:pointer;" onclick="H.goto('/campaigns/${c.campaign.id}')">
        <div class="detail-row"><span class="k" style="font-weight:800;color:var(--ink);">${escapeHtml(c.campaign.name || c.campaign.productName)}</span><span class="v">${c.campaign.startDate ? formatDate(c.campaign.startDate) : ''}</span></div>
        <div class="detail-row"><span class="k">Müşteri</span><span class="v" style="cursor:pointer;text-decoration:underline;" onclick="event.stopPropagation();H.goto('/customers/${c.campaign.clientId}')">${escapeHtml(c.campaign.clientName || '—')}</span></div>
        <div class="detail-row"><span class="k">Ürün</span><span class="v">${escapeHtml(c.campaign.productName || '—')}</span></div>
        <div class="detail-row"><span class="k">Mecra</span><span class="v">${escapeHtml((c.mediaTypesInCampaign || []).join(', '))}</span></div>
        <div class="detail-divider"></div>
        <div class="detail-row"><span class="k">Alış</span><span class="v">${fmt(c.purchase)}</span></div>
        <div class="detail-row"><span class="k">Satış</span><span class="v">${fmt(c.sales)}</span></div>
        <div class="detail-row amber"><span class="k">Ristorno</span><span class="v">${fmt(c.ristorno)}</span></div>
        <div class="detail-row"><span class="k">Net Ödenecek</span><span class="v">${fmt(c.netPayable)}</span></div>
        <div class="detail-row green"><span class="k">Ödenen</span><span class="v">${fmt(c.paid)}</span></div>
        <div class="detail-row red"><span class="k">Kalan</span><span class="v">${fmt(c.remaining)}</span></div>
        <div class="detail-row green"><span class="k">Kâr</span><span class="v">${fmt(c.profit)}</span></div>
      </div>
    `).join('');
  }

  const allPayments = data.campaigns.flatMap((c) => c.payments);
  html += `<div class="section-title">Ödeme Geçmişi</div>`;
  if (allPayments.length === 0) {
    html += emptyState(icon('creditCard', { size: 32 }), 'Henüz ödeme yok', '');
  } else {
    const sorted = allPayments.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    html += sorted.map((p) => payRowHtml(p, {
      onClick: (pp) => `H.openPaymentDetail('${pp.id}')`,
      showTarget: (pp) => pp.campaignName,
      onDelete: (pp) => `H.deletePayment('${pp.id}')`
    })).join('');
  }

  // §73: cheques given to this vendor, cross-visible from the Vendor page.
  if (vendorCheques.length > 0) {
    html += `<div class="section-title">Çekler</div>`;
    const sortedCheques = [...vendorCheques].sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
    html += sortedCheques.map((c) => chequeRowHtml(c)).join('');
  }

  setContent(html);
}

// ============================================================================
// FINANS → ÇEKLER
// ============================================================================
let chequeDirection = 'received';
let chequeFilter = 'tumu';

export async function renderCheques() {
  setActiveNav('finance');
  setFabVisible(false);
  financeTopbar('Çekler');
  setContent(`<div class="list-loading">Yükleniyor…</div>`);

  const all = await repo.getAllCheques();
  const today = todayISO();

  let html = tabStrip('cheques');
  html += `
    <div class="segmented">
      <button class="seg-btn ${chequeDirection === 'received' ? 'active' : ''}" onclick="H.setChequeTab('received')">Alınan Çekler</button>
      <button class="seg-btn ${chequeDirection === 'given' ? 'active' : ''}" onclick="H.setChequeTab('given')">Verilen Çekler</button>
    </div>
  `;

  const filters = [
    ['tumu', 'Tümü'], ['vadesiGelmemis', 'Vadesi Gelmemiş'], ['vadesiGelen', 'Vadesi Gelen'],
    ['Ödendi', 'Ödendi'], ['Karşılıksız', 'Karşılıksız'], ['İptal', 'İptal']
  ];
  html += `<div class="pills">` + filters.map(([k, label]) => `<button class="pill ${chequeFilter === k ? 'active' : ''}" onclick="H.setChequeFilter('${k}')">${label}</button>`).join('') + `</div>`;

  let list = all.filter((c) => c.direction === chequeDirection);
  list = list.filter((c) => {
    const status = calc.chequeDisplayStatus(c, today);
    if (chequeFilter === 'tumu') return true;
    if (chequeFilter === 'vadesiGelmemis') return status !== 'Vadesi Gelen' && !calc.CHEQUE_MANUAL_STATUSES.includes(status);
    if (chequeFilter === 'vadesiGelen') return status === 'Vadesi Gelen';
    return status === chequeFilter;
  });
  list.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));

  if (list.length === 0) {
    html += emptyState(icon('receipt', { size: 32 }), 'Çek bulunamadı', 'Seçili filtreye uygun çek yok.');
  } else {
    html += list.map((c) => chequeRowHtml(c)).join('');
  }

  // Compact sync status footer — the old standalone "Diğer" page is gone,
  // but this diagnostic still deserves a quiet home (§10-11).
  const { pendingCount, lastSyncTime } = await import('./sync.js');
  const pending = await pendingCount();
  const last = await lastSyncTime();
  html += `
    <div class="sync-footer">
      ${icon('sync', { size: 13 })}
      <span>${pending > 0 ? pending + ' bekleyen değişiklik · ' : ''}Son senkron: ${last ? new Date(last).toLocaleString('tr-TR') : 'henüz yok'}</span>
    </div>
  `;

  setContent(html);
}

export function setChequeTab(dir) { chequeDirection = dir; renderCheques(); }
export function setChequeFilter(f) { chequeFilter = f; renderCheques(); }

export async function renderChequeDetail({ chequeId }) {
  setActiveNav('finance');
  setFabVisible(false);
  const cheque = await repo.getCheque(chequeId);
  if (!cheque) { navigate('/finance/cheques'); return; }

  setTopbar(`
    <div class="left">
      <button class="back" onclick="H.goto('/finance/cheques')">${icon('chevronLeft')}</button>
      <div><h1>${escapeHtml(cheque.counterpartyName || 'Çek')}</h1><div class="sub">${cheque.direction === 'received' ? 'Alınan Çek' : 'Verilen Çek'}</div></div>
    </div>
    <div class="right"><button class="icon-btn" onclick="H.openChequeEdit('${cheque.id}')">${icon('pencil', { size: 16 })}</button></div>
  `);

  const status = calc.chequeDisplayStatus(cheque, todayISO());
  let html = `
    <div class="detail-card">
      <div class="detail-row"><span class="k">Durum</span><span class="v">${chequeStatusChip(cheque)}</span></div>
      <div class="detail-row"><span class="k">${cheque.direction === 'received' ? 'Müşteri' : 'Yüklenici'}</span><span class="v">${escapeHtml(cheque.counterpartyName || '—')}</span></div>
      <div class="detail-row"><span class="k">Kampanya</span><span class="v">${escapeHtml(cheque.campaignName || '—')}</span></div>
      <div class="detail-row total"><span class="k">Tutar</span><span class="v">${fmt(cheque.amount)}</span></div>
      <div class="detail-row"><span class="k">Çek Tarihi</span><span class="v">${formatDate(cheque.chequeDate)}</span></div>
      <div class="detail-row"><span class="k">Vade Tarihi</span><span class="v">${formatDate(cheque.dueDate)}</span></div>
      <div class="detail-row"><span class="k">Banka</span><span class="v">${escapeHtml(cheque.bank || '—')}</span></div>
      <div class="detail-row"><span class="k">Çek No</span><span class="v">${escapeHtml(cheque.chequeNumber || '—')}</span></div>
      ${cheque.note ? `<div class="note-box"><b>Not</b>${escapeHtml(cheque.note)}</div>` : ''}
    </div>
    ${(() => {
      const photos = cheque.photos && cheque.photos.length ? cheque.photos : (cheque.photo ? [cheque.photo] : []);
      return photos.length ? `<div class="detail-card"><h3>Fotoğraflar</h3>${photoGalleryHtml(photos)}</div>` : '';
    })()}
    <div class="detail-card">
      <h3>Durumu Güncelle</h3>
      <div class="status-select-row">
        ${calc.CHEQUE_MANUAL_STATUSES.map((s) => `<button class="status-opt ${cheque.status === s ? 'active' : ''}" onclick="H.setChequeStatus('${cheque.id}','${s}')">${s}</button>`).join('')}
        ${cheque.status ? `<button class="status-opt" onclick="H.setChequeStatus('${cheque.id}',null)">Sıfırla</button>` : ''}
      </div>
      <p class="hint" style="margin-top:8px;">Vade tarihi geldiğinde çek otomatik olarak "Vadesi Gelen" gösterilir; ödendi/karşılıksız/iptal durumunu sen işaretlersin.</p>
    </div>
  `;

  setContent(html);
}

export async function setChequeStatus(chequeId, status) {
  await repo.updateCheque(chequeId, { status });
  toast(status ? `Çek "${status}" olarak işaretlendi` : 'Çek durumu sıfırlandı', 'success');
  refresh();
}

const EDIT_MAX_PHOTOS = 3;
let editChequePhotos = [];

export async function openChequeEdit(chequeId) {
  const cheque = await repo.getCheque(chequeId);
  if (!cheque) return;
  editChequePhotos = cheque.photos && cheque.photos.length ? cheque.photos.slice() : (cheque.photo ? [cheque.photo] : []);
  const html = `
    <button class="close-x" onclick="H.closeSheet()">✕</button>
    <h2>Çeki Düzenle</h2>
    <div class="row2">
      <div class="field"><label>Çek Tarihi</label><input id="fEditChequeDate" type="date" value="${cheque.chequeDate || ''}"></div>
      <div class="field"><label>Vade Tarihi</label><input id="fEditChequeDue" type="date" value="${cheque.dueDate || ''}"></div>
    </div>
    <div class="row2">
      <div class="field"><label>Banka</label><input id="fEditChequeBank" value="${escapeHtml(cheque.bank || '')}"></div>
      <div class="field"><label>Çek No</label><input id="fEditChequeNo" value="${escapeHtml(cheque.chequeNumber || '')}"></div>
    </div>
    <div class="field">
      <label>Fotoğraf (maks. ${EDIT_MAX_PHOTOS})</label>
      <div class="photo-btns" id="editChequePhotoBtns" style="display:${editChequePhotos.length >= EDIT_MAX_PHOTOS ? 'none' : 'flex'};">
        <button type="button" class="btn small outline" onclick="H.captureChequePhotoEdit('camera')">${icon('camera', { size: 15 })} Kameradan Çek</button>
        <button type="button" class="btn small outline" onclick="H.captureChequePhotoEdit('gallery')">${icon('image', { size: 15 })} Galeriden Seç</button>
      </div>
      <div id="editChequePhotoPreview">${renderEditChequePhotoStrip()}</div>
    </div>
    <button class="btn primary" onclick="H.saveChequeEdit('${cheque.id}')">Kaydet</button>
  `;
  openSheet(html);
}

function renderEditChequePhotoStrip() {
  return photoStripHtml(editChequePhotos, {
    onRemove: (i) => `H.removeChequePhotoEdit(${i})`,
    onView: (src) => `H.viewPhotoDataUrl('${src}')`,
    max: EDIT_MAX_PHOTOS
  });
}

function refreshEditChequePhotoUI() {
  const wrap = document.getElementById('editChequePhotoPreview');
  const btns = document.getElementById('editChequePhotoBtns');
  if (wrap) wrap.innerHTML = renderEditChequePhotoStrip();
  if (btns) btns.style.display = editChequePhotos.length >= EDIT_MAX_PHOTOS ? 'none' : 'flex';
}

export async function captureChequePhotoEdit(source) {
  if (editChequePhotos.length >= EDIT_MAX_PHOTOS) { toast(`En fazla ${EDIT_MAX_PHOTOS} fotoğraf eklenebilir`, 'error'); return; }
  const { pickPhoto } = await import('./photo.js');
  const dataUrl = await pickPhoto(source);
  if (dataUrl) {
    editChequePhotos.push(dataUrl);
    refreshEditChequePhotoUI();
  }
}

export function removeChequePhotoEdit(index) {
  editChequePhotos.splice(index, 1);
  refreshEditChequePhotoUI();
}

export async function saveChequeEdit(chequeId) {
  const patch = {
    chequeDate: document.getElementById('fEditChequeDate').value,
    dueDate: document.getElementById('fEditChequeDue').value,
    bank: document.getElementById('fEditChequeBank').value.trim(),
    chequeNumber: document.getElementById('fEditChequeNo').value.trim(),
    photos: editChequePhotos.slice()
  };
  if (!patch.dueDate) { toast('Vade tarihi zorunlu', 'error'); return; }
  await repo.updateCheque(chequeId, patch);
  editChequePhotos = [];
  toast('Çek güncellendi', 'success');
  closeSheet();
  refresh();
}

// ============================================================================
// TV YILLIK RİSTORNO (§10-11: relocated under Mecralar — the standalone
// "Diğer" section was removed entirely, no route/page/button left behind)
// ============================================================================
export async function renderTvVendorList() {
  setActiveNav('mecra');
  setFabVisible(false);
  setTopbar(`<div class="left"><button class="back" onclick="H.goto('/mecra')">${icon('chevronLeft')}</button><div><h1>TV Yıllık Ristorno</h1></div></div>`);
  setContent(`<div class="list-loading">Yükleniyor…</div>`);

  const [media, records] = await Promise.all([repo.getAllMedia(), repo.getAllTvRistorno()]);
  const tvVendors = new Set(media.filter((m) => calc.isTV(m.mediaType)).map((m) => m.vendor));
  records.forEach((r) => tvVendors.add(r.vendor));
  const vendorList = [...tvVendors].sort((a, b) => a.localeCompare(b, 'tr'));

  let html = '';
  if (vendorList.length === 0) {
    html = emptyState(icon('monitor', { size: 32 }), 'Henüz TV yükleniciniz yok', 'Bir kampanyaya TV mecrası eklediğinde burada görünecek.');
  } else {
    html = vendorList.map((v) => {
      const yearCount = records.filter((r) => r.vendor === v).length;
      return `
      <div class="row-card" onclick="H.goto('/mecra/tv/${encodeURIComponent(v)}')">
        <div class="avatar" style="background:#F59E0B">${icon('monitor', { size: 18 })}</div>
        <div class="info"><div class="name">${escapeHtml(v)}</div><div class="sub">${yearCount} yıl kaydı</div></div>
        <div class="chev">${icon('chevronRight', { size: 16 })}</div>
      </div>`;
    }).join('');
  }
  setContent(html);
}

export async function renderTvVendorYears({ vendor }) {
  setActiveNav('mecra');
  setFabVisible(false);
  const vendorName = decodeURIComponent(vendor);
  setTopbar(`
    <div class="left"><button class="back" onclick="H.goto('/mecra/tv')">${icon('chevronLeft')}</button><div><h1>${escapeHtml(vendorName)}</h1><div class="sub">TV Yıllık Ristorno</div></div></div>
    <div class="right"><button class="icon-btn add" onclick="H.openTvRistornoForm('${jsAttr(vendorName)}')">${icon('plus')}</button></div>
  `);
  setContent(`<div class="list-loading">Yükleniyor…</div>`);

  const records = (await repo.getAllTvRistorno()).filter((r) => r.vendor === vendorName).sort((a, b) => b.year - a.year);

  let html = '';
  if (records.length === 0) {
    html = emptyState(icon('monitor', { size: 32 }), 'Henüz yıllık ristorno kaydı yok', 'Sağ üstteki + ile bir yıl ekle.');
  } else {
    html = records.map((r) => `
      <div class="detail-card" style="cursor:pointer;" onclick="H.openTvRistornoForm('${jsAttr(vendorName)}','${r.id}')">
        <div class="detail-row"><span class="k" style="font-weight:800;color:var(--ink);">${r.year}</span><span class="v">${r.collectionDate ? `<span class="chip green">Tahsil edildi</span>` : `<span class="chip neutral">Bekliyor</span>`}</span></div>
        <div class="detail-row"><span class="k">Hesaplanan</span><span class="v">${fmt(r.calculatedAmount)}</span></div>
        ${r.confirmedAmount != null && r.confirmedAmount !== '' ? `<div class="detail-row total"><span class="k">Mutabık Kalınan</span><span class="v">${fmt(r.confirmedAmount)}</span></div>` : ''}
        ${r.collectionDate ? `<div class="detail-row"><span class="k">Tahsilat Tarihi</span><span class="v">${formatDate(r.collectionDate)}</span></div>` : ''}
      </div>
    `).join('');
  }
  setContent(html);
}

export async function openTvRistornoForm(vendorName, recordId) {
  const record = recordId ? await repo.getTvRistorno(recordId) : null;
  const currentYear = new Date().getFullYear();

  const [media, campaigns] = await Promise.all([repo.getAllMedia(), repo.getAllCampaigns()]);
  const campaignsById = new Map(campaigns.map((c) => [c.id, c]));
  // Media start/end dates are optional (§47), so fall back to the parent
  // campaign's (required) start date when a media record has none of its own.
  const effectiveYear = (m) => {
    const date = m.startDate || (campaignsById.get(m.campaignId) || {}).startDate || '';
    return date.slice(0, 4);
  };
  const suggestCalc = (year) => {
    return media
      .filter((m) => calc.isTV(m.mediaType) && m.vendor === vendorName && effectiveYear(m) === String(year))
      .reduce((s, m) => s + calc.mediaRistorno(m), 0);
  };

  const html = `
    <button class="close-x" onclick="H.closeSheet()">✕</button>
    <h2>${record ? 'Yıllık Ristorno Kaydını Düzenle' : 'Yıllık Ristorno Ekle'}</h2>
    <div class="field"><label>Yıl *</label><input id="fTvYear" type="number" value="${record ? record.year : currentYear}"></div>
    <div class="field">
      <label>Hesaplanan Tutar *</label>
      <input id="fTvCalc" type="number" step="0.01" value="${record ? record.calculatedAmount : ''}">
      <button type="button" class="btn small outline" style="margin-top:6px;" onclick="H.suggestTvCalc('${jsAttr(vendorName)}')">Kampanyalardan Otomatik Hesapla</button>
    </div>
    <div class="field"><label>Mutabık Kalınan Tutar (Yıl Sonu)</label><input id="fTvConfirmed" type="number" step="0.01" value="${record && record.confirmedAmount != null ? record.confirmedAmount : ''}"></div>
    <div class="field"><label>Tahsilat Tarihi</label><input id="fTvDate" type="date" value="${record && record.collectionDate ? record.collectionDate : ''}"></div>
    <div class="field"><label>Not</label><textarea id="fTvNote">${record && record.note ? escapeHtml(record.note) : ''}</textarea></div>
    <button class="btn primary" onclick="H.saveTvRistorno('${jsAttr(vendorName)}','${record ? record.id : ''}')">Kaydet</button>
    ${record ? `<button class="btn danger" onclick="H.deleteTvRistornoRecord('${record.id}','${jsAttr(vendorName)}')">Sil</button>` : ''}
  `;
  openSheet(html);
  window.__tvSuggestCalc = suggestCalc;
}

export function suggestTvCalc(vendorName) {
  const yearInput = document.getElementById('fTvYear');
  const year = Number(yearInput.value) || new Date().getFullYear();
  if (window.__tvSuggestCalc) {
    document.getElementById('fTvCalc').value = window.__tvSuggestCalc(year);
    toast('Önerilen tutar dolduruldu, dilersen düzenleyebilirsin', 'success');
  }
}

export async function saveTvRistorno(vendorName, recordId) {
  const year = Number(document.getElementById('fTvYear').value);
  const calculatedAmount = document.getElementById('fTvCalc').value;
  const confirmedRaw = document.getElementById('fTvConfirmed').value;
  const collectionDate = document.getElementById('fTvDate').value || '';
  const note = document.getElementById('fTvNote').value.trim();

  if (!year) { toast('Yıl zorunlu', 'error'); return; }
  if (calculatedAmount === '') { toast('Hesaplanan tutar zorunlu', 'error'); return; }

  const data = {
    vendor: vendorName, year,
    calculatedAmount: Number(calculatedAmount),
    confirmedAmount: confirmedRaw === '' ? null : Number(confirmedRaw),
    collectionDate, note
  };
  try {
    if (recordId) {
      await repo.updateTvRistorno(recordId, data);
      toast('Kayıt güncellendi', 'success');
    } else {
      await repo.createTvRistorno(data);
      toast('Kayıt eklendi', 'success');
    }
    closeSheet();
    refresh();
  } catch (e) {
    toast('Kaydedilemedi: ' + e.message, 'error');
  }
}

export async function deleteTvRistornoRecord(recordId, vendorName) {
  if (!confirmAction('Bu yıllık ristorno kaydını silmek istiyor musun?')) return;
  await repo.deleteTvRistorno(recordId);
  toast('Kayıt silindi', 'success');
  closeSheet();
  navigate('/other/tv/' + encodeURIComponent(vendorName));
}
