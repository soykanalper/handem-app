// ---------------------------------------------------------------------------
// screens.js — Müşteriler / Müşteri Detayı / Ürün Detayı / Kampanya Detayı /
// Mecra (Media) Detayı screens: the core navigation flow of the app.
// ---------------------------------------------------------------------------
import * as repo from './repo.js';
import * as calc from './calc.js';
import * as agg from './aggregate.js';
import { fmt, fmtN, formatDate, escapeHtml, jsAttr, todayISO, hashColor, initials, toast } from './util.js';
import { setTopbar, setContent, setActiveNav, setFabVisible, setFabAction, navigate, goBack } from './ui.js';
import { avatarHtml, campaignCardHtml, mediaRowHtml, payRowHtml, chequeRowHtml, emptyState, vatDetailRow, vatBadge } from './components.js';
import { icon } from './icons.js';
import { isCloudActive } from './cloud/bootstrap.js';
import { isAdmin } from './cloud/team.js';

let customerSearch = '';

// ============================================================================
// ANA SAYFA — whole-business financial overview (§1-3). Kept deliberately
// simple: four headline totals, collection status, then the customer list
// right below — nothing here requires opening another screen to understand.
// ============================================================================
export async function renderHome() {
  setActiveNav('home');
  setFabVisible(true);
  setTopbar(`
    <div class="brand-row">
      <img src="icons/logo.png" alt="Hande'M" class="brand-logo-img">
    </div>
    <div class="right">
      ${isCloudActive() ? `<button class="icon-btn" onclick="H.openAccountMenu()">${icon('users', { size: 16 })}</button>` : ''}
      <button class="icon-btn add" onclick="H.openCustomerForm()">${icon('plus')}</button>
    </div>
  `, 'brand-centered');
  setContent(`<div class="list-loading">Yükleniyor…</div>`);

  const { clients, totals } = await agg.getBusinessOverview();
  clients.sort((a, b) => a.client.name.localeCompare(b.client.name, 'tr'));

  // §roles: admin görür alış/ristorno/kâr — personel için boş sütunlarla
  // dörtlü bir ızgara bırakmak yerine tek, anlamlı bir özet şeridi (satış +
  // tahsilat durumu) gösteriyoruz.
  let html = isAdmin() ? `
    <div class="summary-strip cols4 hero">
      <div class="si"><div class="label">Toplam Alış</div><div class="value">${fmtN(totals.totalPurchase)}</div></div>
      <div class="si"><div class="label">Toplam Satış</div><div class="value">${fmtN(totals.totalSales)}</div></div>
      <div class="si amber"><div class="label">Toplam Ristorno</div><div class="value">${fmtN(totals.totalRistorno)}</div></div>
      <div class="si profit"><div class="label">Toplam Kâr</div><div class="value">${fmtN(totals.campaignProfit)}</div></div>
    </div>
    <div class="summary-strip cols2 hero">
      <div class="si"><div class="label">Toplam Tahsilat</div><div class="value">${fmtN(totals.customerCollected)}</div></div>
      <div class="si red"><div class="label">Kalan Tahsilat</div><div class="value">${fmtN(totals.customerRemaining)}</div></div>
    </div>
  ` : `
    <div class="summary-strip hero">
      <div class="si"><div class="label">Toplam Satış</div><div class="value">${fmtN(totals.totalSales)}</div></div>
      <div class="si"><div class="label">Toplam Tahsilat</div><div class="value">${fmtN(totals.customerCollected)}</div></div>
      <div class="si red"><div class="label">Kalan Tahsilat</div><div class="value">${fmtN(totals.customerRemaining)}</div></div>
    </div>
  `;
  if (totals.customerExcess > 0) {
    html += `<div class="note-box"><b>Fazla Tahsilat</b>${fmt(totals.customerExcess)}</div>`;
  }

  html += `<div class="section-title"><span class="icon-inline">${icon('users', { size: 13 })} Müşteriler</span></div>`;

  if (clients.length === 0) {
    html += emptyState(icon('users', { size: 32 }), 'Henüz müşterin yok', 'Sağ üstteki + ile başla.');
  } else {
    html += clients.map((r) => `
      <div class="row-card" onclick="H.goto('/customers/${r.client.id}')">
        ${avatarHtml(r.client.name)}
        <div class="info">
          <div class="name">${escapeHtml(r.client.name)}</div>
          <div class="sub">${r.activeCount} aktif kampanya</div>
        </div>
        <div class="right-col">
          <div class="big">${fmt(r.totalSummary.customerRemaining)}</div>
          <div class="small">kalan</div>
        </div>
      </div>`).join('');
  }

  setContent(html);
}

