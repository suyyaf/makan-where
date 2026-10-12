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
  const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
  if (lat == null) return null;
  const kind = t.amenity || 'restaurant';
  const band = (kind === 'fast_food' || kind === 'food_court') ? 'jimat' : (kind === 'cafe' ? 'cafe' : 'sedap');
  return {
    name, area, craving: classify({ ...t, amenity: kind }),
    band, price: PRICE_EST[band],
    hours: t.opening_hours || '',
    phone: t['contact:phone'] || t.phone || '',
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
  return html.replace(re, `const ${varName} = ${JSON.stringify(data)};`);
}

const places = OFFLINE ? JSON.parse(fs.readFileSync(path.join(root, 'data', 'places.json'), 'utf8'))
                       : await fetchOverpass();

fs.writeFileSync(path.join(root, 'data', 'places.json'), JSON.stringify(places));
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const tops = JSON.parse(fs.readFileSync(path.join(root, 'data', 'tops.json'), 'utf8'));
fs.writeFileSync(path.join(root, 'index.html'), inject(inject(index, 'PLACES', places), 'TOPS', tops));

console.log(`refreshed ${places.length} places ` +
  `(${places.filter(p => p.halal).length} halal-tagged, ${places.filter(p => p.hours).length} with hours)` +
  (OFFLINE ? ' [offline snapshot]' : ' [live Overpass]'));
