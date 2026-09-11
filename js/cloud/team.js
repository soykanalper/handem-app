// ---------------------------------------------------------------------------
// cloud/team.js — lightweight role system on top of Firebase Auth. There is
// still no self-signup and no per-user Firestore rules (see firestore.rules
// — every signed-in user can technically read/write everything); "admin" vs
// "personel" here is a UI-only distinction; it hides the profit/cost figures
// from staff in the interface, but is not a hard security boundary against
// someone deliberately poking at the network tab. That trade-off was a
// deliberate choice (simplicity over a data-model split) — see the
// conversation that added this file if that ever needs revisiting.
//
// Model: a single doc at workspaces/{WORKSPACE_ID}/settings/team holding
// { admins: [email, ...] }. Anyone signed in whose email is NOT in that list
// is "personel". If the list is empty/missing (fresh install, nobody has
// configured it yet), EVERYONE is treated as admin — so the owner is never
// accidentally locked out of their own numbers before setting this up.
// Local/offline (non-cloud) mode has no multi-user concept at all, so it
// always reports admin — see the default value below and bootstrap.js,
// which never touches this module outside cloud mode.
// ---------------------------------------------------------------------------
import { WORKSPACE_ID } from '../firebase-config.js';
import { loadFirebase } from './firebase-sdk.js';
import { currentUser } from './auth.js';

async function ctx() {
  const { db, storeFns } = await loadFirebase();
  return { db, ...storeFns };
}

function teamDocRef(db, doc) {
  return doc(db, 'workspaces', WORKSPACE_ID, 'settings', 'team');
}

export async function getTeamAdmins() {
  const { db, doc, getDoc } = await ctx();
  const snap = await getDoc(teamDocRef(db, doc));
  return snap.exists() && Array.isArray(snap.data().admins) ? snap.data().admins : [];
}

export async function setTeamAdmins(admins) {
  const { db, doc, setDoc } = await ctx();
  await setDoc(teamDocRef(db, doc), { admins }, { merge: true });
}

// -------- sync cache used by every render function --------------------------
// Rendering (components.js, screens.js, screens-finance.js) builds HTML
// strings synchronously, so the admin/personel decision has to already be
// known by the time a screen renders — it's computed once at login (and
// again right after the settings screen changes the list) and cached here.
let _isAdmin = true;

export function isAdmin() {
  return _isAdmin;
}

// Local/offline mode: always admin, no fetch needed — call this instead of
// loadAdminStatus() from bootstrap.js when cloud mode is off.
export function setLocalModeAdmin() {
  _isAdmin = true;
}

export async function loadAdminStatus() {
  const user = currentUser();
  if (!user) { _isAdmin = false; return; }
  const admins = await getTeamAdmins();
  _isAdmin = admins.length === 0 || admins.includes((user.email || '').toLowerCase());
}