// ============================================================================
// MÜŞTERİLER
// ============================================================================
export async function renderCustomers() {
  setActiveNav('customers');
  setFabVisible(true);
  // Sayfanın kendi "+" (üstte) yeni müşteri ekler; alttaki FAB bu alanın
  // para-hareketi kısayolu olarak Tahsilat Ekle açar (§nav-redesign).
  setFabAction(() => window.H.openCollectionForm({}));
  setTopbar(`
    <div class="brand-row">
      <img src="icons/logo.png" alt="Hande'M" class="brand-logo-img">
    </div>
    <div class="right">
      <button class="icon-btn add" onclick="H.openCustomerForm()">${icon('plus')}</button>
    </div>
  `, 'brand-centered');
  setContent(`<div class="list-loading">Yükleniyor…</div>`);

  const results = await agg.getAllClientsAggregate();
  results.sort((a, b) => a.client.name.localeCompare(b.client.name, 'tr'));

  let html = `<div class="search-box"><input id="customerSearchInput" placeholder="Müşteri ara…" value="${escapeHtml(customerSearch)}"></div>`;

  const filtered = results.filter((r) => r.client.name.toLowerCase().includes(customerSearch.toLowerCase()));

  if (results.length === 0) {
    html += emptyState(icon('users', { size: 32 }), 'Henüz müşterin yok', 'Sağ üstteki + ile başla.');
  } else if (filtered.length === 0) {
    html += emptyState(icon('search', { size: 32 }), 'Sonuç bulunamadı', 'Farklı bir arama dene.');
  } else {
    html += filtered.map((r) => {
      const remaining = r.totalSummary.customerRemaining;
      return `
      <div class="row-card" onclick="H.goto('/customers/${r.client.id}')">
        ${avatarHtml(r.client.name)}
        <div class="info">
          <div class="name">${escapeHtml(r.client.name)}</div>
          <div class="sub">${r.activeCount} aktif kampanya</div>
        </div>
        <div class="right-col">
          <div class="big">${fmt(remaining)}</div>
          <div class="small">kalan</div>
        </div>
      </div>`;
    }).join('');
  }

  setContent(html);
  const searchInput = document.getElementById('customerSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      customerSearch = e.target.value;
      renderCustomers();
      setTimeout(() => {
        const el = document.getElementById('customerSearchInput');
        if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
      }, 0);
    });
  }
}

