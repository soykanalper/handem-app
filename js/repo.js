// ---------------------------------------------------------------------------
// repo.js — higher-level data-access helpers built on top of db.js. Screens
// call these instead of talking to IndexedDB directly.
// ---------------------------------------------------------------------------
import { dbGetAll, dbGet, dbGetByIndex, createEntity, updateEntity, softDeleteEntity } from './cloud/db-router.js';
import { uid, normKey } from './util.js';

export const PAYMENT_TYPES = ['Nakit', 'Havale / EFT', 'Çek', 'Vadeli', 'Diğer'];

export const DEFAULT_MEDIA_TYPES = ['TV', 'Radio', 'Gazete', 'Açık Hava', 'Dijital', 'Sosyal Medya', 'YouTube', 'Instagram', 'Influencer', 'Sinema', 'Diğer'];
export const DEFAULT_WORK_TYPES = ['Reklam', 'Program Sponsorluk', 'Spot', 'Banner', 'Sosyal Medya', 'İçerik', 'Giydirme', 'Billboard', 'Diğer'];

// §yuklenici-secmeli: Mecra Türü "TV"/"Radio" seçildiğinde Yüklenici alanı bu
// küratörlü listelerle dolu geliyor — kullanıcının kendi geçmişte girdiği
// isimlerle birleştirilir (bkz. getVendorNamesForType). Liste eksik/yanlışsa
// "elle yazacağım" seçeneği her zaman açık kalır, hiçbir veri kaybı olmaz.
export const TV_CHANNELS = [
  'TRT 1', 'ATV', 'Show TV', 'Star TV', 'Kanal D', 'Fox TV', 'TV8', 'TV8.5', 'NOW',
  'Kanal 7', 'TRT Spor', 'TRT Haber', 'CNN Türk', 'NTV', 'Habertürk', 'A Haber',
  'TGRT Haber', 'Ülke TV', 'Bloomberg HT', 'beIN Sports', 'S Sport', 'TV100',
  'TRT Çocuk', 'TRT Belgesel', 'Beyaz TV', 'Halk TV', 'Sözcü TV', 'Tele1', 'Flash TV'
];
export const RADIO_CHANNELS = [
  'TRT Radyo 1', 'TRT FM', 'Kral FM', 'Kral Pop', 'Power FM', 'Power Türk',
  'Metro FM', 'Number1', 'Number1 Türk', 'Best FM', 'Süper FM', 'Radyo D',
  'Show Radyo', 'Alem FM', 'Joy FM', 'Joy Türk', 'Slow Türk', 'Radyo 7',
  'Virgin Radio Türkiye', 'Açık Radyo', 'Radyo Viva', 'Radyo Eksen'
];

