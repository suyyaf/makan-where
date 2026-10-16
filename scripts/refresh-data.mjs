// Makan Where? — data refresh pipeline
// Pulls fresh eatery data from OpenStreetMap (Overpass) for Cyberjaya & Putrajaya,
// classifies craving + price band, and injects the dataset into index.html.
//
// Usage:
//   node scripts/refresh-data.mjs            # live Overpass pull
//   node scripts/refresh-data.mjs --offline  # re-inject the last snapshot in data/places.json (no network)
//
// Curated top picks (data/tops.json) are manually maintained — not overwritten.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OFFLINE = process.argv.includes('--offline');

// single source of truth for the junk-name + dialable-phone rules
import { isJunkName, isDialablePhone } from './lib/rules.mjs';

const BBOXES = {
  Cyberjaya: [2.8940, 101.6234, 2.9631, 101.6749], // s w n e
  Putrajaya: [2.8768, 101.6598, 2.9831, 101.7327],
};
const PRICE_EST = { jimat: 'RM 5–12', cafe: 'RM 10–25', sedap: 'RM 15–40' };
const EMOJI_PLACEHOLDER = ''; // classification keys must match index.html constants

function classify(t) {
  const cuisine = (t.cuisine || '').toLowerCase();
  const name = (t.name || '').toLowerCase();
  const kind = t.amenity || 'restaurant';
  if (cuisine.includes('mamak') || name.includes('mamak') || name.includes('nasi kandar')) return 'Mamak';
  if (/indian|pakistani/.test(cuisine) || name.includes('banana leaf') || /nasi kandar|roti canai/.test(name)) return 'Indian';
  if (/middle_eastern|arab|kebab/.test(cuisine) || name.includes('shawarma')) return 'Middle Eastern';
  if (cuisine.includes('thai') || name.includes('thai')) return 'Thai';
  if (cuisine.includes('japanese') || /sushi|ramen|japan/.test(name)) return 'Japanese';
  if (cuisine.includes('korean') || /korean|kbbq/.test(name)) return 'Korean';
  if (/chinese|dim|noodle|dumpling/.test(cuisine) || /bak kut teh|dim sum|dimsum|wonton|mee|kuey teow|koay teow|char siew|hokkien|steamboat/.test(name)) return 'Chinese';
  if (/coffee_shop|tea|cake|dessert|donut|ice_cream|bubble_tea|bakery/.test(cuisine) || kind === 'cafe') return 'Cafe & Desserts';
  if (/burger|pizza|sandwich|western|chicken|steak|fast_food/.test(cuisine) || kind === 'fast_food') return 'Western / Fast Food';
  if (cuisine.includes('seafood') || /ikan bakar|seafood/.test(name)) return 'Seafood';
  if (/malay|malaysian|regional|asian|nasi|satay/.test(cuisine) || /nasi lemak|warung|gerai|satay|asam pedas|kedai makan|restoran makan/.test(name)) return 'Malay / Local';
  if (kind === 'food_court') return 'Malay / Local';
  return 'Local Eats';
}

