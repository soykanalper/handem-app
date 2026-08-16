// ---------------------------------------------------------------------------
// cloud/migrate.js — one-time copy of this device's local IndexedDB data
// into the shared Firestore workspace, the first time someone logs into
// cloud mode. Only offered when the cloud workspace is still empty (so it
// never silently overwrites data a teammate already started entering
// online) and only ever copies local → cloud, never the other direction.
// ---------------------------------------------------------------------------
import * as local from '../db.js';
import * as cloud from './db-cloud.js';

// Business data only — outbox/meta are per-device bookkeeping, not
// something that makes sense to share across a team.
const STORES_TO_MIGRATE = [
  'clients', 'products', 'campaigns', 'media', 'vendors', 'mediaTypes',
  'workTypes', 'collections', 'payments', 'cheques', 'tvRistorno'
];

export async function countLocalRecords() {
  let total = 0;
  for (const store of STORES_TO_MIGRATE) {
    const rows = await local.dbGetAll(store, { includeDeleted: true });
    total += rows.length;
  }
  return total;
}

export async function cloudWorkspaceIsEmpty() {
  // A handful of stores is enough to decide — if any of the "always present
  // early" stores already has data, treat the workspace as non-empty.
  for (const store of ['clients', 'campaigns', 'collections', 'payments']) {
    const rows = await cloud.dbGetAll(store, { includeDeleted: true });
    if (rows.length > 0) return false;
  }
  return true;
}

// Copies every local record into Firestore as-is (same id/timestamps/
// deleted flag), so every relational reference (clientId, campaignId,
// chequeId, vendor name, …) keeps pointing at the right record.
//
// One bad record (e.g. a cheque/collection carrying photos big enough to
// trip Firestore's ~1MB document limit — see db-cloud.js's assertSizeOk)
// must not abort the whole migration: everything else should still go
// through, and the caller finds out exactly which records need attention.
export async function migrateLocalToCloud(onProgress) {
  let done = 0;
  let total = 0;
  const byStore = {};
  for (const store of STORES_TO_MIGRATE) {
    byStore[store] = await local.dbGetAll(store, { includeDeleted: true });
    total += byStore[store].length;
  }
  const failed = [];
  for (const store of STORES_TO_MIGRATE) {
    for (const row of byStore[store]) {
      try {
        await cloud.putRaw(store, row);
      } catch (e) {
        failed.push({ store, id: row.id, error: e.message });
      }
      done++;
      if (onProgress) onProgress(done, total);
    }
  }
  return { migrated: done - failed.length, failed };
}