// ============================================================================
// MÜŞTERİ DETAYI
// ============================================================================
export async function renderClientDetail({ clientId }) {
  setActiveNav('customers');
  setFabVisible(true);
  const client = await repo.getClient(clientId);
  if (!client) { navigate('/customers'); return; }

  // Üstteki "+" ürün ekler (yapısal); FAB bu müşteriye önceden dolu Tahsilat
  // Ekle açar — kampanyanın içine girmeden hızlı kayıt (§nav-redesign).
  setFabAction(() => window.H.openCollectionForm({ clientId: client.id }));

  setTopbar(`
    <div class="left">
      <button class="back" onclick="H.goto('/customers')">${icon('chevronLeft')}</button>
      <div><h1>${escapeHtml(client.name)}</h1></div>
    </div>
    <div class="right">
      <button class="icon-btn" onclick="H.openCustomerForm('${client.id}')">${icon('pencil', {size:16})}</button>
      <button class="icon-btn add" onclick="H.openProductForm('${client.id}')">${icon('plus')}</button>
    </div>
  `);
  setContent(`<div class="list-loading">Yükleniyor…</div>`);

  const [products, aggData, collections] = await Promise.all([
    repo.getProductsForClient(clientId),
    agg.getClientAggregate(clientId),
    repo.getCollectionsForClient(clientId)
  ]);
  products.sort((a, b) => a.name.localeCompare(b.name, 'tr'));

  const s = aggData.totalSummary;
  let html = `
    <div class="summary-strip">
      <div class="si"><div class="label">Alacak</div><div class="value">${fmtN(s.customerReceivable)}</div></div>
      <div class="si green"><div class="label">Tahsil</div><div class="value">${fmtN(s.customerCollected)}</div></div>
      <div class="si red"><div class="label">Kalan</div><div class="value">${fmtN(s.customerRemaining)}</div></div>
    </div>
  `;
  if (s.customerExcess > 0) {
    html += `<div class="note-box"><b>Fazla Tahsilat</b>${fmt(s.customerExcess)} bu müşteriden fazladan tahsil edilmiş.</div>`;
  }

  // §nav-redesign: this page now also carries everything that used to live
  // on the separate Finans → Müşteri Detayı screen (Tahsilat Ekle, per-
  // campaign financial breakdown, Son Tahsilatlar) — one client, one page,
  // no matter which tab you arrived from.
  html += `<button class="btn primary" onclick="H.openCollectionForm({clientId:'${client.id}'})">+ Tahsilat Ekle</button>`;
  html += `<button class="btn small outline" style="margin-top:8px;" onclick="H.openCustomerMutabakat('${client.id}')">${icon('share', { size: 15 })} Mütabakat Gönder</button>`;

  html += `<div class="section-title">Ürünler</div>`;
  if (products.length === 0) {
    html += emptyState(icon('package', { size: 32 }), 'Henüz ürün yok', 'Sağ üstteki + ile bu müşteri için bir ürün ekle.');
  } else {
    // §56: each product row shows Product Name, Number of Campaigns, Media
    // Types Used AND Vendors/Contractors Used — both lists, each on its own
    // line, exactly like the spec's "Mecralar: ... / Yükleniciler: ..." example.
    const summaries = await Promise.all(products.map((p) => agg.getProductMediaVendorSummary(p.id)));
    html += products.map((p, i) => {
      const sm = summaries[i];
      return `
      <div class="row-card" onclick="H.goto('/customers/${client.id}/products/${p.id}')">
        <div class="avatar" style="background:${hashColor(p.name)}">${escapeHtml(initials(p.name))}</div>
        <div class="info">
          <div class="name">${escapeHtml(p.name)}</div>
          <div class="sub">${sm.totalCount} kampanya (${sm.activeCount} aktif)</div>
          ${sm.mediaTypes.length ? `<div class="sub" style="margin-top:2px;">Mecralar: ${escapeHtml(sm.mediaTypes.join(' · '))}</div>` : ''}
          ${sm.vendors.length ? `<div class="sub" style="margin-top:2px;">Yükleniciler: ${escapeHtml(sm.vendors.join(' · '))}</div>` : ''}
        </div>
        <div class="chev">${icon('chevronRight', { size: 16 })}</div>
      </div>
    `;
    }).join('');
  }

  // Per-campaign financial breakdown (flat across all products) — was only
  // on the old Finans → Müşteri Detayı screen; folded in here unchanged.
  html += `<div class="section-title">Kampanyalar (Finansal)</div>`;
  if (aggData.campaigns.length === 0) {
    html += emptyState(icon('megaphone', { size: 32 }), 'Kampanya yok', '');
  } else {
    html += aggData.campaigns.map((c) => `
      <div class="detail-card" style="cursor:pointer;" onclick="H.goto('/campaigns/${c.campaign.id}')">
        <div class="detail-row"><span class="k" style="font-weight:800;color:var(--ink);">${escapeHtml(c.campaign.name || c.campaign.productName)}</span><span class="v">${c.active ? '<span class="chip green">Aktif</span>' : '<span class="chip neutral">Pasif</span>'}</span></div>
        <div class="detail-row"><span class="k">Alacak</span><span class="v">${fmt(c.summary.customerReceivable)}</span></div>
        <div class="detail-row green"><span class="k">Tahsil</span><span class="v">${fmt(c.summary.customerCollected)}</span></div>
        <div class="detail-row red"><span class="k">Kalan</span><span class="v">${fmt(c.summary.customerRemaining)}</span></div>
      </div>
    `).join('');
  }

  // Full tahsilat transaction history — was only on the old Finans →
  // Müşteri Detayı screen; folded in here unchanged.
  html += `<div class="section-title">Son Tahsilatlar</div>`;
  if (collections.length === 0) {
    html += emptyState(icon('banknote', { size: 32 }), 'Henüz tahsilat yok', '');
  } else {
    const sortedCollections = [...collections].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    html += sortedCollections.map((c) => payRowHtml(c, {
      onClick: (cc) => `H.openCollectionDetail('${cc.id}')`,
      showTarget: (cc) => cc.campaignName,
      onDelete: (cc) => `H.deleteCollection('${cc.id}')`
    })).join('');
  }

  // §73: cheques tied to this customer, cross-visible from the Customer page.
  const clientCheques = await repo.getChequesForClient(client.id);
  if (clientCheques.length > 0) {
    html += `<div class="section-title">Çekler</div>`;
    const sortedCheques = [...clientCheques].sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
    html += sortedCheques.map((c) => chequeRowHtml(c, { onDelete: (cc) => `H.deleteChequeRecord('${cc.id}')` })).join('');
  }

  html += `<button class="btn danger" onclick="H.deleteCustomer('${client.id}')">Müşteriyi Sil</button>`;

  setContent(html);
}

