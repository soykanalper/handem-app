// ---------------------------------------------------------------------------
// aggregate.js — combines repo.js data fetches with calc.js formulas into
// ready-to-render bundles for screens. Data volumes for a single personal
// agency are small, so straightforward per-campaign fetches (rather than
// heavy joins/caching) keep this simple and correct.
// ---------------------------------------------------------------------------
import * as repo from './repo.js';
import * as calc from './calc.js';
import { todayISO } from './util.js';

export async function getCampaignFull(campaignId) {
  const campaign = await repo.getCampaign(campaignId);
  if (!campaign) return null;
  const [media, collections, payments] = await Promise.all([
    repo.getMediaForCampaign(campaignId),
    repo.getCollectionsForCampaign(campaignId),
    repo.getPaymentsForCampaign(campaignId)
  ]);
  const summary = calc.campaignSummary(campaign, media, collections, payments);
  return { campaign, media, collections, payments, summary };
}

export async function getCampaignsWithSummary(campaigns) {
  return Promise.all(campaigns.map(async (c) => {
    const [media, collections, payments] = await Promise.all([
      repo.getMediaForCampaign(c.id),
      repo.getCollectionsForCampaign(c.id),
      repo.getPaymentsForCampaign(c.id)
    ]);
    const summary = calc.campaignSummary(c, media, collections, payments);
    return { campaign: c, media, collections, payments, summary, active: calc.campaignIsActive(c, todayISO()) };
  }));
}

export async function getClientAggregate(clientId) {
  const campaigns = await repo.getCampaignsForClient(clientId);
  const withSummary = await getCampaignsWithSummary(campaigns);
  const activeCount = withSummary.filter((c) => c.active).length;
  const totalSummary = calc.sumCampaignSummaries(withSummary.map((c) => c.summary));
  return { campaigns: withSummary, activeCount, totalSummary };
}

export async function getAllClientsAggregate() {
  const clients = await repo.getClients();
  const results = [];
  for (const client of clients) {
    const agg = await getClientAggregate(client.id);
    results.push({ client, ...agg });
  }
  return results;
}

// Whole-business financial overview for the Ana Sayfa (home) screen — sums
// every client's totals (which are themselves already summed across that
// client's campaigns) into one global picture. Purely derived, always
// dynamic — nothing here is stored or hardcoded.
export async function getBusinessOverview() {
  const clients = await getAllClientsAggregate();
  const totals = clients.reduce((acc, r) => {
    const s = r.totalSummary;
    return {
      totalPurchase: acc.totalPurchase + s.totalPurchase,
      totalSales: acc.totalSales + s.totalSales,
      totalRistorno: acc.totalRistorno + s.totalRistorno,
      campaignProfit: acc.campaignProfit + s.campaignProfit,
      customerReceivable: acc.customerReceivable + s.customerReceivable,
      customerCollected: acc.customerCollected + s.customerCollected,
      customerRemaining: acc.customerRemaining + s.customerRemaining,
      customerExcess: acc.customerExcess + s.customerExcess
    };
  }, {
    totalPurchase: 0, totalSales: 0, totalRistorno: 0, campaignProfit: 0,
    customerReceivable: 0, customerCollected: 0, customerRemaining: 0, customerExcess: 0
  });
  return { clients, totals };
}

export async function getProductCampaignCount(productId) {
  const campaigns = await repo.getCampaignsForProduct(productId);
  return campaigns.length;
}

// Dedup media types & vendors actually used across a product's campaigns, plus
// active/passive counts — used on Customer→Products cards (§56) and the
// Product detail summary header (§57). Purely derived, nothing to maintain.
export async function getProductMediaVendorSummary(productId) {
  const campaigns = await repo.getCampaignsForProduct(productId);
  const today = todayISO();
  let activeCount = 0, passiveCount = 0;
  const mediaTypes = new Set();
  const vendors = new Set();
  for (const c of campaigns) {
    if (calc.campaignIsActive(c, today)) activeCount++; else passiveCount++;
    const media = await repo.getMediaForCampaign(c.id);
    media.forEach((m) => { mediaTypes.add(m.mediaType); vendors.add(m.vendor); });
  }
  return {
    totalCount: campaigns.length, activeCount, passiveCount,
    mediaTypes: [...mediaTypes].sort((a, b) => a.localeCompare(b, 'tr')),
    vendors: [...vendors].sort((a, b) => a.localeCompare(b, 'tr'))
  };
}

// Groups a campaign's media records as MediaType -> [vendors] (deduped), for
// the "which media/vendors are used here" summary shown first on Campaign
// Detail (§63).
export function groupMediaByType(mediaList) {
  const byType = new Map();
  (mediaList || []).filter((m) => !m.deleted).forEach((m) => {
    if (!byType.has(m.mediaType)) byType.set(m.mediaType, new Set());
    byType.get(m.mediaType).add(m.vendor);
  });
  return [...byType.entries()].map(([mediaType, vendorSet]) => ({
    mediaType, vendors: [...vendorSet].sort((a, b) => a.localeCompare(b, 'tr'))
  })).sort((a, b) => a.mediaType.localeCompare(b.mediaType, 'tr'));
}

