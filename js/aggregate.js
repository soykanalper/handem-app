// ---------------------------------------------------------------------------
// aggregate.js — combines repo.js data fetches with calc.js formulas into
// ready-to-render bundles for screens. Data volumes for a single personal
// agency are small, so straightforward per-campaign fetches (rather than
// heavy joins/caching) keep this simple and correct.
// ---------------------------------------------------------------------------
import * as repo from './repo.js';
import * as calc from './calc.js';
import { todayISO, normKey } from './util.js';

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
  // §musteri-mecra-eslesme: customerRemaining/customerExcess'i artık ham
  // client-wide toplamdan DEĞİL, her (müşteri,mecra) çiftinin kendi
  // bağımsız remaining/excess'inin toplamından alıyoruz — bir mecradaki
  // fazla, başka bir mecranın kalanını asla kapatmasın diye. `+
  // unattributedCollected` sadece bu alan eklenmeden önce girilmiş, birden
  // fazla mecralı bir kampanyaya ait eski/etiketsiz tahsilatlar için —
  // hangi mecraya ait olduğu bilinmediğinden fazlaya da kalan hesabına da
  // dahil edilmiyor, ayrı bir "mecra belirtilmemiş" rakamı olarak duruyor.
  // §perf-pair: getClientVendorPairs(clientId) burada AYRICA çağrılıp
  // kampanya + mecra + tahsilat verisi ikinci kez çekilmiyordu (aynı veri
  // hem getCampaignsWithSummary hem getClientVendorPairs tarafından
  // bağımsız olarak çekiliyordu — client başına iki katı Firestore
  // round-trip'i, ve bu da müşteri detayı/Ana Sayfa/Finans→Müşteri
  // sayfalarının yavaş açılmasının asıl sebebiydi). Artık computeClientVendorPairs
  // (saf/I-O'suz fonksiyon) doğrudan yukarıda zaten çekilmiş olan
  // withSummary'nin media/collections'ını kullanıyor — hiçbir ekstra sorgu
  // atılmıyor.
  const vendorPairsResult = computeClientVendorPairs(
    withSummary.map((c) => ({ campaign: c.campaign, media: c.media, collections: c.collections }))
  );
  const vendorPairs = vendorPairsResult.pairs;
  const customerRemaining = vendorPairs.reduce((s, p) => s + p.remaining, 0);
  const customerExcess = vendorPairs.reduce((s, p) => s + p.excess, 0);
  totalSummary.customerRemaining = customerRemaining;
  totalSummary.customerExcess = customerExcess;
  return {
    campaigns: withSummary, activeCount, totalSummary,
    vendorPairs, unattributedCollected: vendorPairsResult.unattributedCollected
  };
}