// ============================================================================
// ÜRÜN DETAYI (kampanyalar)
// ============================================================================
let productFilter = 'aktif';

export async function renderProductDetail({ clientId, productId }) {
  setActiveNav('customers');
  setFabVisible(true);
  const [client, product] = await Promise.all([repo.getClient(clientId), repo.getProduct(productId)]);
  if (!product) { navigate('/customers/' + clientId); return; }

  // Üstteki "+" kampanya ekler; FAB bu ürünün müşterisine önceden dolu
  // Tahsilat Ekle açar (§nav-redesign).
  setFabAction(() => window.H.openCollectionForm({ clientId }));

  setTopbar(`
    <div class="left">
      <button class="back" onclick="H.goto('/customers/${clientId}')">${icon('chevronLeft')}</button>
      <div><h1>${escapeHtml(product.name)}</h1><div class="sub">${escapeHtml(client ? client.name : '')}</div></div>
    </div>
    <div class="right">
      <button class="icon-btn" onclick="H.openProductForm('${clientId}','${product.id}')">${icon('pencil', {size:16})}</button>
      <button class="icon-btn add" onclick="H.openCampaignForm('${clientId}','${product.id}')">${icon('plus')}</button>
    </div>
  `);
  setContent(`<div class="list-loading">Yükleniyor…</div>`);

  const [campaigns, usageSummary] = await Promise.all([
    repo.getCampaignsForProduct(productId),
    agg.getProductMediaVendorSummary(productId)
  ]);
  const withSummary = await agg.getCampaignsWithSummary(campaigns);
  withSummary.sort((a, b) => (b.campaign.startDate || '').localeCompare(a.campaign.startDate || ''));

  const filtered = withSummary.filter((c) => {
    if (productFilter === 'aktif') return c.active;
    if (productFilter === 'pasif') return !c.active;
    return true;
  });

  // §57: product summary header — total/active/passive campaign counts plus
  // which media types & vendors have actually been used for this product.
  let html = `
    <div class="detail-card">
      <div class="summary-strip" style="margin-bottom:0;">
        <div class="si"><div class="label">Toplam</div><div class="value">${usageSummary.totalCount}</div></div>
        <div class="si green"><div class="label">Aktif</div><div class="value">${usageSummary.activeCount}</div></div>
        <div class="si"><div class="label">Pasif</div><div class="value">${usageSummary.passiveCount}</div></div>
      </div>
      ${usageSummary.mediaTypes.length ? `
      <div class="usage-tags">
        ${usageSummary.mediaTypes.map((mt) => `<span class="usage-tag">${icon('monitor', { size: 13 })} ${escapeHtml(mt)}</span>`).join('')}
      </div>` : ''}
      ${usageSummary.vendors.length ? `
      <div class="usage-tags">
        <span class="vendors">Yükleniciler: ${escapeHtml(usageSummary.vendors.join(', '))}</span>
      </div>` : ''}
    </div>

    <div class="segmented">
      <button class="seg-btn ${productFilter === 'aktif' ? 'active' : ''}" onclick="H.setProductFilter('aktif','${clientId}','${productId}')">Aktif</button>
      <button class="seg-btn ${productFilter === 'pasif' ? 'active' : ''}" onclick="H.setProductFilter('pasif','${clientId}','${productId}')">Pasif</button>
      <button class="seg-btn ${productFilter === 'tumu' ? 'active' : ''}" onclick="H.setProductFilter('tumu','${clientId}','${productId}')">Tümü</button>
    </div>
  `;

  if (withSummary.length === 0) {
    html += emptyState(icon('megaphone', { size: 32 }), 'Henüz kampanya yok', 'Sağ üstteki + ile bu ürün için bir kampanya oluştur.');
  } else if (filtered.length === 0) {
    html += emptyState(icon('search', { size: 32 }), 'Bu filtrede kampanya yok', '');
  } else {
    html += filtered.map((c) => campaignCardHtml(c)).join('');
  }

  html += `<button class="btn danger" onclick="H.deleteProduct('${product.id}','${clientId}')">Ürünü Sil</button>`;

  setContent(html);
}

