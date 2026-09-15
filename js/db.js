// ---------------------------------------------------------------------------
// db.js — IndexedDB persistence layer. This is the single local source of
// truth for the whole app (offline-first). Every entity supports soft
// delete: a `deleted` flag is set instead of physically removing the row so
// historical financial records (collections/payments/cheques) that
// reference a client/campaign/vendor by name keep working even after the
// parent record is "deleted" from the active UI.
// ---------------------------------------------------------------------------
import { uid } from './util.js';

const DB_NAME = 'handem-db';
// v2: added `appointments` (Randevu/Toplantı Ajandası) and `invoices`
// (Fatura/Dekont ekleri) — yeni store'lar mevcut şemayı bozmuyor, sadece
// onupgradeneeded tekrar çalışıp eksik store'ları ekliyor.
const DB_VERSION = 2;

const STORES = {
  clients: 'id',
  products: 'id',
  campaigns: 'id',
  media: 'id',
  vendors: 'id',
  mediaTypes: 'id',
  workTypes: 'id',
  collections: 'id',
  payments: 'id',
  cheques: 'id',
  tvRistorno: 'id',
  appointments: 'id',
  invoices: 'id',
  outbox: 'id',
  meta: 'key'
};

let dbPromise = null;

// §db-donma-fix: DB_VERSION her yükseltildiğinde (yeni bir store eklendiğinde,
// örn. v1→v2 randevu/fatura için), uygulama başka bir sekmede/pencerede zaten
// AÇIKKEN tarayıcı IndexedDB'yi eski bağlantı açık kaldığı sürece yükseltmeyi
// "blocked" durumunda sonsuza kadar bekletiyordu — kullanıcı için sessizce
// donmuş bir uygulama olarak görünüyordu, hiçbir hata/mesaj çıkmıyordu.
// İki parçalı kalıcı çözüm:
//  1) Başarılı HER bağlantıya onversionchange takılıyor — ileride bir sonraki
//     sürüm yükseltmesi geldiğinde bu sekme kendi bağlantısını GÖNÜLLÜ olarak
//     kapatıyor, böylece yeni sekme asla bloklanmıyor (bloklanmanın kökten
//     önlenmesi — bundan sonraki her güncelleme için).
//  2) Yine de eski (bu düzeltmeden önceki kod ile açılmış) bir sekme varsa ve
//     blok oluşursa, artık sessizce sonsuza kadar beklemek yerine kullanıcıya
//     açık, eyleme geçirilebilir bir mesaj gösteriliyor (index.html'in DOM'u
//     her zaman hazır olduğu için ui.js/app.js'e bağımlı değil).
function showDbBlockedNotice() {
  if (document.getElementById('dbBlockedNotice')) return;
  const el = document.createElement('div');
  el.id = 'dbBlockedNotice';
  el.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(15,17,21,.92);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:28px;font-family:system-ui,-apple-system,sans-serif;gap:14px;';
  el.innerHTML = `
    <div style="font-size:32px;">⏳</div>
    <div style="font-size:16px;font-weight:700;max-width:320px;">Uygulama başka bir sekmede/pencerede zaten açık</div>
    <div style="font-size:13.5px;opacity:.85;max-width:320px;line-height:1.5;">Devam edebilmek için uygulamanın açık olduğu diğer tüm sekmeleri/pencereleri (telefonda arka plandaki kopyalar dahil) kapatıp aşağıdaki düğmeye bas.</div>
    <button style="margin-top:4px;background:#fff;color:#111;border:none;border-radius:10px;padding:11px 20px;font-size:14px;font-weight:700;">Yeniden Dene</button>
  `;
  el.querySelector('button').onclick = () => location.reload();
  document.body.appendChild(el);
}

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      Object.entries(STORES).forEach(([name, keyPath]) => {
        if (!db.objectStoreNames.contains(name)) {
          const store = db.createObjectStore(name, { keyPath });
          if (name === 'products') store.createIndex('clientId', 'clientId');
          if (name === 'campaigns') { store.createIndex('productId', 'productId'); store.createIndex('clientId', 'clientId'); }
          if (name === 'media') store.createIndex('campaignId', 'campaignId');
          if (name === 'collections') { store.createIndex('campaignId', 'campaignId'); store.createIndex('clientId', 'clientId'); }
          if (name === 'payments') { store.createIndex('campaignId', 'campaignId'); store.createIndex('vendor', 'vendor'); }
          if (name === 'cheques') { store.createIndex('direction', 'direction'); store.createIndex('status', 'status'); }
          if (name === 'tvRistorno') { store.createIndex('vendor', 'vendor'); store.createIndex('year', 'year'); }
        }
      });
    };
    req.onsuccess = (e) => {
      const db = e.target.result;
      // Bu bağlantı ileride başka bir sekmede daha yeni bir sürüm açılmak
      // istendiğinde kendini kapatsın — bir sonraki güncellemede blok
      // oluşmasın diye (§db-donma-fix, madde 1).
      db.onversionchange = () => { db.close(); };
      resolve(db);
    };
    req.onerror = (e) => reject(e.target.error);
    req.onblocked = () => { showDbBlockedNotice(); };
  });
  return dbPromise;
}

function tx(storeName, mode = 'readonly') {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// -------- generic CRUD -----------------------------------------------------
export async function dbPut(storeName, obj) {
  const store = await tx(storeName, 'readwrite');
  await reqToPromise(store.put(obj));
  return obj;
}

export async function dbGet(storeName, id) {
  const store = await tx(storeName, 'readonly');
  return reqToPromise(store.get(id));
}

export async function dbGetAll(storeName, { includeDeleted = false } = {}) {
  const store = await tx(storeName, 'readonly');
  const all = await reqToPromise(store.getAll());
  if (includeDeleted) return all;
  return all.filter((r) => !r.deleted);
}

export async function dbGetByIndex(storeName, indexName, value, { includeDeleted = false } = {}) {
  const store = await tx(storeName, 'readonly');
  const idx = store.index(indexName);
  const all = await reqToPromise(idx.getAll(value));
  if (includeDeleted) return all;
  return all.filter((r) => !r.deleted);
}

export async function dbHardDelete(storeName, id) {
  const store = await tx(storeName, 'readwrite');
  await reqToPromise(store.delete(id));
}

// -------- entity helpers ----------------------------------------------------
// Every "create" stamps createdAt/updatedAt/deleted=false and an id if missing.
// Every "update" merges patch + bumps updatedAt. Every "softDelete" flips deleted=true.
// All three also push a change into the outbox sync queue (see sync.js).

import { enqueueChange } from './sync.js';

export async function createEntity(storeName, data) {
  const now = Date.now();
  const obj = { id: uid(), deleted: false, createdAt: now, updatedAt: now, ...data };
  await dbPut(storeName, obj);
  enqueueChange(storeName, obj.id, 'create', obj);
  return obj;
}

export async function updateEntity(storeName, id, patch) {
  const existing = await dbGet(storeName, id);
  if (!existing) throw new Error('Kayıt bulunamadı');
  const obj = { ...existing, ...patch, id, updatedAt: Date.now() };
  await dbPut(storeName, obj);
  enqueueChange(storeName, id, 'update', obj);
  return obj;
}

export async function softDeleteEntity(storeName, id) {
  return updateEntity(storeName, id, { deleted: true });
}

export async function getMeta(key, fallback = null) {
  const row = await dbGet('meta', key);
  return row ? row.value : fallback;
}

export async function setMeta(key, value) {
  return dbPut('meta', { key, value });
}