// §musteri-mecra-eslesme: bir müşterinin "fazla tahsilat / kalan alacak"
// durumu artık müşterinin TÜMÜ için tek bir netleşme değil — kullanıcıyla
// konuşulup onaylanan kural gereği HER (müşteri, mecra/yüklenici) çifti
// kendi bağımsız hesabına sahip. Bir mecradaki fazla tahsilat başka bir
// mecranın kalan borcunu ASLA kapatamaz. Bir tahsilat elle bir mecraya
// işaretlenmişse (openCollectionForm'daki yeni alan) doğrudan ona yazılır;
// işaretlenmemişse VE o kampanyada tek mecra varsa otomatik ona gider
// (bölüştürme değil, zaten tek aday); kampanyada birden fazla mecra varken
// işaretlenmemiş bir tahsilat varsa (sadece bu alan eklenmeden önce
// girilmiş eski kayıtlarda olabilir — yeni tahsilatlarda form bunu zorunlu
// kılıyor) hiçbir mecraya yazılmaz, `unattributedCollected` içinde ayrı
// tutulur — asla tahmini bölüştürülmez.
// Saf/I-O'suz: {campaign, media, collections} listesinden (müşteri,mecra)
// çiftlerini hesaplar. getClientAggregate zaten çekilmiş withSummary
// verisini yeniden kullanabilsin diye ayrı bir fonksiyon (bkz. §perf-pair).
function computeClientVendorPairs(perCampaignData) {
  const pairs = new Map(); // vendorKey -> { vendor, receivable, collected }
  let unattributedCollected = 0;
  const unattributedCollections = [];

  (perCampaignData || []).forEach(({ campaign, media, collections }) => {
    const activeMedia = (media || []).filter((m) => !m.deleted);
    const activeCollections = (collections || []).filter((c) => !c.deleted);
    const vendorReceivables = calc.campaignVendorReceivables(campaign, activeMedia);
    vendorReceivables.forEach(({ vendorKey, vendor, receivable }) => {
      if (!pairs.has(vendorKey)) pairs.set(vendorKey, { vendor, receivable: 0, collected: 0 });
      pairs.get(vendorKey).receivable += receivable;
    });
    const vendorKeysInCampaign = vendorReceivables.map((v) => v.vendorKey);
    activeCollections.forEach((col) => {
      const amount = Number(col.amount) || 0;
      const explicitVendor = (col.vendor || '').trim();
      if (explicitVendor) {
        const key = normKey(explicitVendor);
        if (!pairs.has(key)) pairs.set(key, { vendor: explicitVendor, receivable: 0, collected: 0 });
        pairs.get(key).collected += amount;
      } else if (vendorKeysInCampaign.length === 1) {
        pairs.get(vendorKeysInCampaign[0]).collected += amount;
      } else {
        unattributedCollected += amount;
        unattributedCollections.push(col);
      }
    });
  });

  const list = [...pairs.entries()].map(([vendorKey, v]) => {
    const { remaining, excess } = calc.remainingAndExcess(v.receivable, v.collected);
    return { vendorKey, vendor: v.vendor, receivable: v.receivable, collected: v.collected, remaining, excess };
  }).sort((a, b) => a.vendor.localeCompare(b.vendor, 'tr'));

  return { pairs: list, unattributedCollected, unattributedCollections };
}

export async function getClientVendorPairs(clientId) {
  const campaigns = (await repo.getCampaignsForClient(clientId)).filter((c) => !c.deleted);
  const perCampaign = await Promise.all(campaigns.map(async (campaign) => {
    const [media, collections] = await Promise.all([
      repo.getMediaForCampaign(campaign.id),
      repo.getCollectionsForCampaign(campaign.id)
    ]);
    return { campaign, media, collections };
  }));
  return computeClientVendorPairs(perCampaign);
}

// §musteri-mecra-eslesme: yüklenici tarafı zaten baştan müşteri bazında
// kırılabilir durumda — Ödeme formunda müşteri+kampanya+yüklenici birlikte
// giriliyor, hiçbir tahmine gerek yok (bkz. calc.js vendorGroupNetPayable).
// Burada sadece bunu müşteri kırılımıyla topluyoruz.
// Saf/I-O'suz: bu yüklenicinin medyasını taşıyan kampanyalardan (her biri
// {campaign, media}) ve tüm ödemelerden (müşteri kırılımına bkz.
// getVendorAggregate'in de aynı fonksiyonu paylaşabilmesi için) (mecra,
// müşteri) çiftlerini hesaplar.
function computeVendorClientPairs(vendorName, campaignsForVendor, allPayments) {
  const vendorKey = normKey(vendorName);
  const byClient = new Map(); // clientId -> { clientName, payable, paid }
  (campaignsForVendor || []).forEach(({ campaign, media }) => {
    if (!campaign || campaign.deleted || !campaign.clientId) return;
    const payable = calc.vendorGroupNetPayable(media || [], vendorName);
    if (!byClient.has(campaign.clientId)) byClient.set(campaign.clientId, { clientName: campaign.clientName || '', payable: 0, paid: 0 });
    byClient.get(campaign.clientId).payable += payable;
  });

  (allPayments || []).filter((p) => !p.deleted && normKey(p.vendor) === vendorKey && p.clientId).forEach((p) => {
    if (!byClient.has(p.clientId)) byClient.set(p.clientId, { clientName: p.clientName || '', payable: 0, paid: 0 });
    byClient.get(p.clientId).paid += Number(p.amount) || 0;
  });

  return [...byClient.entries()].map(([clientId, v]) => {
    const { remaining, excess } = calc.remainingAndExcess(v.payable, v.paid);
    return { clientId, clientName: v.clientName, payable: v.payable, paid: v.paid, remaining, excess };
  }).sort((a, b) => a.clientName.localeCompare(b.clientName, 'tr'));
}

