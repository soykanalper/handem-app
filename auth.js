// ---------------------------------------------------------------------------
// cloud/auth.js — thin wrapper around Firebase Authentication. There is no
// public self-signup screen in this app: only accounts the workspace owner
// creates in Firebase Console → Authentication → Users can log in. That is
// the entire access-control model — see firestore.rules for why this is
// enough (every signed-in user is, by construction, someone the owner
// explicitly added).
// ---------------------------------------------------------------------------
import { loadFirebase } from './firebase-sdk.js';

let _auth = null;
let _authFns = null;

async function ensure() {
  if (!_auth) {
    const { auth, authFns } = await loadFirebase();
    _auth = auth;
    _authFns = authFns;
  }
  return { auth: _auth, authFns: _authFns };
}

// Calls `cb(user)` immediately with the current auth state and again on
// every change (login, logout, session restored on page load). Returns the
// unsubscribe function.
export async function watchAuthState(cb) {
  const { auth, authFns } = await ensure();
  return authFns.onAuthStateChanged(auth, cb);
}

export async function logIn(email, password) {
  const { auth, authFns } = await ensure();
  const cred = await authFns.signInWithEmailAndPassword(auth, email.trim(), password);
  return cred.user;
}

export async function logOut() {
  const { auth, authFns } = await ensure();
  await authFns.signOut(auth);
}

export function currentUser() {
  return _auth ? _auth.currentUser : null;
}

// Turns a Firebase Auth error code into a short Turkish message for the
// login form — Firebase's default English messages aren't shown to users.
export function authErrorMessage(err) {
  const code = err && err.code;
  const map = {
    'auth/invalid-email': 'Geçersiz e-posta adresi',
    'auth/user-disabled': 'Bu kullanıcı devre dışı bırakılmış',
    'auth/user-not-found': 'Böyle bir kullanıcı bulunamadı',
    'auth/wrong-password': 'Şifre hatalı',
    'auth/invalid-credential': 'E-posta veya şifre hatalı',
    'auth/too-many-requests': 'Çok fazla deneme yapıldı, biraz sonra tekrar dene',
    'auth/network-request-failed': 'İnternet bağlantısı yok'
  };
  return map[code] || 'Giriş yapılamadı: ' + (err && err.message ? err.message : 'bilinmeyen hata');
}
