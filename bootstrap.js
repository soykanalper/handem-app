// ---------------------------------------------------------------------------
// cloud/bootstrap.js — the single integration point between app.js's boot
// sequence and everything under cloud/*. Call `initCloudAndAuth()` once,
// right after openDB() and before the first runRoute():
//
//   await openDB();
//   await initCloudAndAuth();   // no-op + instant resolve if Firebase isn't
//                                // configured; otherwise shows the login
//                                // screen and waits until someone is signed
//                                // in before resolving
//   await runRoute();
//
// Everything else (rendering the login form, wiring the account/logout
// sheet, offering the one-time local→cloud migration) lives in here so
// app.js stays a thin orchestrator.
// ---------------------------------------------------------------------------
import { isCloudConfigured } from '../firebase-config.js';
import { setDbMode, getDbMode } from './db-router.js';
import { watchAuthState, logIn, logOut, authErrorMessage } from './auth.js';
import { countLocalRecords, cloudWorkspaceIsEmpty, migrateLocalToCloud } from './migrate.js';
import { openSheet, closeSheet } from '../ui.js';
import { toast, confirmAction, escapeHtml } from '../util.js';
import { icon } from '../icons.js';

export function isCloudActive() {
  return getDbMode() === 'cloud';
}

function authScreenEl() {
  return document.getElementById('authScreen');
}

function renderLoginForm(prefillError) {
  const el = authScreenEl();
  if (!el) return;
  el.innerHTML = `
    <div class="auth-card">
      <img src="icons/logo.png" alt="Hande'M" class="auth-logo">
      <h2>Giriş Yap</h2>
      <div class="sub">Ekibin için oluşturulan e-posta ve şifreyle gir</div>
      <div class="auth-error${prefillError ? ' show' : ''}" id="authError">${prefillError ? escapeHtml(prefillError) : ''}</div>
      <div class="field"><label>E-posta</label><input id="authEmail" type="email" autocomplete="username" placeholder="ornek@ajans.com"></div>
      <div class="field"><label>Şifre</label><input id="authPassword" type="password" autocomplete="current-password" placeholder="••••••"></div>
      <button class="btn primary" id="authSubmitBtn">Giriş Yap</button>
    </div>
  `;
  el.style.display = 'flex';

  const emailInput = document.getElementById('authEmail');
  const passInput = document.getElementById('authPassword');
  const submitBtn = document.getElementById('authSubmitBtn');
  const errorBox = document.getElementById('authError');

  async function submit() {
    const email = emailInput.value.trim();
    const password = passInput.value;
    if (!email || !password) {
      errorBox.textContent = 'E-posta ve şifre gerekli';
      errorBox.classList.add('show');
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = 'Giriş yapılıyor…';
    errorBox.classList.remove('show');
    try {
      await logIn(email, password);
      // onAuthStateChanged (wired in initCloudAndAuth) takes over from here.
    } catch (e) {
      errorBox.textContent = authErrorMessage(e);
      errorBox.classList.add('show');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Giriş Yap';
    }
  }

  submitBtn.addEventListener('click', submit);
  passInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  emailInput.focus();
}

function hideLoginForm() {
  const el = authScreenEl();
  if (el) { el.style.display = 'none'; el.innerHTML = ''; }
}

async function offerMigrationIfNeeded() {
  try {
    const [localCount, cloudEmpty] = await Promise.all([countLocalRecords(), cloudWorkspaceIsEmpty()]);
    if (localCount === 0 || !cloudEmpty) return;
    const ok = confirmAction(
      `Bu cihazda ${localCount} kayıt (müşteri, kampanya, tahsilat, ödeme, çek vb.) var ve ortak buluta henüz hiçbir şey girilmemiş. ` +
      `Bu cihazdaki verileri ortak alana aktarayım mı? (Bu, sadece bir kez ve tek yönlü yapılır — buluta kopyalanır, cihazdan silinmez.)`
    );
    if (!ok) return;
    toast('Veriler buluta aktarılıyor…', 'success');
    const result = await migrateLocalToCloud();
    if (result.failed.length > 0) {
      toast(`Aktarım tamamlandı, ama ${result.failed.length} kayıt (muhtemelen çok büyük fotoğraflı) aktarılamadı — bunları elle tekrar girmen gerekebilir.`, 'error');
      console.warn('Migration failures:', result.failed);
    } else {
      toast('Aktarım tamamlandı — herkes artık aynı veriyi görecek', 'success');
    }
  } catch (e) {
    toast('Veri aktarımı sırasında hata: ' + e.message, 'error');
  }
}

function renderConnectionError(err) {
  console.error('Cloud connection error detail:', err);
  const el = authScreenEl();
  if (!el) return;
  el.innerHTML = `
    <div class="auth-card">
      <img src="icons/logo.png" alt="Hande'M" class="auth-logo">
      <h2>Bulut bağlantısı kurulamadı</h2>
      <div class="sub">İnternet bağlantını kontrol edip tekrar dene. Sorun devam ederse ekran görüntüsü gönder.</div>
      <button class="btn primary" id="authRetryBtn">Tekrar Dene</button>
    </div>
  `;
  el.style.display = 'flex';
  document.getElementById('authRetryBtn').addEventListener('click', () => location.reload());
}

let readyResolve = null;
const readyPromise = new Promise((resolve) => { readyResolve = resolve; });

export async function initCloudAndAuth() {
  if (!isCloudConfigured()) {
    return; // stays in local-only IndexedDB mode, exactly as before
  }
  let first = true;
  try {
    await watchAuthState(async (user) => {
      if (user) {
        setDbMode('cloud');
        hideLoginForm();
        if (first) await offerMigrationIfNeeded();
        if (first) { first = false; readyResolve(); }
      } else {
        setDbMode('local');
        renderLoginForm();
        // boot() keeps waiting on readyPromise until a successful login fires
        // this callback again with a real user.
      }
    });
  } catch (e) {
    // SDK failed to load / initialize (offline, blocked network, bad config,
    // …) — show a clear retry screen instead of leaving boot() hanging on a
    // promise that will now never resolve, or letting the error propagate
    // as an unhandled rejection with a blank white screen.
    renderConnectionError(e);
    return; // never resolves readyPromise — boot() intentionally stays paused
            // here until the user reloads and either the connection recovers
            // or they fix the config; there is no safe silent local fallback
            // once cloud mode is configured (see file header note).
  }
  await readyPromise;
}

// ---- account sheet (logged-in users only, see screens.js account button) --
export async function openAccountMenu() {
  const { currentUser } = await import('./auth.js');
  const user = currentUser();
  const html = `
    <button class="close-x" onclick="H.closeSheet()">✕</button>
    <h2>Hesap</h2>
    <div class="detail-row"><span class="k">${icon('users', { size: 14, className: 'icon-inline' })} Giriş yapan</span><span class="v">${escapeHtml(user ? user.email : '—')}</span></div>
    <button class="btn danger" onclick="H.cloudLogOut()">Çıkış Yap</button>
  `;
  openSheet(html);
}

export async function cloudLogOut() {
  closeSheet();
  await logOut();
  location.reload();
}
