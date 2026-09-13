// ---------------------------------------------------------------------------
// icons.js — single coherent outline icon system used everywhere in the app
// (nav, actions, edit/delete, financial, cheque, media, customer icons).
// Replaces ad-hoc emoji so every icon shares size, stroke weight, alignment
// and style. All paths are hand-authored, viewBox 0 0 24 24, stroke-based.
// ---------------------------------------------------------------------------

const PATHS = {
  home: '<path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9a1 1 0 0 0 1 1h4v-6h2v6h4a1 1 0 0 0 1-1v-9"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3.2 20c0-3.1 2.6-5.3 5.8-5.3s5.8 2.2 5.8 5.3"/><circle cx="17.3" cy="9.2" r="2.4"/><path d="M15.6 15.1c2.5.5 4.2 2.3 4.2 4.9"/>',
  monitor: '<rect x="3" y="5" width="18" height="13" rx="2"/><path d="M8 21h8M12 18v3"/><path d="M7 9.5l3 3 3-3.5 4 4.5" opacity="0"/>',
  creditCard: '<rect x="2.5" y="5.5" width="19" height="13" rx="2.3"/><path d="M2.5 10h19"/><path d="M6 14.3h4.2"/>',
  chevronLeft: '<path d="M14.5 5 7.5 12l7 7"/>',
  chevronRight: '<path d="M9.5 5l7 7-7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  pencil: '<path d="M4 20l.9-3.9L15.7 5.3a1.5 1.5 0 0 1 2.1 0l1 1a1.5 1.5 0 0 1 0 2.1L8 19.1z"/><path d="M13.7 6.9l3.4 3.4"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V4.6A1.6 1.6 0 0 1 10.6 3h2.8A1.6 1.6 0 0 1 15 4.6V7"/><path d="M6.3 7l.9 12.2a1.6 1.6 0 0 0 1.6 1.5h6.4a1.6 1.6 0 0 0 1.6-1.5L17.7 7"/><path d="M10.3 11v6M13.7 11v6"/>',
  banknote: '<rect x="2.3" y="6.3" width="19.4" height="11.4" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M5.5 9v0M18.5 15v0"/>',
  landmark: '<path d="M3.5 21h17"/><path d="M4.3 21V10.3L12 5.2l7.7 5.1V21"/><path d="M8.7 21v-7.2M15.3 21v-7.2"/><path d="M3.5 10.3h17"/>',
  receipt: '<path d="M5.3 3.3h13.4v17.4l-2.4-1.5-2 1.5-2-1.5-2 1.5-2.4-1.5-2.6 1.5z"/><path d="M8 8.2h8M8 11.6h8M8 15h5"/>',
  share: '<circle cx="18.2" cy="5.3" r="2.2"/><circle cx="5.8" cy="12" r="2.2"/><circle cx="18.2" cy="18.7" r="2.2"/><path d="M7.8 10.8l8.4-4.4M7.8 13.2l8.4 4.4"/>',
  copy: '<rect x="9" y="9" width="11.2" height="11.2" rx="2"/><path d="M4.8 15.2V4.8a2 2 0 0 1 2-2h10.4"/>',
  alertCircle: '<circle cx="12" cy="12" r="9"/><path d="M12 7.8v5.2"/><circle cx="12" cy="16.3" r="0.15" fill="currentColor" stroke="currentColor" stroke-width="2.2"/>',
  camera: '<path d="M4 8.3h3.2L8.6 6h6.8l1.4 2.3H20a1 1 0 0 1 1 1v9.3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.3a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.4" r="3.4"/>',
  image: '<rect x="3" y="4.3" width="18" height="15.4" rx="2"/><circle cx="8.6" cy="9.6" r="1.5"/><path d="M4.2 17l4.8-4.8 3.2 3.2L17 10.6l3.8 3.8"/>',
  package: '<path d="M3.5 7.6 12 3.2l8.5 4.4v8.8L12 20.8 3.5 16.4z"/><path d="M3.6 7.6 12 12l8.4-4.4"/><path d="M12 12v8.7"/>',
  megaphone: '<path d="M3.3 10.2v3.8a1 1 0 0 0 1 1h1.9l8.4 3.7V5.5l-8.4 3.7H4.3a1 1 0 0 0-1 1z"/><path d="M16.9 9.3a3.4 3.4 0 0 1 0 5.4"/>',
  trendingUp: '<path d="M3.3 15.8 9 10.1l3.7 3.7 6.7-7.6"/><path d="M14.8 6.2h4.6v4.6"/>',
  calendar: '<rect x="3.5" y="5.2" width="17" height="15" rx="2"/><path d="M3.5 9.7h17"/><path d="M8 3.2v4M16 3.2v4"/>',
  search: '<circle cx="10.4" cy="10.4" r="6.4"/><path d="M19 19l-4.3-4.3"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="M8 12.4l2.6 2.6L16.2 9.3"/>',
  wallet: '<path d="M3.5 8A1.6 1.6 0 0 1 5.1 6.4h12.8A1.6 1.6 0 0 1 19.5 8v1.3h1.1A1.4 1.4 0 0 1 22 10.7v6.6a1.4 1.4 0 0 1-1.4 1.4H5.1A1.6 1.6 0 0 1 3.5 17.1z"/><circle cx="16.8" cy="14" r="1.15"/>',
  building: '<rect x="4" y="3.3" width="11" height="17.4" rx="1.4"/><path d="M15 10h5v10.7H8" fill="none"/><path d="M7.3 7.3h1.6M11.1 7.3h1.6M7.3 11h1.6M11.1 11h1.6M7.3 14.7h1.6M11.1 14.7h1.6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.4 2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.3"/><circle cx="12" cy="8" r="0.15" fill="currentColor" stroke="currentColor" stroke-width="2.2"/>',
  sync: '<path d="M20 11A8 8 0 0 0 6.3 6.3L4 8.6"/><path d="M4 4v4.6h4.6"/><path d="M4 13a8 8 0 0 0 13.7 4.7L20 15.4"/><path d="M20 20v-4.6h-4.6"/>',
  arrowDownCircle: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v8M8.5 12l3.5 3.5L15.5 12"/>',
  arrowUpCircle: '<circle cx="12" cy="12" r="9"/><path d="M12 16.5v-8M8.5 12l3.5-3.5L15.5 12"/>'
};

export function icon(name, opts = {}) {
  const size = opts.size || 20;
  const strokeWidth = opts.strokeWidth || 1.9;
  const cls = opts.className ? ' ' + opts.className : '';
  const body = PATHS[name] || '';
  return `<svg class="icon${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}
