// ---------------------------------------------------------------------------
// calc.js — every financial formula in the app lives here, pure functions
// only (no DOM, no IndexedDB). Keeping this isolated makes the business
// logic easy to verify against the spec independently of rendering.
// ---------------------------------------------------------------------------

export const TV_TYPE = 'TV';

export function isTV(mediaType) {
  return (mediaType || '').trim().toUpperCase() === TV_TYPE;
}

// ---- VAT / KDV --------------------------------------------------------------
// Every price the user enters is VAT-EXCLUSIVE (net) by definition — that net
// value is always the source of truth for every business/profit calculation
// (§55.5). vatRate is purely a display/informational overlay: null/undefined
// means "no VAT selected", otherwise it's 14 or 20. VAT-inclusive amounts are
// always derived on the fly from (net, vatRate) — never stored or used as the
// base for further math.
export const VAT_RATES = [
  { value: '', label: 'KDV Yok / Boş' },
  { value: '14', label: '%14' },
  { value: '20', label: '%20' }
];

export function vatAmount(netAmount, vatRate) {
  const rate = Number(vatRate) || 0;
  if (!rate) return 0;
  return (Number(netAmount) || 0) * (rate / 100);
}

export function vatInclusive(netAmount, vatRate) {
  return (Number(netAmount) || 0) + vatAmount(netAmount, vatRate);
}

// ---- per media/vendor record ----------------------------------------------
export function mediaRistorno(media) {
  const purchase = Number(media.purchase) || 0;
  const pct = Number(media.ristornoPercent) || 0;
  return purchase * (pct / 100);
}

// Non-TV: ristorno is deducted from what's owed to the vendor.
// TV: ristorno is NOT deducted — full purchase stays payable, ristorno becomes
// a separate receivable from the TV vendor (tracked via TV Yıllık Ristorno).
export function mediaNetPayable(media) {
  const purchase = Number(media.purchase) || 0;
  if (isTV(media.mediaType)) return purchase;
  return purchase - mediaRistorno(media);
}

export function mediaProfit(media) {
  const sales = Number(media.sales) || 0;
  const purchase = Number(media.purchase) || 0;
  return sales - purchase + mediaRistorno(media);
}

// ---- campaign aggregates ----------------------------------------------------
export function campaignMediaTotals(mediaList) {
  const list = (mediaList || []).filter((m) => !m.deleted);
  const totalSales = list.reduce((s, m) => s + (Number(m.sales) || 0), 0);
  const totalPurchase = list.reduce((s, m) => s + (Number(m.purchase) || 0), 0);
  const totalRistorno = list.reduce((s, m) => s + mediaRistorno(m), 0);
  const totalNetPayable = list.reduce((s, m) => s + mediaNetPayable(m), 0);
  const totalProfit = list.reduce((s, m) => s + mediaProfit(m), 0);
  return { totalSales, totalPurchase, totalRistorno, totalNetPayable, totalProfit };
}

// campaign.agencyFeeType: 'none' | 'percent' | 'fixed'
export function campaignAgencyFee(campaign, totalSales) {
  if (!campaign || !campaign.agencyFeeType || campaign.agencyFeeType === 'none') return 0;
  if (campaign.agencyFeeType === 'percent') {
    return totalSales * ((Number(campaign.agencyFeeValue) || 0) / 100);
  }
  if (campaign.agencyFeeType === 'fixed') {
    return Number(campaign.agencyFeeValue) || 0;
  }
  return 0;
}

export function hasAgencyFee(campaign) {
  return !!campaign && campaign.agencyFeeType && campaign.agencyFeeType !== 'none' && Number(campaign.agencyFeeValue) > 0;
}