// §is-turu-kuratorlu: TV_CHANNELS/RADIO_CHANNELS ile aynı mantık — her mecra
// türünde medya planlamada gerçekten var olan reklam/iş türlerinin
// (araştırılmış, güncel) küratörlü bir listesi. getWorkTypeNamesForType bu
// listeyi kullanıcının o türde bugüne kadar kendi elle girdiği gerçek iş
// türleriyle birleştirir — "Diğer" ve tanınmayan türlerde küratörlü liste
// yok, sadece geçmiş kayıtlar + her zaman açık olan "elle yaz" seçeneği.
// screens-forms.js'teki kalemFlavorForWorkType bu isimlerin çoğunu anahtar
// kelimeyle tanıyıp haftalık/adet/saniye takip birimini otomatik seçiyor.
export const WORK_TYPES_BY_MEDIA_TYPE = {
  'TV': ['Spot Reklam', 'Bant Reklam', 'Kuşak Reklam', 'Program Sponsorluk', 'Dizi Sponsorluk', 'Jenerik Altı Reklam', 'Ürün Yerleştirme', 'Advertorial'],
  'Radio': ['Spot Reklam', 'Jingle', 'Canlı Anons', 'Program Sponsorluk', 'Kuşak Reklam', 'Trafik / Hava Durumu Sponsorluk', 'Yarışma / Etkinlik Sponsorluk', 'Podcast Reklamı'],
  'Gazete': ['Tam Sayfa İlan', 'Yarım Sayfa İlan', 'Künye Reklamı', 'Advertorial', 'İlan Sponsorluk', 'Ek / Kupon Reklamı'],
  'Açık Hava': ['Billboard', 'Megalight', 'Megaboard', 'Raket (CLP)', 'Totem', 'Bina Giydirme', 'Araç Giydirme', 'Dijital LED Ekran', 'Cadde Bayrağı', 'Otobüs Durağı', 'Yer Grafiği'],
  'Dijital': ['Display / Banner Reklam', 'Arama Ağı Reklamı', 'Video Reklam', 'Native / Sponsorlu İçerik', 'E-posta Sponsorluk', 'Retargeting'],
  'Sosyal Medya': ['Sponsorlu Gönderi', 'Story Reklamı', 'Reels Reklamı', 'Marka İşbirliği', 'Topluluk Yönetimi'],
  'YouTube': ['Pre-roll Reklam', 'Mid-roll Reklam', 'Ürün Yerleştirme', 'Kanal Sponsorluk', 'Dedicated Video'],
  'Instagram': ['Sponsorlu Gönderi', 'Story Reklamı', 'Reels İşbirliği', 'Canlı Yayın Sponsorluk'],
  'Influencer': ['Ürün Yerleştirme', 'Sponsorlu Paylaşım', 'Etkinlik Katılımı', 'Uzun Vadeli Marka Elçiliği'],
  'Sinema': ['Fragman Öncesi Reklam', 'Salon Sponsorluk', 'Gişe Sponsorluk', 'Promosyon Etkinliği']
};
function curatedWorkTypesForType(mediaType) {
  const typeKey = normKey(mediaType);
  const matchKey = Object.keys(WORK_TYPES_BY_MEDIA_TYPE).find((k) => normKey(k) === typeKey);
  return matchKey ? WORK_TYPES_BY_MEDIA_TYPE[matchKey] : [];
}

// -------- clients ------------------------------------------------------------
export const getClients = () => dbGetAll('clients');
export const getClient = (id) => dbGet('clients', id);
export const createClient = (data) => createEntity('clients', data);
export const updateClient = (id, patch) => updateEntity('clients', id, patch);
export const deleteClient = (id) => softDeleteEntity('clients', id);

// -------- products -------------------------------------------------------------
export const getProductsForClient = (clientId) => dbGetByIndex('products', 'clientId', clientId);
export const getProduct = (id) => dbGet('products', id);
export const createProduct = (data) => createEntity('products', data);
export const updateProduct = (id, patch) => updateEntity('products', id, patch);
export const deleteProduct = (id) => softDeleteEntity('products', id);

// -------- campaigns -------------------------------------------------------------
export const getCampaignsForProduct = (productId) => dbGetByIndex('campaigns', 'productId', productId);
export const getCampaignsForClient = (clientId) => dbGetByIndex('campaigns', 'clientId', clientId);
export const getAllCampaigns = () => dbGetAll('campaigns');
export const getCampaign = (id) => dbGet('campaigns', id);
export const createCampaign = (data) => createEntity('campaigns', data);
export const updateCampaign = (id, patch) => updateEntity('campaigns', id, patch);
export const deleteCampaign = (id) => softDeleteEntity('campaigns', id);

// -------- media / vendor records -------------------------------------------------
export const getMediaForCampaign = (campaignId) => dbGetByIndex('media', 'campaignId', campaignId);
export const getAllMedia = () => dbGetAll('media');
export const getMediaRecord = (id) => dbGet('media', id);
export const createMedia = (data) => createEntity('media', data);
export const updateMedia = (id, patch) => updateEntity('media', id, patch);
export const deleteMedia = (id) => softDeleteEntity('media', id);

// -------- vendors / media types / work types (typeable pick lists) -----------
export const getCustomVendors = () => dbGetAll('vendors');
export const getCustomMediaTypes = () => dbGetAll('mediaTypes');
export const getCustomWorkTypes = () => dbGetAll('workTypes');

