// ---------------------------------------------------------------------------
// ui.js — generic UI primitives shared by every screen: routing, bottom
// sheets, lightbox, topbar helpers. No screen-specific logic lives here so
// screens.js / screens-finance.js / screens-forms.js can all import it
// without circular-dependency problems.
// ---------------------------------------------------------------------------
import { icon } from './icons.js';
import { escapeHtml } from './util.js';

// -------- route refresh (set once by app.js's router, called by forms) -------
let _routeRunner = null;
export function setRouteRunner(fn) { _routeRunner = fn; }
export function refresh() { if (_routeRunner) _routeRunner(); }

export function navigate(hash) {
  if (location.hash === '#' + hash) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.hash = hash;
  }
}

export function goBack(fallback) {
  if (window.__handemNavStack && window.__handemNavStack.length > 1) {
    window.__handemNavStack.pop();
    const prev = window.__handemNavStack[window.__handemNavStack.length - 1];
    window.__handemSkipPush = true;
    navigate(prev);
  } else {
    navigate(fallback || '/customers');
  }
}

// extraClass resets the topbar's class list every call (not just appends) so
// a modifier like "brand-centered" (Ana Sayfa / Müşteriler's logo-only
// header) never leaks onto the next screen that navigates in.
export function setTopbar(html, extraClass) {
  const el = document.getElementById('topbar');
  if (!el) return;
  el.innerHTML = html;
  el.className = 'topbar' + (extraClass ? ' ' + extraClass : '');
}

export function setContent(html) {
  const el = document.getElementById('content');
  if (el) { el.innerHTML = html; el.scrollTop = 0; }
}

export function setActiveNav(key) {
  document.querySelectorAll('.nav-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.nav === key);
  });
}

export function setFabVisible(visible) {
  const fab = document.getElementById('fabBtn');
  if (fab) fab.classList.toggle('hide', !visible);
}

// -------- bottom sheet -------------------------------------------------------
let sheetStack = [];

export function openSheet(html, onMount) {
  const overlay = document.getElementById('overlay');
  const sheet = document.getElementById('sheet');
  sheet.innerHTML = html;
  overlay.classList.add('open');
  sheetStack.push({ html, onMount });
  if (typeof onMount === 'function') onMount(sheet);
  document.body.style.overflow = 'hidden';
}

export function closeSheet() {
  const overlay = document.getElementById('overlay');
  const sheet = document.getElementById('sheet');
  overlay.classList.remove('open');
  sheet.innerHTML = '';
  sheetStack = [];
  document.body.style.overflow = '';
}

// close sheet on backdrop click
document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('overlay');
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeSheet();
    });
  }
  const lightbox = document.getElementById('lightbox');
  if (lightbox) {
    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox) closeLightbox();
    });
  }
});

// -------- lightbox -----------------------------------------------------------
export function openLightbox(src) {
  const lb = document.getElementById('lightbox');
  const img = document.getElementById('lightboxImg');
  if (!src) return;
  img.src = src;
  lb.classList.add('open');
}

export function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
}

// -------- small reusable renderers -------------------------------------------
export function fieldHtml({ label, id, type = 'text', value = '', placeholder = '', required = false, step, options }) {
  if (type === 'select') {
    return `<div class="field"><label>${label}${required ? ' *' : ''}</label>
      <select id="${id}">${(options || []).map((o) => `<option value="${o.value}" ${String(o.value) === String(value) ? 'selected' : ''}>${o.label}</option>`).join('')}</select>
    </div>`;
  }
  if (type === 'textarea') {
    return `<div class="field"><label>${label}${required ? ' *' : ''}</label><textarea id="${id}" placeholder="${placeholder}">${value || ''}</textarea></div>`;
  }
  return `<div class="field"><label>${label}${required ? ' *' : ''}</label>
    <input id="${id}" type="${type}" value="${value == null ? '' : value}" placeholder="${placeholder}" ${step ? `step="${step}"` : ''}>
  </div>`;
}

export function spinner() {
  return `<div class="list-loading">Yükleniyor…</div>`;
}

// -------- compact "Detay" expandable note field ------------------------------
// A small link-like toggle that expands into a textarea, instead of an
// always-visible full-height note box on every form. Opens pre-expanded when
// there's already a note (so existing notes stay easy to read/edit), and
// shows a small dot marker on the toggle when a note is present.
export function noteFieldHtml(id, existingValue = '', label = 'Not') {
  const has = !!(existingValue && String(existingValue).trim());
  return `
    <button type="button" class="note-toggle" onclick="H.toggleNotePanel('${id}')">
      ${icon('pencil', { size: 13, className: 'icon-inline' })} ${label}${has ? ' <span class="note-dot"></span>' : ''}
    </button>
    <div class="note-panel" id="${id}Panel" style="display:${has ? 'block' : 'none'};">
      <textarea id="${id}" placeholder="Not ekle…">${escapeHtml(existingValue || '')}</textarea>
    </div>`;
}

export function toggleNotePanel(id) {
  const panel = document.getElementById(id + 'Panel');
  if (!panel) return;
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  if (panel.style.display === 'block') {
    const ta = document.getElementById(id);
    if (ta) ta.focus();
  }
}