export async function getVendorClientPairs(vendorName) {
  const [allMedia, allPayments] = await Promise.all([repo.getAllMedia(), repo.getAllPayments()]);
  const vendorKey = normKey(vendorName);
  const vendorMedia = allMedia.filter((m) => !m.deleted && normKey(m.vendor) === vendorKey);
  const campaignIds = [...new Set(vendorMedia.map((m) => m.campaignId))];
  const campaigns = await Promise.all(campaignIds.map((id) => repo.getCampaign(id)));
  const campaignsForVendor = campaigns.map((campaign) => ({
    campaign,
    media: campaign ? vendorMedia.filter((m) => m.campaignId === campaign.id) : []
  }));
  return computeVendorClientPairs(vendorName, campaignsForVendor, allPayments);
}

// §musteri-mecra-eslesme: fazla tahsilat/ödeme genelde bir çekten doğuyor
// (kullanıcı: "genelde fazla ödeme sadece çekle oluyor") — bir (müşteri,
// mecra) çiftinin fazlasına tıklanınca kullanıcıyı doğrudan o çeke
// götürebilmek için, o çifte ait çek etiketli tahsilat kayıtlarından en
// güncelini (tarihe göre) buluyoruz. Attribution mantığı getClientVendorPairs
// ile BİREBİR aynı olmalı (elle etiketlenmiş kayıt VEYA kampanyada tek mecra
// varsa otomatik) — yoksa burada bulunan çek, oradaki toplamla tutarsız
// olabilir. Eşleşme yoksa null döner, çağıran taraf müşteri sayfasına düşer.
export async function findLatestChequeIdForClientVendorPair(clientId, vendorName) {
  const vendorKey = normKey(vendorName);
  const campaigns = (await repo.getCampaignsForClient(clientId)).filter((c) => !c.deleted);
  // §perf-pair: was a sequential for-loop (await each campaign's media+
  // collections one campaign at a time before starting the next) — parallelized
  // with Promise.all since each campaign's fetch/compute is independent; order
  // doesn't matter here since results are combined into one array and re-sorted
  // by date afterward anyway.
  const perCampaign = await Promise.all(campaigns.map(async (campaign) => {
    const [media, collections] = await Promise.all([
      repo.getMediaForCampaign(campaign.id),
      repo.getCollectionsForCampaign(campaign.id)
    ]);
    const vendorKeysInCampaign = [...new Set(media.filter((m) => !m.deleted && m.vendor).map((m) => normKey(m.vendor)))];
    return collections.filter((c) => !c.deleted && c.chequeId).filter((c) => {
      const explicitVendor = (c.vendor || '').trim();
      const resolvedKey = explicitVendor ? normKey(explicitVendor) : (vendorKeysInCampaign.length === 1 ? vendorKeysInCampaign[0] : null);
      return resolvedKey === vendorKey;
    });
  }));
  const candidates = perCampaign.flat();
  if (!candidates.length) return null;
  candidates.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return candidates[0].chequeId;
}