// §birlesik-yazim: `defaults` verilirse (mediaTypes/workTypes için), yeni
// isim zaten sabit listedeki biriyle case/boşluk-duyarsız eşleşiyorsa hiç
// özel kayıt eklenmiyor — "Açık Hava" zaten sabitte varken kullanıcı "açık
// hava" yazıp kaydettiğinde ikinci bir kayıt olarak depoya yazılmasın diye.
async function addToPickList(store, name, defaults) {
  const trimmed = (name || '').trim();
  if (!trimmed) return;
  const key = normKey(trimmed);
  if (defaults && defaults.some((d) => normKey(d) === key)) return;
  const existing = await dbGetAll(store);
  if (existing.some((e) => normKey(e.name) === key)) return;
  await createEntity(store, { name: trimmed });
}
export const addVendorName = (name) => addToPickList('vendors', name);
export const addMediaTypeName = (name) => addToPickList('mediaTypes', name, DEFAULT_MEDIA_TYPES);
export const addWorkTypeName = (name) => addToPickList('workTypes', name, DEFAULT_WORK_TYPES);

// §birlesik-yazim: bir ham metni (mediaType/vendor/workType), `knownNames`
// listesinde case/boşluk-duyarsız eşleşen bir isim varsa O İSMİN KENDİ
// YAZIMINA indirger — "atv" / "ATV " / "Atv" yazıldığında hepsi kayıtlı olan
// tek "ATV" yazımına dönüşür. Hiçbir eşleşme yoksa (gerçekten yeni bir
// değer) trim edilmiş haliyle olduğu gibi döner. saveMedia/quickNewCampaign/
// saveVendorQuickAdd gibi KAYIT anında çağrılır — bundan sonra oluşan hiçbir
// kayıt yeni bir yazım varyantı yaratmaz, hep var olan çatının altına girer.
function toCanonical(raw, knownNames) {
  const trimmed = (raw || '').trim();
  if (!trimmed) return trimmed;
  const key = normKey(trimmed);
  const match = knownNames.find((k) => normKey(k) === key);
  return match || trimmed;
}
export async function canonicalMediaType(raw) { return toCanonical(raw, await getAllMediaTypeNames()); }
export async function canonicalWorkType(raw) { return toCanonical(raw, await getAllWorkTypeNames()); }
export async function canonicalVendorName(raw) { return toCanonical(raw, await getAllVendorNames()); }

// §kunye: mecra/yüklenici künye (şirket profili) alanları — Fatura Adresi,
// Adres, VKN, IBAN, Kaşe fotoğrafı — bu ismin `vendors` kaydına eklenir.
// `vendors` deposu zaten her mecra kaydında addVendorName ile otomatik
// dolduruluyordu (sadece {id,name,...} olarak); burada şema/migration
// gerekmeden aynı kayıt genişletiliyor.
export const getVendorProfile = (id) => dbGet('vendors', id);
export async function getVendorByName(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return null;
  const all = await getCustomVendors();
  return all.find((v) => v.name.trim().toLocaleLowerCase('tr-TR') === trimmed.toLocaleLowerCase('tr-TR')) || null;
}
export async function resolveVendorProfile(name) {
  const existing = await getVendorByName(name);
  if (existing) return existing;
  return createEntity('vendors', { name: (name || '').trim() });
}
export const updateVendorProfile = (id, patch) => updateEntity('vendors', id, patch);

// §birlesik-yazim: aşağıdaki üç fonksiyon (bu ve iki tür listesi) artık
// case/boşluk-duyarsız dedup yapıyor — "ATV" ve "Atv" ya da "Açık Hava" ve
// "açık hava" gibi geçmişte farklı yazılmış varyantlar TEK bir isim olarak
// dönüyor (ilk görülen/sabit listedeki yazım kazanır). Bu, hem seçmeli
// alanlardaki listeleri hem de bunlara bağlı her ekranı (Mecralar sayfası,
// Finans, vb.) otomatik olarak düzeltiyor — hiçbir eski kayıt değiştirilmeden.
export function dedupeNames(names) {
  const result = [];
  const seen = new Set();
  names.forEach((raw) => {
    const trimmed = (raw || '').trim();
    if (!trimmed) return;
    const key = normKey(trimmed);
    if (seen.has(key)) return;
    seen.add(key);
    result.push(trimmed);
  });
  return result;
}

export async function getAllVendorNames() {
  const [custom, media] = await Promise.all([getCustomVendors(), getAllMedia()]);
  const fromCustom = custom.map((v) => v.name);
  const fromMedia = media.map((m) => m.vendor).filter(Boolean);
  return dedupeNames([...fromCustom, ...fromMedia]).sort((a, b) => a.localeCompare(b, 'tr'));
}