export function setProductFilter(filter, clientId, productId) {
  productFilter = filter;
  renderProductDetail({ clientId, productId });
}

// ============================================================================
// KAMPANYA DETAYI
// ============================================================================
export async function renderCampaignDetail({ campaignId }) {
  setActiveNav('customers');
  const full = await agg.getCampaignFull(campaignId);
  if (!full) { navigate('/customers'); return; }
  const { campaign, media, summary, payments } = full;
  const displayName = campaign.name || campaign.productName || 'Kampanya';
  const active = calc.campaignIsActive(campaign, todayISO());

  // Paranın en çok hareket ettiği sayfa — FAB burada açık ve bu kampanyaya
  // önceden dolu Tahsilat/Ödeme seçimi sunuyor (§nav-redesign). Üstteki "+"
  // zaten Mecra Ekle'ye bağlı, o değişmiyor.
  setFabVisible(true);
  setFabAction(() => window.H.openCampaignQuickAddMenu(campaign.clientId, campaign.id));

  setTopbar(`
    <div class="left">
      <button class="back" onclick="H.goBack1('/customers/${campaign.clientId}/products/${campaign.productId}')">${icon('chevronLeft')}</button>
      <div><h1>${escapeHtml(displayName)}</h1><div class="sub">${escapeHtml(campaign.clientName || '')} · ${escapeHtml(campaign.productName || '')}</div></div>
    </div>
    <div class="right">
      <button class="icon-btn" onclick="H.openCampaignForm('${campaign.clientId}','${campaign.productId}','${campaign.id}')">${icon('pencil', {size:16})}</button>
      <button class="icon-btn add" onclick="H.openMediaForm('${campaign.id}')">${icon('plus')}</button>
    </div>
  `);
  setContent(`<div class="list-loading">Yükleniyor…</div>`);

  // §63: the FIRST thing shown must be which media types & vendors are used
  // in this campaign — before anything else.
  const mediaByType = agg.groupMediaByType(media);
  const campaignCheques = await repo.getChequesForCampaign(campaign.id);

  let html = '';

  // §64: obvious, prominent profit — not buried in a long list of rows.
  // §roles: kâr rakamı personelden gizli.
  if (isAdmin()) {
    html += `
      <div class="profit-banner">
        <div>
          <div class="label">Toplam Kâr</div>
          <div class="value">${fmt(summary.campaignProfit)}</div>
        </div>
        <div class="emoji">${icon('trendingUp', { size: 30 })}</div>
      </div>
    `;
  }

  html += `
    <div class="detail-card">
      <h3>Mecra / Yüklenici Özeti</h3>
      ${mediaByType.length === 0 ? `<p class="hint">Henüz mecra kaydı yok.</p>` : `
      <div class="usage-tags">
        ${mediaByType.map((g) => `<span class="usage-tag"><span style="cursor:pointer;" onclick="H.goto('/finance/vendor/t/${encodeURIComponent(g.mediaType)}')">${icon('monitor', { size: 13 })} <b>${escapeHtml(g.mediaType)}</b></span> <span class="vendors">${g.vendors.map((v) => `<span style="cursor:pointer;text-decoration:underline;" onclick="H.goto('/finance/vendor/${encodeURIComponent(v)}')">${escapeHtml(v)}</span>`).join(', ')}</span></span>`).join('')}
      </div>`}
    </div>

    <div class="detail-card">
      <h3>Kampanya Bilgisi</h3>
      <div class="detail-row"><span class="k">Durum</span><span class="v">${active ? '<span class="chip green">Aktif</span>' : '<span class="chip neutral">Pasif</span>'}</span></div>
      <div class="detail-row"><span class="k">Başlangıç</span><span class="v">${formatDate(campaign.startDate)}</span></div>
      <div class="detail-row"><span class="k">Bitiş</span><span class="v">${formatDate(campaign.endDate)}</span></div>
      ${campaign.note ? `<div class="note-box"><b>Not</b>${escapeHtml(campaign.note)}</div>` : ''}
    </div>

    <div class="detail-card">
      <h3>Genel Finansal Özet</h3>
      <div class="detail-row"><span class="k">Toplam Satış</span><span class="v">${fmt(summary.totalSales)}</span></div>
      ${isAdmin() ? `
      <div class="detail-row"><span class="k">Toplam Alış</span><span class="v">${fmt(summary.totalPurchase)}</span></div>
      <div class="detail-row amber"><span class="k">Toplam Ristorno</span><span class="v">${fmt(summary.totalRistorno)}</span></div>
      ${calc.hasAgencyFee(campaign) ? vatDetailRow('Ajans Ücreti', summary.agencyFee, campaign.agencyFeeVatRate, 'primary') : ''}
      <div class="detail-row total green"><span class="k">Toplam Kâr</span><span class="v">${fmt(summary.campaignProfit)}</span></div>` : ''}
    </div>

    <div class="detail-card">
      <h3><span class="icon-inline">${icon('users', { size: 15 })} Müşteri Hesabı</span></h3>
      <div class="detail-row"><span class="k">Müşteri Alacağı (KDV Dahil)</span><span class="v">${fmt(summary.customerReceivable)}</span></div>
      <div class="detail-row green"><span class="k">Tahsil Edilen</span><span class="v">${fmt(summary.customerCollected)}</span></div>
      <div class="detail-row red"><span class="k">Müşteriden Kalan</span><span class="v">${fmt(summary.customerRemaining)}</span></div>
      ${summary.customerExcess > 0 ? `<div class="detail-row amber"><span class="k">Fazla Tahsilat</span><span class="v">${fmt(summary.customerExcess)}</span></div>` : ''}
      <button class="btn small outline" style="width:100%;margin-top:10px;" onclick="H.openCollectionForm({clientId:'${campaign.clientId}',campaignId:'${campaign.id}'})">${icon('banknote', { size: 15 })} Tahsilat Ekle</button>
    </div>

    <div class="detail-card">
      <h3><span class="icon-inline">${icon('monitor', { size: 15 })} Mecra Hesabı</span></h3>
      <div class="detail-row"><span class="k">Toplam Mecra Borcu (KDV Dahil)</span><span class="v">${fmt(summary.totalNetPayable)}</span></div>
      <div class="detail-row green"><span class="k">Ödenen</span><span class="v">${fmt(summary.mediaPaid)}</span></div>
      <div class="detail-row red"><span class="k">Mecraya Kalan</span><span class="v">${fmt(summary.mediaRemaining)}</span></div>
      ${summary.mediaExcess > 0 ? `<div class="detail-row amber"><span class="k">Fazla Ödeme</span><span class="v">${fmt(summary.mediaExcess)}</span></div>` : ''}
      <button class="btn small outline" style="width:100%;margin-top:10px;" onclick="H.openCampaignPaymentPicker('${campaign.clientId}','${campaign.id}')">${icon('landmark', { size: 15 })} Ödeme Ekle</button>
    </div>

    <div class="section-title">Mecra / Yüklenici Kayıtları</div>
  `;

  if (media.length === 0) {
    html += emptyState(icon('monitor', { size: 32 }), 'Henüz mecra kaydı yok', 'Sağ üstteki + ile TV, radyo, dijital vb. bir mecra ekle.');
  } else {
    // §65: paid/remaining are recorded per (campaign, vendor) group (spec
    // §23/§62), not per media line — compute each vendor's group figures
    // once and pass them to every media row from that vendor.
    const activeMedia = media.filter((m) => !m.deleted);
    const vendorNames = [...new Set(activeMedia.map((m) => m.vendor))];
    const groupByVendor = {};
    vendorNames.forEach((v) => {
      const vendorMediaCount = activeMedia.filter((m) => m.vendor === v).length;
      const netPayable = calc.vendorGroupNetPayable(activeMedia, v);
      const paid = calc.vendorGroupPaid(payments, campaign.id, v);
      const { remaining } = calc.remainingAndExcess(netPayable, paid);
      groupByVendor[v] = { paid, remaining, shared: vendorMediaCount > 1 };
    });
    html += activeMedia.map((m) => mediaRowHtml(m, groupByVendor[m.vendor])).join('');
  }

  // §73: cheques tied to this campaign, cross-visible from the Campaign page.
  if (campaignCheques.length > 0) {
    html += `<div class="section-title">Çekler</div>`;
    const sortedCheques = [...campaignCheques].sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
    html += sortedCheques.map((c) => chequeRowHtml(c, { onDelete: (cc) => `H.deleteChequeRecord('${cc.id}')` })).join('');
  }

  html += `<button class="btn danger" onclick="H.deleteCampaign('${campaign.id}','${campaign.clientId}','${campaign.productId}')">Kampanyayı Sil</button>`;

  setContent(html);
}