// -------- vendor aggregation across all campaigns ----------------------------
export async function getVendorAggregate(vendorName) {
  const allMedia = await repo.getAllMedia();
  const vendorMedia = allMedia.filter((m) => m.vendor === vendorName);
  const campaignIds = [...new Set(vendorMedia.map((m) => m.campaignId))];
  const campaigns = [];
  let totalNetPayable = 0, totalPaid = 0, totalPurchase = 0, totalRistorno = 0, totalSales = 0, totalProfit = 0;
  const mediaTypes = new Set();
  for (const cid of campaignIds) {
    const campaign = await repo.getCampaign(cid);
    const mediaInCampaign = vendorMedia.filter((m) => m.campaignId === cid);
    mediaInCampaign.forEach((m) => mediaTypes.add(m.mediaType));
    const netPayable = calc.vendorGroupNetPayable(mediaInCampaign, vendorName);
    const payments = (await repo.getPaymentsForCampaign(cid)).filter((p) => !p.deleted && p.vendor === vendorName);
    const paid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const { remaining, excess } = calc.remainingAndExcess(netPayable, paid);
    const purchase = mediaInCampaign.reduce((s, m) => s + (Number(m.purchase) || 0), 0);
    const sales = mediaInCampaign.reduce((s, m) => s + (Number(m.sales) || 0), 0);
    const ristorno = mediaInCampaign.reduce((s, m) => s + calc.mediaRistorno(m), 0);
    const profit = mediaInCampaign.reduce((s, m) => s + calc.mediaProfit(m), 0);
    totalNetPayable += netPayable; totalPaid += paid; totalPurchase += purchase; totalRistorno += ristorno;
    totalSales += sales; totalProfit += profit;
    campaigns.push({
      campaign, media: mediaInCampaign, netPayable, paid, remaining, excess, payments,
      purchase, sales, ristorno, profit, mediaTypesInCampaign: [...new Set(mediaInCampaign.map((m) => m.mediaType))]
    });
  }
  const totals = calc.remainingAndExcess(totalNetPayable, totalPaid);
  return {
    vendor: vendorName,
    mediaTypes: [...mediaTypes].sort((a, b) => a.localeCompare(b, 'tr')),
    campaigns: campaigns.filter((c) => c.campaign && !c.campaign.deleted),
    totalNetPayable, totalPaid, totalPurchase, totalRistorno, totalSales, totalProfit,
    totalRemaining: totals.remaining, totalExcess: totals.excess
  };
}

export async function getAllVendorsAggregate() {
  const names = await repo.getAllVendorNames();
  const results = [];
  for (const name of names) {
    const agg = await getVendorAggregate(name);
    if (agg.campaigns.length > 0) results.push(agg);
  }
  return results;
}

export async function getFinanceCustomerTotals() {
  const clients = await getAllClientsAggregate();
  const totals = clients.reduce((acc, c) => ({
    receivable: acc.receivable + c.totalSummary.customerReceivable,
    collected: acc.collected + c.totalSummary.customerCollected,
    remaining: acc.remaining + c.totalSummary.customerRemaining
  }), { receivable: 0, collected: 0, remaining: 0 });
  return { clients, totals };
}

export async function getFinanceVendorTotals() {
  const vendors = await getAllVendorsAggregate();
  const totals = vendors.reduce((acc, v) => ({
    debt: acc.debt + v.totalNetPayable,
    paid: acc.paid + v.totalPaid,
    remaining: acc.remaining + v.totalRemaining
  }), { debt: 0, paid: 0, remaining: 0 });
  return { vendors, totals };
}

// -------- Media Type -> Vendor hierarchy (§58-61) -----------------------------
// "Media" area: MediaType -> Vendors -> Campaigns -> Financial activity.
// Lives under Finans -> Mecra (bottom nav stays the 3 fixed tabs per §4).
export async function getMediaTypeOverview() {
  const [allMedia, allTypeNames] = await Promise.all([repo.getAllMedia(), repo.getAllMediaTypeNames()]);
  const today = todayISO();
  const usedTypes = new Set(allMedia.map((m) => m.mediaType));
  allTypeNames.forEach((t) => usedTypes.add(t));

  const results = [];
  for (const mediaType of usedTypes) {
    const mediaOfType = allMedia.filter((m) => m.mediaType === mediaType);
    if (mediaOfType.length === 0) continue; // skip unused default types entirely
    const vendorNames = new Set(mediaOfType.map((m) => m.vendor));
    const campaignIds = new Set(mediaOfType.map((m) => m.campaignId));
    let activeCampaignCount = 0;
    for (const cid of campaignIds) {
      const c = await repo.getCampaign(cid);
      if (c && !c.deleted && calc.campaignIsActive(c, today)) activeCampaignCount++;
    }
    const totalPurchase = mediaOfType.reduce((s, m) => s + (Number(m.purchase) || 0), 0);
    const totalSales = mediaOfType.reduce((s, m) => s + (Number(m.sales) || 0), 0);
    const totalRistorno = mediaOfType.reduce((s, m) => s + calc.mediaRistorno(m), 0);
    let totalPaid = 0, totalNetPayable = 0;
    for (const v of vendorNames) {
      const vendorMediaAllCampaigns = mediaOfType.filter((m) => m.vendor === v);
      const byCampaign = new Map();
      vendorMediaAllCampaigns.forEach((m) => {
        if (!byCampaign.has(m.campaignId)) byCampaign.set(m.campaignId, []);
        byCampaign.get(m.campaignId).push(m);
      });
      for (const [cid, list] of byCampaign) {
        totalNetPayable += calc.vendorGroupNetPayable(list, v);
        const payments = (await repo.getPaymentsForCampaign(cid)).filter((p) => !p.deleted && p.vendor === v);
        totalPaid += payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
      }
    }
    const { remaining } = calc.remainingAndExcess(totalNetPayable, totalPaid);
    results.push({
      mediaType, vendorCount: vendorNames.size, activeCampaignCount,
      totalPurchase, totalSales, totalRistorno, totalPaid, totalNetPayable, totalRemaining: remaining
    });
  }
  return results.sort((a, b) => a.mediaType.localeCompare(b.mediaType, 'tr'));
}

export async function getVendorsForType(mediaType) {
  const allVendors = await getAllVendorsAggregate();
  return allVendors.filter((v) => v.mediaTypes.includes(mediaType));
}