export function campaignSummary(campaign, mediaList, collections, payments) {
  const { totalSales, totalPurchase, totalRistorno, totalNetPayable, totalProfit } = campaignMediaTotals(mediaList);
  const agencyFee = campaignAgencyFee(campaign, totalSales);
  const campaignProfit = totalProfit + agencyFee;

  const customerReceivable = totalSales + agencyFee;
  const customerCollected = (collections || []).filter((c) => !c.deleted).reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const customerRemaining = Math.max(0, customerReceivable - customerCollected);
  const customerExcess = Math.max(0, customerCollected - customerReceivable);

  const mediaPaid = (payments || []).filter((p) => !p.deleted).reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const mediaRemaining = Math.max(0, totalNetPayable - mediaPaid);
  const mediaExcess = Math.max(0, mediaPaid - totalNetPayable);

  return {
    totalSales, totalPurchase, totalRistorno, totalNetPayable, totalProfit,
    agencyFee, campaignProfit,
    customerReceivable, customerCollected, customerRemaining, customerExcess,
    mediaPaid, mediaRemaining, mediaExcess
  };
}

// ---- vendor-within-campaign grouping ---------------------------------------
// Vendor payments are recorded at (campaign, vendor) granularity, not per
// individual media line (spec §23). When a vendor appears more than once in
// the same campaign, its net payable / paid / remaining are shown at that
// grouped level on every one of that vendor's media detail screens.
export function vendorGroupInCampaign(mediaList, vendor) {
  return (mediaList || []).filter((m) => !m.deleted && m.vendor === vendor);
}

export function vendorGroupNetPayable(mediaList, vendor) {
  return vendorGroupInCampaign(mediaList, vendor).reduce((s, m) => s + mediaNetPayable(m), 0);
}

export function vendorGroupPaid(payments, campaignId, vendor) {
  return (payments || [])
    .filter((p) => !p.deleted && p.campaignId === campaignId && p.vendor === vendor)
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);
}

export function remainingAndExcess(payableOrReceivable, paidOrCollected) {
  const remaining = Math.max(0, payableOrReceivable - paidOrCollected);
  const excess = Math.max(0, paidOrCollected - payableOrReceivable);
  return { remaining, excess };
}

// ---- customer totals across many campaigns ---------------------------------
export function sumCampaignSummaries(summaries) {
  return summaries.reduce((acc, s) => ({
    totalSales: acc.totalSales + s.totalSales,
    totalPurchase: acc.totalPurchase + s.totalPurchase,
    totalRistorno: acc.totalRistorno + s.totalRistorno,
    agencyFee: acc.agencyFee + s.agencyFee,
    campaignProfit: acc.campaignProfit + s.campaignProfit,
    customerReceivable: acc.customerReceivable + s.customerReceivable,
    customerCollected: acc.customerCollected + s.customerCollected,
    customerRemaining: acc.customerRemaining + s.customerRemaining,
    customerExcess: acc.customerExcess + s.customerExcess,
    totalNetPayable: acc.totalNetPayable + s.totalNetPayable,
    mediaPaid: acc.mediaPaid + s.mediaPaid,
    mediaRemaining: acc.mediaRemaining + s.mediaRemaining,
    mediaExcess: acc.mediaExcess + s.mediaExcess
  }), {
    totalSales: 0, totalPurchase: 0, totalRistorno: 0, agencyFee: 0, campaignProfit: 0,
    customerReceivable: 0, customerCollected: 0, customerRemaining: 0, customerExcess: 0,
    totalNetPayable: 0, mediaPaid: 0, mediaRemaining: 0, mediaExcess: 0
  });
}

// ---- campaign status --------------------------------------------------------
export function campaignIsActive(campaign, todayISO) {
  if (!campaign.endDate) return true;
  return campaign.endDate >= todayISO;
}

// ---- cheque status helpers ---------------------------------------------------
export const CHEQUE_MANUAL_STATUSES = ['Ödendi', 'Karşılıksız', 'İptal'];

export function chequeDisplayStatus(cheque, todayISO) {
  if (CHEQUE_MANUAL_STATUSES.includes(cheque.status)) return cheque.status;
  if (cheque.dueDate === todayISO) return 'Vadesi Gelen';
  if (cheque.dueDate && cheque.dueDate < todayISO) return 'Vadesi Gelen';
  return cheque.direction === 'received' ? 'Alındı' : 'Verildi';
}
