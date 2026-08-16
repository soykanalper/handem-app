// ---------------------------------------------------------------------------
// app.js — entry point: router, global window.H action registry, bottom nav
// / FAB wiring, cheque due-date alert checks, service worker + sync bootstrap.
// ---------------------------------------------------------------------------
import * as ui from './ui.js';
import * as repo from './repo.js';
import * as calc from './calc.js';
import * as util from './util.js';
import * as screens from './screens.js';
import * as finance from './screens-finance.js';
import * as forms from './screens-forms.js';
import * as mutabakat from './mutabakat.js';
import * as cloudBootstrap from './cloud/bootstrap.js';
import { initSync } from './sync.js';
import { openDB } from './db.js';

// -------- build the global action registry used by generated HTML ----------
window.H = Object.assign(
  {},
  ui,
  screens,
  finance,
  forms,
  mutabakat,
  {
    goto: (hash) => ui.navigate(hash),
    goBack1: (fallback) => ui.goBack(fallback),
    setProductFilter: screens.setProductFilter,
    viewPhoto: ui.openLightbox,
    openAccountMenu: cloudBootstrap.openAccountMenu,
    cloudLogOut: cloudBootstrap.cloudLogOut
  }
);

// -------- router --------------------------------------------------------------
function compileRoute(pattern) {
  const paramNames = [];
  const regexStr = '^' + pattern.replace(/:[^/]+/g, (m) => {
    paramNames.push(m.slice(1));
    return '([^/]+)';
  }) + '$';
  return { regex: new RegExp(regexStr), paramNames };
}

const ROUTES = [
  ['/', screens.renderHome],
  ['/customers', screens.renderCustomers],
  ['/customers/:clientId', screens.renderClientDetail],
  ['/customers/:clientId/products/:productId', screens.renderProductDetail],
  ['/campaigns/:campaignId', screens.renderCampaignDetail],
  ['/media/:mediaId', screens.renderMediaDetail],
  ['/mecra', finance.renderMecraHome],
  ['/mecra/tv', finance.renderTvVendorList],
  ['/mecra/tv/:vendor', finance.renderTvVendorYears],
  ['/finance', finance.renderFinanceHome],
  ['/finance/customer', finance.renderFinanceCustomerList],
  ['/finance/customer/:clientId', finance.renderFinanceCustomerDetail],
  ['/finance/vendor', finance.renderFinanceVendorList],
  ['/finance/vendor/t/:mediaType', finance.renderMediaTypeDetail],
  ['/finance/vendor/:vendor', finance.renderFinanceVendorDetail],
  ['/finance/cheques', finance.renderCheques],
  ['/finance/cheques/:chequeId', finance.renderChequeDetail]
].map(([pattern, handler]) => ({ ...compileRoute(pattern), handler, pattern }));

window.__handemNavStack = [];

async function runRoute() {
  const hash = location.hash.replace(/^#/, '') || '/';
  for (const route of ROUTES) {
    const m = hash.match(route.regex);
    if (m) {
      const params = {};
      route.paramNames.forEach((name, i) => { params[name] = decodeURIComponent(m[i + 1]); });
      try {
        await route.handler(params);
      } catch (e) {
        console.error('Route error', e);
        util.toast('Bir şeyler ters gitti: ' + e.message, 'error');
      }
      if (window.__handemSkipPush) {
        window.__handemSkipPush = false;
      } else {
        const stack = window.__handemNavStack;
        if (stack[stack.length - 1] !== hash) stack.push(hash);
      }
      return;
    }
  }
  ui.navigate('/');
}

ui.setRouteRunner(runRoute);
window.addEventListener('hashchange', runRoute);

// -------- bottom nav ------------------------------------------------------------
document.getElementById('bottomNav').addEventListener('click', (e) => {
  const btn = e.target.closest('.nav-btn');
  if (!btn) return;
  const key = btn.dataset.nav;
  if (key === 'home') ui.navigate('/');
  if (key === 'customers') ui.navigate('/customers');
  if (key === 'mecra') ui.navigate('/mecra');
  if (key === 'finance') ui.navigate('/finance/customer');
});

// -------- FAB / quick add --------------------------------------------------------
document.getElementById('fabBtn').addEventListener('click', () => forms.openQuickAddMenu());

document.getElementById('lightboxClose').addEventListener('click', () => ui.closeLightbox());

// -------- cheque due-date alerts -------------------------------------------------
let dismissedAlertsToday = new Set();

async function checkDueCheques() {
  const today = util.todayISO();
  const { getMeta, setMeta } = await import('./db.js');
  const all = await repo.getAllCheques();
  const dueToday = all.filter((c) => c.dueDate === today && !calc.CHEQUE_MANUAL_STATUSES.includes(c.status));
  if (dueToday.length === 0) return;

  const key = 'due:' + today;
  const alreadyShown = await getMeta(key, false);
  if (alreadyShown) return;

  showAlertBanner(dueToday);

  if ('Notification' in window) {
    if (Notification.permission === 'default') {
      try { await Notification.requestPermission(); } catch (e) { /* ignore */ }
    }
    if (Notification.permission === 'granted') {
      dueToday.forEach((c) => {
        try {
          new Notification('Vadesi Gelen Çek', {
            body: `${c.counterpartyName || ''} — ${util.fmt(c.amount)} (${c.direction === 'received' ? 'Alınan' : 'Verilen'})`,
            tag: 'handem-cheque-' + c.id
          });
        } catch (e) { /* Notification constructor unsupported in this context (e.g. some mobile browsers) */ }
      });
    }
  }

  await setMeta(key, true);
}

function showAlertBanner(cheques) {
  const banner = document.getElementById('alertBanner');
  const total = cheques.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  banner.innerHTML = `
    <div class="box">
      <div class="tx"><b>Bugün vadesi gelen ${cheques.length} çek</b>Toplam ${util.fmt(total)} — Finans → Çekler bölümünden kontrol et.</div>
      <button id="alertBannerClose">✕</button>
    </div>
  `;
  banner.classList.add('show');
  document.getElementById('alertBannerClose').addEventListener('click', () => banner.classList.remove('show'));
  setTimeout(() => banner.classList.remove('show'), 8000);
}

// -------- service worker + periodic checks -------------------------------------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* offline-first still works without SW */ });
  });
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'CHECK_DUE_CHEQUES') checkDueCheques();
  });
}

// -------- splash screen (§74-76) ------------------------------------------------
function hideSplash() {
  const splash = document.getElementById('splash');
  if (!splash) return;
  setTimeout(() => {
    splash.classList.add('hide');
    setTimeout(() => splash.remove(), 500);
  }, 450);
}

// -------- boot -----------------------------------------------------------------
(async function boot() {
  await openDB();
  // No-op + resolves instantly if Firebase isn't configured (js/firebase-config.js
  // still has placeholder values) — the app boots exactly as it always has,
  // fully local. Only shows the login screen and waits when cloud mode is set up.
  await cloudBootstrap.initCloudAndAuth();
  if (!cloudBootstrap.isCloudActive()) initSync(); // legacy local outbox stub, harmless without an endpoint
  await runRoute();
  checkDueCheques();
  setInterval(checkDueCheques, 60 * 60 * 1000); // re-check hourly in case app stays open past midnight
  hideSplash();
})();
