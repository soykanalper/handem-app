// ---------------------------------------------------------------------------
// cloud/firebase-sdk.js — loads the Firebase Web SDK (modular v10, via CDN
// ESM imports) and initializes app/auth/firestore. Every import here is
// dynamic (`await import(...)`) so nothing about Firebase ever touches the
// app's boot path unless cloud mode is actually configured — a user who
// never sets up Firebase never triggers a single network request to
// Google's servers, and the existing local-only IndexedDB app is completely
// unaffected.
// ---------------------------------------------------------------------------
import { FIREBASE_CONFIG } from '../firebase-config.js';

const SDK_VERSION = '10.12.2';
const BASE = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;

let cached = null;

// Loads (once) and returns { app, auth, db, authFns, storeFns }. authFns and
// storeFns re-export the specific Firebase functions the rest of cloud/*
// needs, so callers never have to reach for the CDN URLs themselves.
export async function loadFirebase() {
  if (cached) return cached;

  const [{ initializeApp }, authMod, storeMod] = await Promise.all([
    import(/* webpackIgnore: true */ `${BASE}/firebase-app.js`),
    import(/* webpackIgnore: true */ `${BASE}/firebase-auth.js`),
    import(/* webpackIgnore: true */ `${BASE}/firebase-firestore.js`)
  ]);

  const app = initializeApp(FIREBASE_CONFIG);
  const auth = authMod.getAuth(app);
  await authMod.setPersistence(auth, authMod.browserLocalPersistence);

  const db = storeMod.getFirestore(app);
  try {
    // Lets the app read/write while offline (queues writes, syncs when back
    // online) and keeps a local cache for instant reads. Fails silently if
    // another tab already holds the persistence lock or the browser doesn't
    // support it — the app still works, just without the offline cache.
    await storeMod.enableIndexedDbPersistence(db);
  } catch (e) {
    console.warn('Firestore offline persistence not enabled:', e && e.code);
  }

  cached = {
    app, auth, db,
    authFns: {
      onAuthStateChanged: authMod.onAuthStateChanged,
      signInWithEmailAndPassword: authMod.signInWithEmailAndPassword,
      signOut: authMod.signOut
    },
    storeFns: {
      collection: storeMod.collection,
      doc: storeMod.doc,
      getDoc: storeMod.getDoc,
      getDocs: storeMod.getDocs,
      query: storeMod.query,
      where: storeMod.where,
      setDoc: storeMod.setDoc,
      writeBatch: storeMod.writeBatch
    }
  };
  return cached;
}
