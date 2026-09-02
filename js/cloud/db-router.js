// ---------------------------------------------------------------------------
// cloud/db-router.js — the ONLY thing repo.js imports its storage primitives
// from. Picks between the local IndexedDB implementation (db.js) and the
// Firestore implementation (cloud/db-cloud.js) at *call time*, based on a
// mode flag set once at boot (app.js) after login succeeds. Nothing else in
// the app needs to know which backend is active — repo.js, and every screen
// built on repo.js, is 100% unchanged either way.
//
// getMeta/setMeta always stay local: they hold per-device UI state (which
// due-cheque alert was already shown today, etc.), not shared business
// data, so there's no reason to round-trip them through Firestore.
// ---------------------------------------------------------------------------
import * as local from '../db.js';
import * as cloud from './db-cloud.js';

let mode = 'local'; // 'local' | 'cloud'

// §perf: a screen switch used to mean every repo.* read starting completely
// from scratch — in cloud (Firestore) mode that's a fresh network round
// trip every time, and a single screen can chain dozens of them (see
// aggregate.js). Bouncing between tabs within CACHE_TTL_MS now reuses the
// same in-flight/resolved result instead of re-fetching. Any local write
// invalidates its store's cached entries immediately, so your own changes
// always show right away on this device — only a change made on ANOTHER
// device can lag behind by up to the TTL.
const CACHE_TTL_MS = 15000;
const cache = new Map(); // key -> { value: Promise<result>, at: timestamp }
const SEP = '';

function cached(key, fn) {
  const hit = cache.get(key);
  if (hit && (Date.now() - hit.at) < CACHE_TTL_MS) return hit.value;
  const value = fn().catch((e) => { cache.delete(key); throw e; });
  cache.set(key, { value, at: Date.now() });
  return value;
}

function invalidateStore(storeName) {
  const prefix = storeName + SEP;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

export function setDbMode(m) {
  mode = m === 'cloud' ? 'cloud' : 'local';
  cache.clear(); // a mode switch (e.g. logging in) must never serve cached
                  // results computed against the other backend.
}

export function getDbMode() {
  return mode;
}

function pick(name) {
  return (...args) => (mode === 'cloud' ? cloud[name] : local[name])(...args);
}

const rawDbGetAll = pick('dbGetAll');
const rawDbGet = pick('dbGet');
const rawDbGetByIndex = pick('dbGetByIndex');
const rawCreateEntity = pick('createEntity');
const rawUpdateEntity = pick('updateEntity');
const rawSoftDeleteEntity = pick('softDeleteEntity');

export function dbGetAll(storeName, opts = {}) {
  const key = [storeName, 'all', opts.includeDeleted ? '1' : '0'].join(SEP);
  return cached(key, () => rawDbGetAll(storeName, opts));
}

export function dbGet(storeName, id) {
  const key = [storeName, 'one', id].join(SEP);
  return cached(key, () => rawDbGet(storeName, id));
}

export function dbGetByIndex(storeName, indexName, value, opts = {}) {
  const key = [storeName, 'idx', indexName, value, opts.includeDeleted ? '1' : '0'].join(SEP);
  return cached(key, () => rawDbGetByIndex(storeName, indexName, value, opts));
}

export async function createEntity(storeName, data) {
  const result = await rawCreateEntity(storeName, data);
  invalidateStore(storeName);
  return result;
}

export async function updateEntity(storeName, id, patch) {
  const result = await rawUpdateEntity(storeName, id, patch);
  invalidateStore(storeName);
  return result;
}

export async function softDeleteEntity(storeName, id) {
  const result = await rawSoftDeleteEntity(storeName, id);
  invalidateStore(storeName);
  return result;
}

// Always local — see note above.
export const getMeta = local.getMeta;
export const setMeta = local.setMeta;
