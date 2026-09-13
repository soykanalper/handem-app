// ---------------------------------------------------------------------------
// logos.js — optional real-brand logo lookup for avatarHtml() (components.js).
// A curated set of 31 logos for the müşteri/yüklenici names this workspace
// actually uses (fetched once, cropped/padded to a consistent white-card
// look — see icons/logos/*.png). Client/vendor names are free text the user
// types into forms, so matching is normalized (case + Turkish characters
// stripped) and tolerant of extra words ("Eskidji Bazaar" still matches the
// "eskidji" key) rather than requiring an exact string. Any name with no
// match simply falls back to the existing colored-initials avatar — nothing
// breaks for a vendor/customer that isn't in this curated list.
// ---------------------------------------------------------------------------

// key -> icons/logos/<key>.png. Keys are already normalized (lowercase,
// Turkish characters folded to plain ASCII, no spaces/punctuation).
const LOGO_KEYS = [
  'alemfm', 'altinkilic', 'atv', 'bestfm', 'beyaztv', 'bloomberght', 'cnnturk',
  'eskidji', 'fox', 'now', 'glint', 'haberturk', 'joyturk', 'kanal7', 'kanald',
  'kralfm', 'metrofm', 'ntv', 'number1turk', 'onvo', 'powerfm', 'radyod',
  'schafer', 'showradyo', 'showtv', 'skytech', 'startv', 'storks', 'superfm',
  'trt1', 'trthaber', 'tv8'
];
// fox_now_raw.png covers both the old "Fox" and current "Now" branding of
// the same channel — both keys point at the one file.
const FILE_OVERRIDES = { fox: 'fox_now', now: 'fox_now' };

function normalize(s) {
  return (s || '')
    .toString()
    .replace(/İ/g, 'i').replace(/I/g, 'i').replace(/ı/g, 'i')
    .replace(/Ğ/g, 'g').replace(/ğ/g, 'g')
    .replace(/Ü/g, 'u').replace(/ü/g, 'u')
    .replace(/Ş/g, 's').replace(/ş/g, 's')
    .replace(/Ö/g, 'o').replace(/ö/g, 'o')
    .replace(/Ç/g, 'c').replace(/ç/g, 'c')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

// Longest key first so e.g. "trthaber" is checked before the shorter "trt1"
// would ever get a chance to accidentally match inside it.
const SORTED_KEYS = [...LOGO_KEYS].sort((a, b) => b.length - a.length);

export function logoForName(name) {
  const n = normalize(name);
  if (!n) return null;
  for (const key of SORTED_KEYS) {
    if (n === key || n.includes(key)) {
      const file = FILE_OVERRIDES[key] || key;
      return `icons/logos/${file}.png`;
    }
  }
  return null;
}