// §yuklenici-secmeli: bir mecra türüne göre Yüklenici seçenekleri — TV/Radio
// için küratörlü kanal listesiyle birleşik, diğer türlerde SADECE o türde
// daha önce kullanıcının kendi elle girdiği yükleniciler (global "tüm
// yükleniciler" listesiyle karışmasın — Açık Hava seçiliyken TV kanalları
// çıkmasın diye). Mecra Türü karşılaştırması da normKey ile yapılıyor.
export async function getVendorNamesForType(mediaType) {
  const media = await getAllMedia();
  const typeKey = normKey(mediaType);
  const used = media.filter((m) => normKey(m.mediaType) === typeKey).map((m) => m.vendor).filter(Boolean);
  let curated = [];
  if (typeKey === normKey('TV')) curated = TV_CHANNELS;
  else if (typeKey === normKey('Radio')) curated = RADIO_CHANNELS;
  return dedupeNames([...curated, ...used]).sort((a, b) => a.localeCompare(b, 'tr'));
}

// §is-turu-secmeli: Yüklenici'nin aynısı — bir mecra türünde bugüne kadar
// gerçekten kullanılmış TÜM iş türlerini getirir (sabit DEFAULT_WORK_TYPES
// listesiyle sınırlı kalmadan — "3 taneyle sınırlı kalma" talebi budur),
// ARTIK bu türün WORK_TYPES_BY_MEDIA_TYPE'taki küratörlü (medya planlamada
// gerçekten var olan) iş türleriyle birleşik olarak — hiç geçmiş kaydı
// olmayan bir mecra türünde bile alan boş gelmesin diye. Elle yazma her
// zaman açık kalır, hiçbir veri kaybı olmaz.
export async function getWorkTypeNamesForType(mediaType) {
  const media = await getAllMedia();
  const typeKey = normKey(mediaType);
  const used = media.filter((m) => normKey(m.mediaType) === typeKey).map((m) => m.workType).filter(Boolean);
  const curated = curatedWorkTypesForType(mediaType);
  return dedupeNames([...curated, ...used]).sort((a, b) => a.localeCompare(b, 'tr'));
}

export async function getAllMediaTypeNames() {
  const custom = await getCustomMediaTypes();
  return dedupeNames([...DEFAULT_MEDIA_TYPES, ...custom.map((c) => c.name)]);
}

export async function getAllWorkTypeNames() {
  const custom = await getCustomWorkTypes();
  return dedupeNames([...DEFAULT_WORK_TYPES, ...custom.map((c) => c.name)]);
}

// -------- customer collections -------------------------------------------------
export const getCollectionsForCampaign = (campaignId) => dbGetByIndex('collections', 'campaignId', campaignId);
export const getCollectionsForClient = (clientId) => dbGetByIndex('collections', 'clientId', clientId);
export const getAllCollections = () => dbGetAll('collections');
export const getCollection = (id) => dbGet('collections', id);
export const createCollection = (data) => createEntity('collections', data);
export const updateCollection = (id, patch) => updateEntity('collections', id, patch);
export const deleteCollection = (id) => softDeleteEntity('collections', id);

// -------- vendor payments -------------------------------------------------------
export const getPaymentsForCampaign = (campaignId) => dbGetByIndex('payments', 'campaignId', campaignId);
export const getAllPayments = () => dbGetAll('payments');
// §birlesik-yazim: IndexedDB indeksi byte-birebir eşleştirir ("ATV" ≠ "Atv")
// — bu yüzden vendor'a göre ödeme ararken artık indeks yerine tüm ödemeler
// çekilip normKey ile filtreleniyor, "Fatura Ekle"deki "Hangi Ödeme İçin"
// listesinin farklı yazılmış bir yüklenici yüzünden boş gelmesini önlüyor.
export async function getPaymentsForVendor(vendor) {
  const all = await getAllPayments();
  const key = normKey(vendor);
  return all.filter((p) => normKey(p.vendor) === key);
}
export const getPayment = (id) => dbGet('payments', id);
export const createPayment = (data) => createEntity('payments', data);
export const updatePayment = (id, patch) => updateEntity('payments', id, patch);
export const deletePayment = (id) => softDeleteEntity('payments', id);