// ============================================================================
// MECRA / YÜKLENİCİ DETAYI (media record)
// ============================================================================
export async function renderMediaDetail({ mediaId }) {
  setActiveNav('customers');
  const media = await repo.getMediaRecord(mediaId);
  if (!media) { navigate('/customers'); return; }
  const campaign = await repo.getCampaign(media.campaignId);

  // Her şey zaten belli (müşteri+kampanya+yüklenici) — FAB burada tek adımda
  // tam dolu bir Ödeme Ekle açar, sayfadaki mevcut butonla aynı hedefe gider
  // (§nav-redesign).
  setFabVisible(true);
  setFabAction(() => window.H.openPaymentForm({ clientId: campaign ? campaign.clientId : '', campaignId: media.campaignId, vendor: media.vendor }));
  const allMediaInCampaign = await repo.getMediaForCampaign(media.campaignId);
  const payments = (await repo.getPaymentsForCampaign(media.campaignId)).filter((p) => p.vendor === media.vendor);

  const ristorno = calc.mediaRistorno(media);
  const net = calc.mediaNetPayable(media);
  const profit = calc.mediaProfit(media);
  const vendorGroupNet = calc.vendorGroupNetPayable(allMediaInCampaign, media.vendor);
  const vendorPaid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const { remaining, excess } = calc.remainingAndExcess(vendorGroupNet, vendorPaid);
  const groupCount = calc.vendorGroupInCampaign(allMediaInCampaign, media.vendor).length;

  setTopbar(`
    <div class="left">
      <button class="back" onclick="H.goto('/campaigns/${media.campaignId}')">${icon('chevronLeft')}</button>
      <div><h1>${escapeHtml(media.vendor)}</h1><div class="sub">${escapeHtml(media.mediaType)} · ${escapeHtml(media.workType)}</div></div>
    </div>
    <div class="right">
      <button class="icon-btn" onclick="H.openMediaForm('${media.campaignId}','${media.id}')">${icon('pencil', {size:16})}</button>
    </div>
  `);

  let html = `
    <div class="detail-card">
      <h3>Mecra Bilgisi</h3>
      <div class="detail-row"><span class="k">Mecra</span><span class="v" style="cursor:pointer;text-decoration:underline;" onclick="H.goto('/finance/vendor/t/${encodeURIComponent(media.mediaType)}')">${escapeHtml(media.mediaType)}</span></div>
      <div class="detail-row"><span class="k">Yüklenici</span><span class="v" style="cursor:pointer;text-decoration:underline;" onclick="H.goto('/finance/vendor/${encodeURIComponent(media.vendor)}')">${escapeHtml(media.vendor)}</span></div>
      <div class="detail-row"><span class="k">İş Türü</span><span class="v">${escapeHtml(media.workType)}</span></div>
      <div class="detail-row"><span class="k">Tarih Aralığı</span><span class="v">${formatDate(media.startDate)} — ${formatDate(media.endDate)}</span></div>
      ${media.vatRate ? `<div class="detail-row"><span class="k">KDV</span><span class="v">${vatBadge(media.vatRate)}</span></div>` : ''}
      ${media.note ? `<div class="note-box"><b>Not</b>${escapeHtml(media.note)}</div>` : ''}
    </div>

    <div class="detail-card">
      <h3>Finansal Detay</h3>
      ${isAdmin() ? vatDetailRow('Alış', media.purchase, media.vatRate) : ''}
      ${vatDetailRow('Satış', media.sales, media.vatRate)}
      ${isAdmin() ? `<div class="detail-row amber"><span class="k">Ristorno % / Tutar</span><span class="v">%${fmtN(media.ristornoPercent)} · ${fmt(ristorno)}</span></div>` : ''}
      ${vatDetailRow('Net Ödenecek', net, media.vatRate)}
      ${isAdmin() ? `<div class="detail-row total green"><span class="k">Kâr</span><span class="v">${fmt(profit)}</span></div>` : ''}
      ${calc.isTV(media.mediaType) && isAdmin() ? `<div class="note-box"><b>TV Ristorno Kuralı</b>Ristorno ödemeden düşülmez; yıl sonunda TV Yıllık Ristorno üzerinden tahsil edilir.</div>` : ''}
    </div>

    <div class="detail-card">
      <h3>Ödeme Takibi${groupCount > 1 ? ' (bu tedarikçinin kampanyadaki tüm kayıtları)' : ''}</h3>
      <div class="detail-row"><span class="k">Ödenecek (KDV Dahil)</span><span class="v">${fmt(vendorGroupNet)}</span></div>
      <div class="detail-row green"><span class="k">Ödenen</span><span class="v">${fmt(vendorPaid)}</span></div>
      <div class="detail-row red"><span class="k">Kalan</span><span class="v">${fmt(remaining)}</span></div>
      ${excess > 0 ? `<div class="detail-row amber"><span class="k">Fazla Ödeme</span><span class="v">${fmt(excess)}</span></div>` : ''}
      <button class="btn small outline" style="margin-top:10px;width:100%" onclick="H.openPaymentForm({clientId:'${campaign ? campaign.clientId : ''}',campaignId:'${media.campaignId}',vendor:'${jsAttr(media.vendor)}'})">Ödeme Ekle</button>
    </div>

    <div class="section-title">Ödeme Geçmişi</div>
  `;

  if (payments.length === 0) {
    html += emptyState(icon('creditCard', { size: 32 }), 'Henüz ödeme yok', '');
  } else {
    const sorted = [...payments].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    html += sorted.map((p) => payRowHtml(p, {
      onClick: (pp) => `H.openPaymentDetail('${pp.id}')`,
      onDelete: (pp) => `H.deletePayment('${pp.id}','${media.campaignId}','${media.id}')`
    })).join('');
  }

  html += `<button class="btn danger" onclick="H.deleteMedia('${media.id}','${media.campaignId}')">Mecra Kaydını Sil</button>`;

  setContent(html);
}
