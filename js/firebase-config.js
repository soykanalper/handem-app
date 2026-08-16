// ---------------------------------------------------------------------------
// firebase-config.js — paste your real Firebase project config below.
//
// Where to get this: Firebase Console → (gear icon) Project settings →
// scroll to "Your apps" → click the "</>" (Web) icon → register an app →
// Firebase shows you a `firebaseConfig = {...}` object. Copy every value
// from there into the object below (apiKey, authDomain, projectId, etc.).
//
// This config is NOT a secret — Firebase is designed so this object is safe
// to ship inside client-side code. Real access control happens in Firestore
// Security Rules (see firestore.rules) and in who you allow to sign in
// (Firebase Console → Authentication → Users — only accounts you create
// there can log in; there is no public self-signup in this app).
//
// Until you fill in real values here, the app runs exactly as before —
// fully local, single-device, IndexedDB-only. Nothing changes for existing
// users until this file has real values AND at least one login exists.
// ---------------------------------------------------------------------------

export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAelstW6Puy_mmDOuNnNz7XnGePvjLeyT0',
  authDomain: 'handem-50dab.firebaseapp.com',
  projectId: 'handem-50dab',
  storageBucket: 'handem-50dab.firebasestorage.app',
  messagingSenderId: '723179630099',
  appId: '1:723179630099:web:6411efb317cc7a642059e6'
};

// A single shared workspace document — every team member reads/writes the
// same data under this path. A personal/small-agency tool has exactly one
// "workspace", so this is a fixed constant rather than something users pick.
export const WORKSPACE_ID = 'main';

export function isCloudConfigured() {
  return !!(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId && FIREBASE_CONFIG.appId);
}
