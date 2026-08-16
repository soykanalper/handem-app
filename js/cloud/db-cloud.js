// ---------------------------------------------------------------------------
// cloud/db-cloud.js — Firestore-backed implementation of the exact same
// function surface as db.js (dbGetAll, dbGet, dbGetByIndex, createEntity,
// updateEntity, softDeleteEntity). db-router.js picks between this and
// db.js at runtime, so repo.js and everything built on it (every screen)
// needs zero changes to work against either backend.
//
// Every record lives under workspaces/{WORKSPACE_ID}/{storeName}/{id} — one
// shared workspace, one flat collection per entity type, mirroring the
// IndexedDB store names 1:1. IDs are generated client-side with the same
// uid() helper the local version uses, so records look identical either way
// and a one-time local→cloud import (see cloud/migrate.js) can copy them
// over verbatim, references (clientId, campaignId, chequeId, …) included.
// ---------------------------------------------------------------------------
import { uid } from '../util.js';
import { WORKSPACE_ID } from '../firebase-config.js';
import { loadFirebase } from './firebase-sdk.js';

async function ctx() {
  const { db, storeFns } = await loadFirebase();
  return { db, ...storeFns };
}

function storeRef(db, collection, storeName) {
  return collection(db, 'workspaces', WORKSPACE_ID, storeName);
}

function docRef(db, doc, storeName, id) {
  return doc(db, 'workspaces', WORKSPACE_ID, storeName, id);
}

// Firestore caps a single document at ~1 MiB. Photos are stored inline as
// base64 data URLs (same shape as the local IndexedDB version, which has no
// such limit), so a record carrying 2-3 full-size receipt photos can get
// close to that ceiling. Catch it here with a clear Turkish message instead
// of letting Firestore reject the write with an opaque error — every save
// path (collection/payment/cheque forms, cheque edit) already has a
// try/catch that toasts whatever message this throws.
const MAX_DOC_BYTES = 900_000;

function assertSizeOk(obj) {
  const bytes = new Blob([JSON.stringify(obj)]).size;
  if (bytes > MAX_DOC_BYTES) {
    throw new Error(`Bu kayıt çok büyük (${Math.round(bytes / 1024)} KB) — muhtemelen fotoğraflar. Daha az fotoğraf ekleyip tekrar dene.`);
  }
}

export async function dbGetAll(storeName, { includeDeleted = false } = {}) {
  const { db, collection, getDocs } = await ctx();
  const snap = await getDocs(storeRef(db, collection, storeName));
  const all = snap.docs.map((d) => d.data());
  if (includeDeleted) return all;
  return all.filter((r) => !r.deleted);
}

export async function dbGet(storeName, id) {
  if (!id) return undefined;
  const { db, doc, getDoc } = await ctx();
  const snap = await getDoc(docRef(db, doc, storeName, id));
  return snap.exists() ? snap.data() : undefined;
}

export async function dbGetByIndex(storeName, indexName, value, { includeDeleted = false } = {}) {
  const { db, collection, query, where, getDocs } = await ctx();
  const q = query(storeRef(db, collection, storeName), where(indexName, '==', value));
  const snap = await getDocs(q);
  const all = snap.docs.map((d) => d.data());
  if (includeDeleted) return all;
  return all.filter((r) => !r.deleted);
}

export async function createEntity(storeName, data) {
  const { db, doc, setDoc } = await ctx();
  const now = Date.now();
  const obj = { id: uid(), deleted: false, createdAt: now, updatedAt: now, ...data };
  assertSizeOk(obj);
  await setDoc(docRef(db, doc, storeName, obj.id), obj);
  return obj;
}

export async function updateEntity(storeName, id, patch) {
  const existing = await dbGet(storeName, id);
  if (!existing) throw new Error('Kayıt bulunamadı');
  const obj = { ...existing, ...patch, id, updatedAt: Date.now() };
  assertSizeOk(obj);
  const { db, doc, setDoc } = await ctx();
  await setDoc(docRef(db, doc, storeName, id), obj);
  return obj;
}

export async function softDeleteEntity(storeName, id) {
  return updateEntity(storeName, id, { deleted: true });
}

// Writes a record as-is (id/createdAt/updatedAt/deleted all preserved
// exactly) — used only by the one-time local→cloud migration, never by
// normal app code, so existing relational IDs stay intact across the move.
export async function putRaw(storeName, obj) {
  assertSizeOk(obj);
  const { db, doc, setDoc } = await ctx();
  await setDoc(docRef(db, doc, storeName, obj.id), obj);
  return obj;
}
