// ---------------------------------------------------------------------------
// util.js — generic helpers: ids, formatting, dates, toast, image compression
// ---------------------------------------------------------------------------

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

export function fmt(n) {
  const v = Number(n) || 0;
  return Math.round(v).toLocaleString('tr-TR') + ' ₺';
}

export function fmtN(n) {
  const v = Number(n) || 0;
  return Math.round(v).toLocaleString('tr-TR');
}

// Full HTML-escaper safe for both text nodes and quoted attribute values
// (escapes &, <, >, " and ' so it can never break out of an attribute).
export function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Escapes free text for safe embedding as a single-quoted JS string literal
// *inside* an onclick="..." (double-quoted) HTML attribute, e.g.
// `onclick="H.foo('${jsAttr(name)}')"`. HTML-escapes first (so the string
// can't break out of the attribute), then JS-escapes backslashes/quotes (so
// the decoded attribute value is still valid JS once the browser parses it).
export function jsAttr(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, ' ')
    .replace(/\r/g, '');
}

export function todayISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 10);
}

export function formatDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

export function formatDateShort(iso) {
  if (!iso) return '—';
  const [, m, d] = iso.split('-');
  return `${d}.${m}`;
}

export function formatDateTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function addDays(iso, days) {
  const dt = new Date(iso + 'T00:00:00');
  dt.setDate(dt.getDate() + Number(days || 0));
  const off = dt.getTimezoneOffset();
  const local = new Date(dt.getTime() - off * 60000);
  return local.toISOString().slice(0, 10);
}

export function isPastOrToday(iso) {
  if (!iso) return false;
  return iso <= todayISO();
}

export function isFutureDate(iso) {
  if (!iso) return false;
  return iso > todayISO();
}

export function daysBetween(a, b) {
  const d1 = new Date(a + 'T00:00:00');
  const d2 = new Date(b + 'T00:00:00');
  return Math.round((d2 - d1) / 86400000);
}

const AVATAR_PALETTE = ['#8B5CF6', '#06B6D4', '#F59E0B', '#F43F5E', '#22C55E', '#6366F1', '#EC4899', '#14B8A6'];
export function hashColor(name, palette = AVATAR_PALETTE) {
  let hash = 0;
  const s = name || '';
  for (let i = 0; i < s.length; i++) hash = s.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}

export function initials(name) {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

export function clampMoney(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

// -------- toast ------------------------------------------------------------
export function toast(message, type = '') {
  const wrap = document.getElementById('toastWrap');
  if (!wrap) return;
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity .25s ease';
    setTimeout(() => el.remove(), 260);
  }, 2400);
}

// -------- image compression -------------------------------------------------
export function compressImage(file, maxWidth = 1000, quality = 0.68) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('Dosya yok'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Dosya okunamadı'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Görsel yüklenemedi'));
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > maxWidth) {
          h = Math.round((h * maxWidth) / w);
          w = maxWidth;
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// -------- simple confirm dialog (native, fine for a single-user tool) ------
export function confirmAction(message) {
  return window.confirm(message);
}

export function debounce(fn, wait = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}
