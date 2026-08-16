// ---------------------------------------------------------------------------
// repo.js — higher-level data-access helpers built on top of db.js. Screens
// call these instead of talking to IndexedDB directly.
// ---------------------------------------------------------------------------
import { dbGetAll, dbGet, dbGetByIndex, createEntity, updateEntity, softDeleteEntity } from './cloud/db-router.js';

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
  return all.filter((c) => c.vendor === vendor);
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