function toPlace(el, area) {
  const t = el.tags || {};
  // skip permanently closed / disused / abandoned eateries (lifecycle tags)
  if (t.disused || t['disused:amenity'] || t['was:amenity'] || t['abandoned:amenity'] || t['not:amenity'] || t['closed:amenity']) return null;
  const name = (t.name || '').trim();
  if (!name) return null;
  if (isJunkName(name)) return null;
  const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
  if (lat == null) return null;
  const kind = t.amenity || 'restaurant';
  const band = (kind === 'fast_food' || kind === 'food_court') ? 'jimat' : (kind === 'cafe' ? 'cafe' : 'sedap');
  // OSM sometimes carries redacted numbers like "+601****8264" — a broken tel:
  // link is worse than none, so drop anything that is not actually dialable.
  const rawPhone = t['contact:phone'] || t.phone || '';
  const phone = isDialablePhone(rawPhone) ? rawPhone.trim() : '';
  return {
    name, area, craving: classify({ ...t, amenity: kind }),
    band, price: PRICE_EST[band],
    hours: t.opening_hours || '',
    phone,
    halal: t['diet:halal'] === 'yes',
    lat: +(+lat).toFixed(7), lon: +(+lon).toFixed(7),
    url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name.toLowerCase().includes(area.toLowerCase()) ? name : `${name} ${area}`)}`,
  };
}

function dedupe(list) {
  const seen = new Set(), out = [];
  for (const p of list) {
    const k = p.name.toLowerCase() + '|' + p.area;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

async function fetchOverpass() {
  // nodes AND ways (mall outlets/food courts are often mapped as way footprints)
  const parts = Object.values(BBOXES).map(([s, w, n, e]) =>
    ['node', 'way'].map((k) =>
      `${k}["amenity"~"^(restaurant|cafe|fast_food|food_court|bar|pub|ice_cream)$"](${s},${w},${n},${e});`).join('')).join('');
  const q = `[out:json][timeout:120];(${parts});out center 800;`;
  const mirrors = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
  let lastErr;
  for (const mirror of mirrors) {
    for (let i = 0; i < 3; i++) {
      try {
        const res = await fetch(mirror, { method: 'POST', body: q, headers: { 'User-Agent': 'makan-where/1.0 (data refresh)' } });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const json = await res.json();
        let rows = [];
        for (const el of json.elements || []) {
          // assign to the FIRST bbox that actually contains the point (bboxes overlap slightly)
          const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
          if (lat == null || lon == null) continue;
          for (const [area, [s, w, n, e]] of Object.entries(BBOXES)) {
            if (lat >= s && lat <= n && lon >= w && lon <= e) {
              const p = toPlace(el, area); if (p) rows.push(p);
              break;
            }
          }
        }
        return dedupe(rows);
      } catch (e) { lastErr = e; console.warn(`retry ${i + 1} ${mirror}: ${e.message}`); await new Promise(r => setTimeout(r, 4000)); }
    }
  }
  throw lastErr;
}

function inject(html, varName, data) {
  const re = new RegExp(`^const ${varName} = .*;\\r?$`, 'm');
  if (!re.test(html)) throw new Error(`could not find ${varName} line in index.html`);
  /* JSON.stringify leaves these characters raw — but this JSON is written into
     an inline <script> element, where they are live break-outs:
       `</script>`            closes the script tag; anything after it is NOT
                              parsed as JS but interpolated as HTML, so a hostile
                              OSM `name` tag ("<script>alert(1)</script>") can
                              run arbitrary script before the app's esc() has
                              any chance to neutralise it
       U+2028 / U+2029        valid inside JSON but legacy intra-element
                              terminators in JS string literals
     Backslashes etc. are already correctly escaped by JSON.stringify itself. */
  const json = JSON.stringify(data).replace(/[<\u2028\u2029]/g,
    c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  return html.replace(re, `const ${varName} = ${json};`);
}

/* The place count in the meta tags is static: crawlers do not run JS, so it
   cannot be runtime-derived like the count rendered into the page body is.
   Since this pipeline is the only thing that ever changes the count, it also
   rewrites the meta tags here — so the shipped description and the served
   dataset can never drift apart. */
function syncMetaCounts(html, count) {
  const patterns = [
    [/(\d+) places, proximity-ranked/g, `${count} places, proximity-ranked`],
    [/(\d+) places across Cyberjaya/g, `${count} places across Cyberjaya`],
    [/receipt reading (\d+) places/g, `receipt reading ${count} places`],
  ];
  let changed = 0;
  const out = patterns.reduce((s, [re, replacement]) => s.replace(re,
    (m, n) => { if (String(n) === String(count)) return m; changed++; return replacement; }), html);
  return { out, changed };
}

const places = OFFLINE ? JSON.parse(fs.readFileSync(path.join(root, 'data', 'places.json'), 'utf8'))
                           .filter(p => !isJunkName(p.name))
                           .map(p => {
                             // re-sanitise phones on the offline path so a stale
                             // snapshot is cleaned up rather than re-injected as-is
                             const ok = isDialablePhone(p.phone);
                             return ok ? p : { ...p, phone: '' };
                           })
                       : await fetchOverpass();

/* A hash-based Content-Security-Policy cannot be hardcoded in vercel.json: the
   inline <script> holding the dataset changes on every refresh, so the hash
   would go stale and the site would combine a valid script with a policy that
   blocks it. Instead the policy travels with the HTML file itself — this step
   recomputes the SHA-256 of every inline <script> block and rewrites the
   <meta http-equiv="Content-Security-Policy"> tag. Meta CSP cannot express
   frame-ancestors, but vercel.json already sends X-Frame-Options: DENY. */
import crypto from 'crypto';
function replaceScriptCsp(html) {
  /* The browser hashes the script's text AFTER the HTML input preprocessor has
     normalised \r\n (and lone \r) to \n — so CRLF endings on disk hash to a
     different sum than what the browser computes at parse time unless the
     captured text is normalised the same way. No other transformation happens
     inside the script data state. */
  const lf = s => s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const hashes = [...lf(html).matchAll(/<script(?![^>]*\bsrc)[^>]*>([\s\S]*?)<\/script>/g)]
    .map(m => crypto.createHash('sha256').update(m[1], 'utf8').digest('base64'))
    .map(h => `'sha256-${h}'`);
  if (!hashes.length) throw new Error('no inline <script> to hash — CSP would leave the page un-executable');
  const policy = `default-src 'self'; script-src 'self' ${hashes.join(' ')}; `
    + `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; `
    + `font-src https://fonts.gstatic.com; img-src 'self'; connect-src 'self'; `
    + `object-src 'none'; base-uri 'none'; form-action 'none'`;
  return html
    .replace(/<meta[^>]+http-equiv="Content-Security-Policy"[^>]*>\r?\n?/g, '')
    .replace(/<\/title>/, `</title>\n<meta http-equiv="Content-Security-Policy" content="${policy}">`);
}

fs.writeFileSync(path.join(root, 'data', 'places.json'), JSON.stringify(places));
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const tops = JSON.parse(fs.readFileSync(path.join(root, 'data', 'tops.json'), 'utf8'));
const { out: nextIndex, changed } = syncMetaCounts(inject(inject(index, 'PLACES', places), 'TOPS', tops), places.length);
fs.writeFileSync(path.join(root, 'index.html'), replaceScriptCsp(nextIndex));

/* The OG card's own copy of the count lives in icons/og-1200x630.png, which
   make-og.mjs derives from data/places.json the same way — so the image is
   regenerated to match whatever this run just wrote. */
import { spawnSync } from 'child_process';
const og = spawnSync(process.execPath, [path.join(root, 'scripts', 'make-og.mjs')], { stdio: 'inherit' });
if (og.status !== 0) console.warn(`og image not regenerated (exit ${og.status}) — run "node scripts/make-og.mjs" manually`);

console.log(`refreshed ${places.length} places ` +
  `(${places.filter(p => p.halal).length} halal-tagged, ${places.filter(p => p.hours).length} with hours)` +
  (changed ? `, meta description updated (${changed} tag(s))` : ', meta description already in sync') +
  (OFFLINE ? ' [offline snapshot]' : ' [live Overpass]'));
