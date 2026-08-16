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

export function setDbMode(m) {
  mode = m === 'cloud' ? 'cloud' : 'local';
}

export function getDbMode() {
  return mode;
}

function pick(name) {
  return (...args) => (mode === 'cloud' ? cloud[name] : local[name])(...args);
}

export const dbGetAll = pick('dbGetAll');
export const dbGet = pick('dbGet');
export const dbGetByIndex = pick('dbGetByIndex');
export const createEntity = pick('createEntity');
export const updateEntity = pick('updateEntity');
export const softDeleteEntity = pick('softDeleteEntity');

// Always local — see note above.
export const getMeta = local.getMeta;
export const setMeta = local.setMeta;
