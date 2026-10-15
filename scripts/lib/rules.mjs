// Makan Where? — data-filter rules shared by the pipeline AND the app.
//
// Single source of truth for the two rules that exist in more than one place:
//
//   DIAL_RE      — what counts as a dialable phone number. Lives here, in
//                  refresh-data.mjs (drops redacted OSM numbers like
//                  "+601****8264"), and in index.html (decides whether to
//                  render a tel: link). If you change it, change it in BOTH
//                  this file and index.html — tests/smoke.mjs fails if they
//                  drift.
//
//   JUNK_NAME / JUNK_ANY / JUNK_EDGE — what counts as a non-eatery. Only the
//                  pipeline uses this (the app receives pre-filtered data),
//                  but it lives here so the pipeline has exactly one copy.
//
// tests/smoke.mjs asserts the literal in index.html still matches the literal
// here — if you update one and not the other, the smoke test fails.

// A phone is only worth linking if it is actually dialable. OSM carries
// redacted numbers like "+601****8264" — a broken tel: link is worse than none.
export const DIAL_RE = /^[+()\d][\d\s()+-]{5,}$/;

/* Names that are not real eateries: OSM mistags (a mall tree mapped as a
   restaurant), institutional canteens nobody can walk into, and bare generic
   nouns that tell a user nothing. Keep this list explicit and reviewable. */
export const JUNK_NAME = /^(cafe|canteen|restaurant|food ?court|kedai|warung|gerai|stall|makanan)$/i;

/* Unambiguous junk signals — these words anywhere in a name are enough. Note
   this deliberately EXCLUDES institution terms that could legitimately appear
   as part of a business name (hospital, clinic, masjid, surau...) — those are
   in JUNK_EDGE below, matched only at the start or end of the name so
   e.g. "Klinik Gigi" is still dropped while a restaurant carrying the word
   mid-name is not collateral damage. */
export const JUNK_ANY = /\b(cafeteria|students?|elementary|secondary school|kindergarten|nursery|staff ?only|bus stop|toilet|kafeteria)\b/i;

/* Ambiguous terms that ARE a junk signal when leading or trailing the name:
   a mapped tree, a hospital canteen, a surau, a prayer room. Mid-name
   occurrences of the same words are suspicious but not proof.
   Includes the Malay spellings OSM actually uses here (klinik, kafeteria,
   tandas), not just the English ones. */
export const JUNK_EDGE = /^(hospital|clinic|klini[kc]|masjid|surau|prayer|pokok|tree|tandas)\b|\b(hospital|clinic|klini[kc]|masjid|surau|prayer|pokok|tree|tandas)$/i;

export function isJunkName(name) {
  const n = String(name || '').trim();
  return JUNK_NAME.test(n) || JUNK_ANY.test(n) || JUNK_EDGE.test(n);
}

export function isDialablePhone(raw) {
  return DIAL_RE.test(String(raw || '').trim());
}