// §musteri-mecra-eslesme: yüklenici tarafında Ödeme kayıtları zaten baştan
// müşteri+mecra birlikte taşıdığı için (bkz. getVendorClientPairs) burada
// ayrıca kampanya bazlı bir çözümlemeye gerek yok — doğrudan filtrelenebilir.
export async function findLatestChequeIdForVendorClientPair(vendorName, clientId) {
  const vendorKey = normKey(vendorName);
  const allPayments = await repo.getAllPayments();
  const candidates = allPayments.filter((p) => !p.deleted && p.chequeId && p.clientId === clientId && normKey(p.vendor) === vendorKey);
  if (!candidates.length) return null;
  candidates.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return candidates[0].chequeId;
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

// §home-campaigns: flattens getBusinessOverview()'s per-client campaign
// lists into one cross-customer "active campaigns" list for the redesigned
// Ana Sayfa — newest-started first. Takes the `clients` array already
// returned by getBusinessOverview()/getAllClientsAggregate() so this never
// re-fetches anything; it's a pure reshape of data already in memory.
export function activeCampaignsFromClients(clients) {
  const rows = [];
  clients.forEach(({ client, campaigns }) => {
    campaigns.forEach((c) => {
      if (!c.active) return;
      rows.push({ campaign: c.campaign, clientName: client.name, media: c.media, summary: c.summary, active: true });
    });
  });
  rows.sort((a, b) => (b.campaign.startDate || '').localeCompare(a.campaign.startDate || ''));
  return rows;
}

// §gecmis-kampanyalar: activeCampaignsFromClients'in aynası — bu sefer PASİF
// (bitiş tarihi geçmiş) kampanyalar, en son biten en üstte. Ana Sayfa'daki
// "Geçmiş Kampanyalar" butonuyla açılan ayrı sayfa için; aynı `clients`
// verisini (getBusinessOverview() zaten çekmiş) yeniden kullanır, tekrar
// sorgu atmaz.
export function pastCampaignsFromClients(clients) {
  const rows = [];
  clients.forEach(({ client, campaigns }) => {
    campaigns.forEach((c) => {
      if (c.active) return;
      rows.push({ campaign: c.campaign, clientName: client.name, media: c.media, summary: c.summary, active: false });
    });
  });
  rows.sort((a, b) => (b.campaign.endDate || '').localeCompare(a.campaign.endDate || ''));
  return rows;
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
  const mediaTypes = new Map(); // §birlesik-yazim: typeKey -> ilk görülen yazım
  const vendors = new Map();
  const mediaLists = await Promise.all(campaigns.map((c) => repo.getMediaForCampaign(c.id)));
  campaigns.forEach((c, i) => {
    if (calc.campaignIsActive(c, today)) activeCount++; else passiveCount++;
    mediaLists[i].forEach((m) => {
      const tKey = normKey(m.mediaType);
      if (tKey && !mediaTypes.has(tKey)) mediaTypes.set(tKey, (m.mediaType || '').trim());
      const vKey = normKey(m.vendor);
      if (vKey && !vendors.has(vKey)) vendors.set(vKey, (m.vendor || '').trim());
    });
  });
  return {
    totalCount: campaigns.length, activeCount, passiveCount,
    mediaTypes: [...mediaTypes.values()].sort((a, b) => a.localeCompare(b, 'tr')),
    vendors: [...vendors.values()].sort((a, b) => a.localeCompare(b, 'tr'))
  };
}

// Groups a campaign's media records as MediaType -> [vendors] (deduped), for
// the "which media/vendors are used here" summary shown first on Campaign
// Detail (§63).
export function groupMediaByType(mediaList) {
  // §birlesik-yazim: hem mecra türü hem yüklenici adı normKey ile gruplanıyor
  // — farklı yazımla girilmiş aynı tür/yüklenici artık ayrı satır olarak
  // görünmüyor. Gösterilen yazım: o grupta ilk görülen (trim'lenmiş) metin.
  const byType = new Map(); // typeKey -> { label, vendors: Map(vendorKey -> label) }
  (mediaList || []).filter((m) => !m.deleted).forEach((m) => {
    const typeKey = normKey(m.mediaType);
    if (!byType.has(typeKey)) byType.set(typeKey, { label: (m.mediaType || '').trim(), vendors: new Map() });
    const entry = byType.get(typeKey);
    const vKey = normKey(m.vendor);
    if (!entry.vendors.has(vKey)) entry.vendors.set(vKey, (m.vendor || '').trim());
  });
  return [...byType.values()].map(({ label, vendors }) => ({
    mediaType: label, vendors: [...vendors.values()].sort((a, b) => a.localeCompare(b, 'tr'))
  })).sort((a, b) => a.mediaType.localeCompare(b.mediaType, 'tr'));
}

// -------- vendor aggregation across all campaigns ----------------------------
// §perf-pair: `preloaded` (optional) lets a caller that already fetched the
// whole business's media/payments/campaigns once (bkz. getAllVendorsAggregate)
// hand them in directly instead of each vendor independently re-fetching the
// entire collections again — this was the single biggest source of the
// "sistem yavaş açılıyor" şikayeti, çünkü Finans→Mecra ve Ana Sayfa her
// yüklenici için ayrı ayrı TÜM medya/ödeme koleksiyonlarını yeniden çekiyordu
// (yüklenici sayısı kadar katlanan gereksiz Firestore round-trip'i). Tek
// başına çağrıldığında (preloaded verilmezse) eskisi gibi kendi verisini
// çeker — public API/davranış aynı kalır.
export async function getVendorAggregate(vendorName, preloaded) {
  const [allMedia, allPayments, allCampaigns] = preloaded
    ? [preloaded.allMedia, preloaded.allPayments, preloaded.allCampaigns]
    : await Promise.all([repo.getAllMedia(), repo.getAllPayments(), repo.getAllCampaigns()]);
  // getAllCampaigns() (dbGetAll) siler-görünmeyenleri zaten dışarıda bırakır,
  // tıpkı eskiden `!c.campaign.deleted` filtresinin yaptığı gibi — silinmiş bir
  // kampanya bu Map'te bulunmaz, campaignsById.get(cid) undefined döner, ve
  // aşağıdaki `c.campaign && !c.campaign.deleted` filtresi onu yine dışarıda
  // bırakır (bkz. §musteri-mecra-eslesme'deki dbGet/dbGetAll notu).
  const campaignsById = new Map(allCampaigns.map((c) => [c.id, c]));
  const vendorKey = normKey(vendorName);
  const vendorMedia = allMedia.filter((m) => normKey(m.vendor) === vendorKey);
  const campaignIds = [...new Set(vendorMedia.map((m) => m.campaignId))];
  const mediaTypes = new Map(); // §birlesik-yazim: typeKey -> ilk görülen yazım

  // §perf-pair: artık ağ çağrısı içermeyen saf bir hesaplama — campaign ve
  // payments verisi yukarıda zaten (bir kez) çekilmiş allCampaigns/allPayments
  // içinden Map/filter ile bulunuyor, kampanya başına ayrı repo.getCampaign/
  // repo.getPaymentsForCampaign çağrısı atılmıyor.
  const perCampaign = campaignIds.map((cid) => {
    const campaign = campaignsById.get(cid);
    const paymentsRaw = allPayments.filter((p) => p.campaignId === cid);
    const mediaInCampaign = vendorMedia.filter((m) => m.campaignId === cid);
    const typesInCampaign = new Map();
    mediaInCampaign.forEach((m) => {
      const tKey = normKey(m.mediaType);
      const label = (m.mediaType || '').trim();
      if (!mediaTypes.has(tKey)) mediaTypes.set(tKey, label);
      if (!typesInCampaign.has(tKey)) typesInCampaign.set(tKey, label);
    });
    const netPayable = calc.vendorGroupNetPayable(mediaInCampaign, vendorName);
    const payments = paymentsRaw.filter((p) => !p.deleted && normKey(p.vendor) === vendorKey);
    const paid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const { remaining, excess } = calc.remainingAndExcess(netPayable, paid);
    const purchase = mediaInCampaign.reduce((s, m) => s + (Number(m.purchase) || 0), 0);
    const sales = mediaInCampaign.reduce((s, m) => s + (Number(m.sales) || 0), 0);
    const ristorno = mediaInCampaign.reduce((s, m) => s + calc.mediaRistorno(m), 0);
    const profit = mediaInCampaign.reduce((s, m) => s + calc.mediaProfit(m), 0);
    return {
      campaign, media: mediaInCampaign, netPayable, paid, remaining, excess, payments,
      purchase, sales, ristorno, profit, mediaTypesInCampaign: [...typesInCampaign.values()]
    };
  });

  const totalsAgg = perCampaign.reduce((acc, c) => ({
    totalNetPayable: acc.totalNetPayable + c.netPayable,
    totalPaid: acc.totalPaid + c.paid,
    totalPurchase: acc.totalPurchase + c.purchase,
    totalRistorno: acc.totalRistorno + c.ristorno,
    totalSales: acc.totalSales + c.sales,
    totalProfit: acc.totalProfit + c.profit
  }), { totalNetPayable: 0, totalPaid: 0, totalPurchase: 0, totalRistorno: 0, totalSales: 0, totalProfit: 0 });

  // §musteri-mecra-eslesme: totalRemaining/totalExcess'i artık bu
  // yüklenicinin TÜM müşterileri genelindeki ham nettendan DEĞİL, her
  // (müşteri,bu-yüklenici) çiftinin kendi bağımsız remaining/excess'inin
  // toplamından alıyoruz — bir müşteriye olan fazla ödeme başka bir
  // müşterinin kalan borcunu asla kapatmasın diye (bkz. getClientVendorPairs
  // ile birebir aynı mantık, yön tersine).
  // §perf-pair: getVendorClientPairs(vendorName) burada AYRICA çağrılıp tüm
  // medya/ödeme koleksiyonları üçüncü kez çekilmiyordu — computeVendorClientPairs
  // (saf fonksiyon) doğrudan yukarıda zaten elde bulunan perCampaign/allPayments
  // verisini kullanıyor.
  const campaignsForVendor = perCampaign.map((c) => ({ campaign: c.campaign, media: c.media }));
  const clientPairs = computeVendorClientPairs(vendorName, campaignsForVendor, allPayments);
  const totalRemaining = clientPairs.reduce((s, p) => s + p.remaining, 0);
  const totalExcess = clientPairs.reduce((s, p) => s + p.excess, 0);
  return {
    vendor: vendorName,
    mediaTypes: [...mediaTypes.values()].sort((a, b) => a.localeCompare(b, 'tr')),
    campaigns: perCampaign.filter((c) => c.campaign && !c.campaign.deleted),
    ...totalsAgg,
    clientPairs,
    totalRemaining, totalExcess
  };
}

// §perf-pair: allMedia/allPayments/allCampaigns TEK SEFER burada çekilip her
// yüklenici için paylaşılıyor — eskiden her yüklenici getVendorAggregate
// içinde bunları BAĞIMSIZ olarak yeniden çekiyordu (N yüklenici varsa N kat
// tekrar eden tüm-koleksiyon sorgusu). Finans→Mecra ve Ana Sayfa'nın yavaş
// açılmasının en büyük sebebi buydu.
export async function getAllVendorsAggregate() {
  const [names, allMedia, allPayments, allCampaigns] = await Promise.all([
    repo.getAllVendorNames(), repo.getAllMedia(), repo.getAllPayments(), repo.getAllCampaigns()
  ]);
  const preloaded = { allMedia, allPayments, allCampaigns };
  const results = await Promise.all(names.map((name) => getVendorAggregate(name, preloaded)));
  return results.filter((agg) => agg.campaigns.length > 0);
}

export async function getFinanceCustomerTotals() {
  const clients = await getAllClientsAggregate();
  // §fazla-tahsilat-netlestirme: her müşterinin totalSummary'si zaten kendi
  // kampanyaları arasında netleşmiş durumda (bkz. calc.sumCampaignSummaries)
  // — burada sadece müşterilerin kendi aralarında toplanıyor, birbirine
  // karışmıyor.
  const totals = clients.reduce((acc, c) => ({
    receivable: acc.receivable + c.totalSummary.customerReceivable,
    collected: acc.collected + c.totalSummary.customerCollected,
    remaining: acc.remaining + c.totalSummary.customerRemaining,
    excess: acc.excess + c.totalSummary.customerExcess
  }), { receivable: 0, collected: 0, remaining: 0, excess: 0 });
  return { clients, totals };
}

export async function getFinanceVendorTotals() {
  const vendors = await getAllVendorsAggregate();
  // §fazla-tahsilat-netlestirme: her yüklenicinin totalExcess'i zaten kendi
  // (tüm müşteriler/kampanyalar genelindeki) net hesabından geliyor —
  // burada sadece bu zaten-doğru rakamları yüklenicilerin kendi aralarında
  // topluyoruz, birbirine karıştırmıyoruz.
  const totals = vendors.reduce((acc, v) => ({
    debt: acc.debt + v.totalNetPayable,
    paid: acc.paid + v.totalPaid,
    remaining: acc.remaining + v.totalRemaining,
    excess: acc.excess + v.totalExcess
  }), { debt: 0, paid: 0, remaining: 0, excess: 0 });
  return { vendors, totals };
}

// -------- Media Type -> Vendor hierarchy (§58-61) -----------------------------
// "Media" area: MediaType -> Vendors -> Campaigns -> Financial activity.
// Lives under Finans -> Mecra (bottom nav stays the 3 fixed tabs per §4).
export async function getMediaTypeOverview() {
  const [allMedia, allTypeNames] = await Promise.all([repo.getAllMedia(), repo.getAllMediaTypeNames()]);
  const today = todayISO();

  // §birlesik-yazim: mecra türü kayıtları artık normKey ile gruplanıyor —
  // "Açık Hava" ve "açık hava" gibi farklı yazımlı kayıtlar tek bir kart
  // olarak birleşiyor. Gösterilen isim önce seçmeli listedeki resmi yazımdan
  // (allTypeNames) alınıyor, yoksa o gruptaki ilk görülen kayıttan.
  const officialByKey = new Map(allTypeNames.map((t) => [normKey(t), t]));
  const groups = new Map(); // typeKey -> { label, media: [] }
  allMedia.filter((m) => !m.deleted).forEach((m) => {
    const typeKey = normKey(m.mediaType);
    if (!typeKey) return;
    if (!groups.has(typeKey)) groups.set(typeKey, { label: officialByKey.get(typeKey) || (m.mediaType || '').trim(), media: [] });
    groups.get(typeKey).media.push(m);
  });

  // §perf: this used to be three nested sequential for-loops (media type ->
  // campaign -> vendor/campaign pair), each `await`-ing one network round
  // trip at a time. Parallelized at every level with Promise.all; totals are
  // summed with reduce() after each level's results are in, instead of
  // mutating shared counters between awaits.
  const results = await Promise.all([...groups.values()].map(async ({ label: mediaType, media: mediaOfType }) => {
    const vendorMap = new Map(); // vendorKey -> { label, media: [] }
    mediaOfType.forEach((m) => {
      const vKey = normKey(m.vendor);
      if (!vendorMap.has(vKey)) vendorMap.set(vKey, { label: (m.vendor || '').trim(), media: [] });
      vendorMap.get(vKey).media.push(m);
    });
    const campaignIds = [...new Set(mediaOfType.map((m) => m.campaignId))];

    const campaignRecords = await Promise.all(campaignIds.map((cid) => repo.getCampaign(cid)));
    const activeCampaignCount = campaignRecords.filter((c) => c && !c.deleted && calc.campaignIsActive(c, today)).length;

    const totalPurchase = mediaOfType.reduce((s, m) => s + (Number(m.purchase) || 0), 0);
    const totalSales = mediaOfType.reduce((s, m) => s + (Number(m.sales) || 0), 0);
    const totalRistorno = mediaOfType.reduce((s, m) => s + calc.mediaRistorno(m), 0);

    const vendorTotals = await Promise.all([...vendorMap.entries()].map(async ([vKey, { label: v, media: vendorMediaAllCampaigns }]) => {
      const byCampaign = new Map();
      vendorMediaAllCampaigns.forEach((m) => {
        if (!byCampaign.has(m.campaignId)) byCampaign.set(m.campaignId, []);
        byCampaign.get(m.campaignId).push(m);
      });
      const perCampaign = await Promise.all([...byCampaign.entries()].map(async ([cid, list]) => {
        const netPayable = calc.vendorGroupNetPayable(list, v);
        const payments = (await repo.getPaymentsForCampaign(cid)).filter((p) => !p.deleted && normKey(p.vendor) === vKey);
        const paid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
        return { netPayable, paid };
      }));
      return perCampaign.reduce((acc, x) => ({ netPayable: acc.netPayable + x.netPayable, paid: acc.paid + x.paid }), { netPayable: 0, paid: 0 });
    }));

    const totalNetPayable = vendorTotals.reduce((s, v) => s + v.netPayable, 0);
    const totalPaid = vendorTotals.reduce((s, v) => s + v.paid, 0);
    const { remaining } = calc.remainingAndExcess(totalNetPayable, totalPaid);

    return {
      mediaType, vendorCount: vendorMap.size, activeCampaignCount,
      totalPurchase, totalSales, totalRistorno, totalPaid, totalNetPayable, totalRemaining: remaining
    };
  }));

  return results.sort((a, b) => a.mediaType.localeCompare(b.mediaType, 'tr'));
}

export async function getVendorsForType(mediaType) {
  const allVendors = await getAllVendorsAggregate();
  const typeKey = normKey(mediaType);
  return allVendors.filter((v) => v.mediaTypes.some((t) => normKey(t) === typeKey));
}
