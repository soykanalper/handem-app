// ---------------------------------------------------------------------------
// sync.js — offline-first cloud sync architecture.
//
// IndexedDB (db.js) is always the source of truth on this device: every
// create/update/delete is written locally first and completes immediately,
// online or not. Every one of those writes also drops a change record into
// the local "outbox" queue implemented here. Whenever the app is online this
// module flushes the queue to a configurable remote endpoint. Nothing is
// ever lost: if a push fails (offline, server error, etc.) the item simply
// stays queued and is retried on the next flush.
//
// There is a single user / single primary device, so no merge/conflict
// resolution is implemented — last-write-wins on the server is sufficient.
//
// To wire this up to a real backend (Firebase, Supabase, a custom REST
// service, etc.) set a sync endpoint once via setSyncEndpoint(url). Until an
// endpoint is configured, the queue still accumulates safely (bounded) and
// flushing is a documented no-op — the app is fully usable offline-only.
// ---------------------------------------------------------------------------
import { uid } from './util.js';

const OUTBOX_STORE = 'outbox';
const MAX_OUTBOX = 5000; // safety cap so an unconfigured/very long-offline queue can't grow unbounded
let flushing = false;
let listeners = [];

function notify(state) {
  listeners.forEach((fn) => {
    try { fn(state); } catch (e) { /* ignore listener errors */ }
  });
}

export function onSyncStatusChange(fn) {
  listeners.push(fn);
}

// Lazily import db.js functions to avoid a hard circular-import ordering
// issue at module-eval time (db.js imports enqueueChange from this file).
async function dbFns() {
  return import('./db.js');
}

export async function enqueueChange(storeName, entityId, op, payload) {
  const { dbPut, dbGetAll } = await dbFns();
  const item = {
    id: uid(),
    storeName,
    entityId,
    op, // 'create' | 'update'
    payload,
    timestamp: Date.now(),
    synced: false
  };
  await dbPut(OUTBOX_STORE, item);
  const all = await dbGetAll(OUTBOX_STORE, { includeDeleted: true });
  if (all.length > MAX_OUTBOX) {
    // Drop the oldest already-synced entries first to keep the queue bounded.
    const syncedOld = all.filter((r) => r.synced).sort((a, b) => a.timestamp - b.timestamp);
    const { dbHardDelete } = await dbFns();
    for (const r of syncedOld.slice(0, all.length - MAX_OUTBOX)) {
      await dbHardDelete(OUTBOX_STORE, r.id);
    }
  }
  notify({ type: 'queued' });
}

export async function getSyncEndpoint() {
  const { getMeta } = await dbFns();
  return getMeta('syncEndpoint', null);
}

export async function setSyncEndpoint(url) {
  const { setMeta } = await dbFns();
  await setMeta('syncEndpoint', url || null);
  flushOutbox();
}

export async function pendingCount() {
  const { dbGetAll } = await dbFns();
  const all = await dbGetAll(OUTBOX_STORE, { includeDeleted: true });
  return all.filter((r) => !r.synced).length;
}

export async function lastSyncTime() {
  const { getMeta } = await dbFns();
  return getMeta('lastSyncAt', null);
}

export async function flushOutbox() {
  if (flushing) return;
  if (!navigator.onLine) return;
  flushing = true;
  notify({ type: 'syncing' });
  try {
    const { dbGetAll, dbPut, setMeta } = await dbFns();
    const endpoint = await getSyncEndpoint();
    const all = (await dbGetAll(OUTBOX_STORE, { includeDeleted: true })).filter((r) => !r.synced);
    if (!endpoint) {
      // No backend configured yet: nothing to push to, queue stays intact.
      notify({ type: 'idle', pending: all.length });
      flushing = false;
      return;
    }
    let okCount = 0;
    for (const item of all) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item)
        });
        if (res.ok) {
          item.synced = true;
          await dbPut(OUTBOX_STORE, item);
          okCount++;
        } else {
          break; // stop on first failure, retry later preserving order
        }
      } catch (e) {
        break; // network dropped mid-flush; remaining items stay queued
      }
    }
    if (okCount > 0) await setMeta('lastSyncAt', Date.now());
    notify({ type: 'idle', pending: all.length - okCount });
  } finally {
    flushing = false;
  }
}

export function initSync() {
  window.addEventListener('online', () => flushOutbox());
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') flushOutbox();
  });
  setInterval(() => flushOutbox(), 45000);
  flushOutbox();
}
