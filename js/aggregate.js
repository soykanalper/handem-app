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
  // §perf: was a sequential for-loop (await one client fully before starting
  // the next) — in cloud/Firestore mode that serializes every client's whole
  // query chain behind network latency, one after another. Promise.all runs
  // them concurrently instead; the returned order still matches `clients`
  // exactly (Promise.all preserves array order regardless of completion
  // order), so nothing downstream changes except speed.
  return Promise.all(clients.map(async (client) => {
    const agg = await getClientAggregate(client.id);
    return { client, ...agg };
  }));
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
  const mediaLists = await Promise.all(campaigns.map((c) => repo.getMediaForCampaign(c.id)));
  campaigns.forEach((c, i) => {
    if (calc.campaignIsActive(c, today)) activeCount++; else passiveCount++;
    mediaLists[i].forEach((m) => { mediaTypes.add(m.mediaType); vendors.add(m.vendor); });
  });
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
  const mediaTypes = new Set();

  // §perf: each campaign's (campaign, payments) fetch used to happen one
  // campaign at a time — parallelized here. Sets/array pushes inside a map
  // callback stay safe because each callback's synchronous work (after its
  // own await resolves) always finishes in one uninterrupted turn before
  // another callback's continuation can run — JS never actually interleaves
  // two callbacks' synchronous statements.
  const perCampaign = await Promise.all(campaignIds.map(async (cid) => {
    const [campaign, paymentsRaw] = await Promise.all([
      repo.getCampaign(cid),
      repo.getPaymentsForCampaign(cid)
    ]);
    const mediaInCampaign = vendorMedia.filter((m) => m.campaignId === cid);
    mediaInCampaign.forEach((m) => mediaTypes.add(m.mediaType));
    const netPayable = calc.vendorGroupNetPayable(mediaInCampaign, vendorName);
    const payments = paymentsRaw.filter((p) => !p.deleted && p.vendor === vendorName);
    const paid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const { remaining, excess } = calc.remainingAndExcess(netPayable, paid);
    const purchase = mediaInCampaign.reduce((s, m) => s + (Number(m.purchase) || 0), 0);
    const sales = mediaInCampaign.reduce((s, m) => s + (Number(m.sales) || 0), 0);
    const ristorno = mediaInCampaign.reduce((s, m) => s + calc.mediaRistorno(m), 0);
    const profit = mediaInCampaign.reduce((s, m) => s + calc.mediaProfit(m), 0);
    return {
      campaign, media: mediaInCampaign, netPayable, paid, remaining, excess, payments,
      purchase, sales, ristorno, profit, mediaTypesInCampaign: [...new Set(mediaInCampaign.map((m) => m.mediaType))]
    };
  }));

  const totalsAgg = perCampaign.reduce((acc, c) => ({
    totalNetPayable: acc.totalNetPayable + c.netPayable,
    totalPaid: acc.totalPaid + c.paid,
    totalPurchase: acc.totalPurchase + c.purchase,
    totalRistorno: acc.totalRistorno + c.ristorno,
    totalSales: acc.totalSales + c.sales,
    totalProfit: acc.totalProfit + c.profit
  }), { totalNetPayable: 0, totalPaid: 0, totalPurchase: 0, totalRistorno: 0, totalSales: 0, totalProfit: 0 });

  const totals = calc.remainingAndExcess(totalsAgg.totalNetPayable, totalsAgg.totalPaid);
  return {
    vendor: vendorName,
    mediaTypes: [...mediaTypes].sort((a, b) => a.localeCompare(b, 'tr')),
    campaigns: perCampaign.filter((c) => c.campaign && !c.campaign.deleted),
    ...totalsAgg,
    totalRemaining: totals.remaining, totalExcess: totals.excess
  };
}

export async function getAllVendorsAggregate() {
  const names = await repo.getAllVendorNames();
  const results = await Promise.all(names.map((name) => getVendorAggregate(name)));
  return results.filter((agg) => agg.campaigns.length > 0);
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
  const typesWithMedia = [...usedTypes].filter((mediaType) => allMedia.some((m) => m.mediaType === mediaType));

  // §perf: this used to be three nested sequential for-loops (media type ->
  // campaign -> vendor/campaign pair), each `await`-ing one network round
  // trip at a time. Parallelized at every level with Promise.all; totals are
  // summed with reduce() after each level's results are in, instead of
  // mutating shared counters between awaits.
  const results = await Promise.all(typesWithMedia.map(async (mediaType) => {
    const mediaOfType = allMedia.filter((m) => m.mediaType === mediaType);
    const vendorNames = [...new Set(mediaOfType.map((m) => m.vendor))];
    const campaignIds = [...new Set(mediaOfType.map((m) => m.campaignId))];

    const campaignRecords = await Promise.all(campaignIds.map((cid) => repo.getCampaign(cid)));
    const activeCampaignCount = campaignRecords.filter((c) => c && !c.deleted && calc.campaignIsActive(c, today)).length;

    const totalPurchase = mediaOfType.reduce((s, m) => s + (Number(m.purchase) || 0), 0);
    const totalSales = mediaOfType.reduce((s, m) => s + (Number(m.sales) || 0), 0);
    const totalRistorno = mediaOfType.reduce((s, m) => s + calc.mediaRistorno(m), 0);

    const vendorTotals = await Promise.all(vendorNames.map(async (v) => {
      const vendorMediaAllCampaigns = mediaOfType.filter((m) => m.vendor === v);
      const byCampaign = new Map();
      vendorMediaAllCampaigns.forEach((m) => {
        if (!byCampaign.has(m.campaignId)) byCampaign.set(m.campaignId, []);
        byCampaign.get(m.campaignId).push(m);
      });
      const perCampaign = await Promise.all([...byCampaign.entries()].map(async ([cid, list]) => {
        const netPayable = calc.vendorGroupNetPayable(list, v);
        const payments = (await repo.getPaymentsForCampaign(cid)).filter((p) => !p.deleted && p.vendor === v);
        const paid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
        return { netPayable, paid };
      }));
      return perCampaign.reduce((acc, x) => ({ netPayable: acc.netPayable + x.netPayable, paid: acc.paid + x.paid }), { netPayable: 0, paid: 0 });
    }));

    const totalNetPayable = vendorTotals.reduce((s, v) => s + v.netPayable, 0);
    const totalPaid = vendorTotals.reduce((s, v) => s + v.paid, 0);
    const { remaining } = calc.remainingAndExcess(totalNetPayable, totalPaid);

    return {
      mediaType, vendorCount: vendorNames.length, activeCampaignCount,
      totalPurchase, totalSales, totalRistorno, totalPaid, totalNetPayable, totalRemaining: remaining
    };
  }));

  return results.sort((a, b) => a.mediaType.localeCompare(b.mediaType, 'tr'));
}

export async function getVendorsForType(mediaType) {
  const allVendors = await getAllVendorsAggregate();
  return allVendors.filter((v) => v.mediaTypes.includes(mediaType));
}
