// ---------------------------------------------------------------------------
// repo.js — higher-level data-access helpers built on top of db.js. Screens
// call these instead of talking to IndexedDB directly.
// ---------------------------------------------------------------------------
import { dbGetAll, dbGet, dbGetByIndex, createEntity, updateEntity, softDeleteEntity } from './cloud/db-router.js';
import { uid } from './util.js';

export const PAYMENT_TYPES = ['Nakit', 'Havale / EFT', 'Çek', 'Vadeli', 'Diğer'];

export const DEFAULT_MEDIA_TYPES = ['TV', 'Radio', 'Gazete', 'Açık Hava', 'Dijital', 'Sosyal Medya', 'YouTube', 'Instagram', 'Influencer', 'Sinema', 'Diğer'];
export const DEFAULT_WORK_TYPES = ['Reklam', 'Program Sponsorluk', 'Spot', 'Banner', 'Sosyal Medya', 'İçerik', 'Giydirme', 'Billboard', 'Diğer'];

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

async function addToPickList(store, name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return;
  const existing = await dbGetAll(store);
  if (existing.some((e) => e.name.toLowerCase() === trimmed.toLowerCase())) return;
  await createEntity(store, { name: trimmed });
}
export const addVendorName = (name) => addToPickList('vendors', name);
export const addMediaTypeName = (name) => addToPickList('mediaTypes', name);
export const addWorkTypeName = (name) => addToPickList('workTypes', name);

export async function getAllVendorNames() {
  const [custom, media] = await Promise.all([getCustomVendors(), getAllMedia()]);
  const fromMedia = media.map((m) => m.vendor).filter(Boolean);
  const fromCustom = custom.map((v) => v.name);
  return [...new Set([...fromCustom, ...fromMedia])].sort((a, b) => a.localeCompare(b, 'tr'));
}

export async function getAllMediaTypeNames() {
  const custom = await getCustomMediaTypes();
  const set = new Set(DEFAULT_MEDIA_TYPES);
  custom.forEach((c) => set.add(c.name));
  return [...set];
}

export async function getAllWorkTypeNames() {
  const custom = await getCustomWorkTypes();
  const set = new Set(DEFAULT_WORK_TYPES);
  custom.forEach((c) => set.add(c.name));
  return [...set];
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
export const getPaymentsForVendor = (vendor) => dbGetByIndex('payments', 'vendor', vendor);
export const getAllPayments = () => dbGetAll('payments');
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
  // §cheque-redesign v2: a cheque's whole custody trail is a `movements`
  // array (see chequeMovements.js) — it shows up on a vendor's page if it
  // was EVER ciro edilmiş to that vendor at any point in its history, not
  // just right now.
  return all.filter((c) => (c.movements || []).some((m) => m.toType === 'vendor' && m.toVendor === vendor));
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