// -------- cheques -----------------------------------------------------------------
export const getAllCheques = () => dbGetAll('cheques');
export const getCheque = (id) => dbGet('cheques', id);
export const createCheque = (data) => createEntity('cheques', data);
export const updateCheque = (id, patch) => updateEntity('cheques', id, patch);
export const deleteCheque = (id) => softDeleteEntity('cheques', id);

// Cross-visibility (§73): a cheque tied to a client/campaign/vendor should be
// discoverable from all three of those detail pages, not just Finans→Çekler.
// Data volume is small for a single-user agency, so plain in-memory filters
// over getAllCheques() are simplest and correct (consistent with the rest of
// this file's approach to aggregation).
export async function getChequesForClient(clientId) {
  const all = await getAllCheques();
  return all.filter((c) => c.clientId === clientId);
}
export async function getChequesForCampaign(campaignId) {
  const all = await getAllCheques();
  return all.filter((c) => c.campaignId === campaignId);
}
export async function getChequesForVendor(vendor) {
  const all = await getAllCheques();
  const key = normKey(vendor);
  // §cheque-redesign v2: a cheque's whole custody trail is a `movements`
  // array (see chequeMovements.js) — it shows up on a vendor's page if it
  // was EVER ciro edilmiş to that vendor at any point in its history, not
  // just right now. §birlesik-yazim: normKey ile karşılaştırılıyor.
  return all.filter((c) => (c.movements || []).some((m) => m.toType === 'vendor' && normKey(m.toVendor) === key));
}

// A received cheque is always born from exactly one Tahsilat — find it so
// the cheque detail page can link back to (and edit) that origin record.
export async function getCollectionByChequeId(chequeId) {
  const all = await getAllCollections();
  return all.find((c) => c.chequeId === chequeId) || null;
}

// Cheques currently sitting unused ("Elde") — the pick-list a Payment's
// "Çek" type offers instead of entering a fresh cheque (§cheque-redesign:
// a "verilen çek" is always an existing received cheque being endorsed
// onward, never freshly self-issued).
export async function getHeldCheques() {
  const all = await getAllCheques();
  return all.filter((c) => !(c.movements && c.movements.length));
}

// -------- cheque movement history (§cheque-redesign v2) ----------------------
// A cheque's life isn't a single "current state" — it can be handed off,
// taken back, and handed off again any number of times (bank → müşteri →
// bank, ciro → geri al → başka yükleniciye, …). `cheque.movements` is a
// plain append-ordered array of every handoff so far; the LAST entry is
// always "where the cheque is right now". Only that last entry can be
// edited/undone (correcting deep history would make the trail nonsensical);
// anything older is a permanent, read-only record of what actually happened.
export async function appendChequeMovement(chequeId, movement) {
  const cheque = await getCheque(chequeId);
  if (!cheque) return null;
  const entry = { id: uid(), ...movement };
  const movements = [...(cheque.movements || []), entry];
  await updateCheque(chequeId, { movements });
  return entry;
}

export async function updateLastChequeMovement(chequeId, patch) {
  const cheque = await getCheque(chequeId);
  if (!cheque || !cheque.movements || !cheque.movements.length) return null;
  const movements = cheque.movements.slice();
  const last = { ...movements[movements.length - 1], ...patch };
  movements[movements.length - 1] = last;
  await updateCheque(chequeId, { movements });
  return last;
}

export async function removeLastChequeMovement(chequeId) {
  const cheque = await getCheque(chequeId);
  if (!cheque || !cheque.movements || !cheque.movements.length) return null;
  const movements = cheque.movements.slice(0, -1);
  await updateCheque(chequeId, { movements });
  return true;
}

// Precise by-id variants — used when a Payment record needs to update/remove
// the specific movement IT created, which may no longer be the last entry
// (the cheque could have moved on again since). Safer than "last" for that
// case: never touches the wrong entry.
export async function updateChequeMovementById(chequeId, movementId, patch) {
  const cheque = await getCheque(chequeId);
  if (!cheque) return null;
  const movements = (cheque.movements || []).map((m) => (m.id === movementId ? { ...m, ...patch } : m));
  await updateCheque(chequeId, { movements });
  return movements.find((m) => m.id === movementId) || null;
}

export async function removeChequeMovementById(chequeId, movementId) {
  const cheque = await getCheque(chequeId);
  if (!cheque) return null;
  const movements = (cheque.movements || []).filter((m) => m.id !== movementId);
  await updateCheque(chequeId, { movements });
  return true;
}

export function chequeCurrentMovement(cheque) {
  const movements = cheque && cheque.movements ? cheque.movements : [];
  return movements.length ? movements[movements.length - 1] : null;
}

// -------- TV annual ristorno -------------------------------------------------------
export const getAllTvRistorno = () => dbGetAll('tvRistorno');
export const getTvRistorno = (id) => dbGet('tvRistorno', id);
export const createTvRistorno = (data) => createEntity('tvRistorno', data);
export const updateTvRistorno = (id, patch) => updateEntity('tvRistorno', id, patch);
export const deleteTvRistorno = (id) => softDeleteEntity('tvRistorno', id);

// -------- cascading soft deletes --------------------------------------------
// Deleting a parent hides its children from the active UI too, but never
// touches financial history (collections/payments/cheques keep their
// snapshot names and stay fully visible in Finans).
export async function cascadeDeleteCampaign(campaignId) {
  const media = await getMediaForCampaign(campaignId);
  await Promise.all(media.map((m) => deleteMedia(m.id)));
  await deleteCampaign(campaignId);
}

export async function cascadeDeleteProduct(productId) {
  const campaigns = await getCampaignsForProduct(productId);
  await Promise.all(campaigns.map((c) => cascadeDeleteCampaign(c.id)));
  await deleteProduct(productId);
}

export async function cascadeDeleteClient(clientId) {
  const products = await getProductsForClient(clientId);
  await Promise.all(products.map((p) => cascadeDeleteProduct(p.id)));
  await deleteClient(clientId);
}

// -------- fatura / dekont (invoice attachments) -------------------------------
// Müşteri/Mecra Finans kartlarındaki basit fatura-dekont ekleme alanı — çek
// deseninin sadeleştirilmiş hâli (hareket geçmişi yok, sadece ekle/gör/sil).
// entityType 'client' | 'vendor'; entityId müşteri için clientId, mecra için
// yüklenici adı (çek/ödeme'deki vendor-adı-ile-eşleştirme deseniyle aynı).
export const getAllInvoices = () => dbGetAll('invoices');
export const getInvoice = (id) => dbGet('invoices', id);
export const createInvoiceRecord = (data) => createEntity('invoices', data);
export const updateInvoiceRecord = (id, patch) => updateEntity('invoices', id, patch);
export const deleteInvoiceRecord = (id) => softDeleteEntity('invoices', id);

export async function getInvoicesForClient(clientId) {
  const all = await getAllInvoices();
  return all.filter((i) => i.entityType === 'client' && i.entityId === clientId);
}
export async function getInvoicesForVendor(vendorName) {
  const all = await getAllInvoices();
  const key = normKey(vendorName);
  // §birlesik-yazim: entityId burada yüklenici ADI (id değil) olarak
  // tutuluyor — normKey ile karşılaştırılıyor ki farklı yazımla kaydedilmiş
  // faturalar da doğru yüklenicinin altında görünsün.
  return all.filter((i) => i.entityType === 'vendor' && normKey(i.entityId) === key);
}

// -------- randevu / toplantı ajandası ------------------------------------------
// Basit ajanda kaydı — kişi/kurum, konu, tarih+saat, katılımcılar, not, ve
// sonradan girilebilen sonuç notu. Geçmiş kayıtlar hiçbir zaman silinmez
// (soft delete dışında), Geçmiş Kampanyalar mantığıyla aynı: tarihe göre
// ileri/geri gezilebilir bir liste.
export const getAllAppointments = () => dbGetAll('appointments');
export const getAppointment = (id) => dbGet('appointments', id);
export const createAppointment = (data) => createEntity('appointments', data);
export const updateAppointment = (id, patch) => updateEntity('appointments', id, patch);
export const deleteAppointment = (id) => softDeleteEntity('appointments', id);
