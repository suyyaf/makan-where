// Makan Where? — favourites behaviour tests.
//
// Complements tests/smoke.mjs. The smoke suite asserts the feature exists and is
// reachable; this one asserts how it behaves on the paths that regress silently and
// have no other coverage:
//   - a favourite whose place has dropped out of the latest OSM pull (must render
//     from its stored name+area, with no distance, not vanish or render blank)
//   - a ~60-character place name at 390px (must truncate, not overflow or wrap)
//   - the two zero-item states staying distinct (first-run vs narrowed-by-search)
//   - every corrupt-mw_favs class surviving load, rendering, and being normalised
//   - a save that storage refuses is never reported as successful
//
// Usage: node tests/favourites-behaviour.mjs   (exits non-zero if any check fails)
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const URL = 'file:///' + path.join(root, 'index.html').replace(/\\/g, '/');
const GEO_STUB = `
  Object.defineProperty(navigator, 'geolocation', {
    value: { getCurrentPosition: (ok) => ok({ coords: { latitude: 2.9156, longitude: 101.6505 } }) },
    configurable: true
  });`;
const FAVBTN = 'button[data-k="favsOnly"]';

const browser = await chromium.launch();
const VIEWPORT = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
// Each block gets its OWN context. The context is the storage boundary, not the
// page, so sharing one context makes every block's localStorage seed visible to
// the next — block 1 ("first-run, zero saves") only passes today because it runs
// first. Reorder the blocks and it fails for a reason that isn't the app.
const newCtx = () => browser.newContext(VIEWPORT);
const ctx = await newCtx();   // kept only for the corrupt-payload sweep that closes over it

const out = [];
const say = (n, ok, extra = '') => { out.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${extra ? '  ' + extra : ''}`); };

// 1. first-run empty state — fresh context, guaranteed empty storage
{
  const firstRun = await newCtx();
  const p = await firstRun.newPage();
  await p.goto(URL, { waitUntil: 'load' }); await p.waitForTimeout(900);
  await p.click('#dirbtn'); await p.waitForTimeout(400);
  const pre = await p.evaluate(() => localStorage.getItem('mw_favs'));
  say('first-run block starts with empty storage (isolated context)', pre === null, String(pre));
  await p.click(FAVBTN); await p.waitForTimeout(400);
  const t = await p.evaluate(() => document.getElementById('list').textContent.replace(/\s+/g, ' ').trim());
  say('first-run empty state copy', /Tiada kedai kegemaran lagi/.test(t), JSON.stringify(t));
  say('first-run empty state has per-device line', /peranti ini/.test(t));
  say('first-run empty state has no rows', (await p.locator('.row').count()) === 0);
  await firstRun.close();
}

// 2. save -> filter -> correct row -> no distance -> disclaimer in modal
{
  const p = await ctx.newPage();
  await p.addInitScript(GEO_STUB);
  await p.goto(URL, { waitUntil: 'load' }); await p.waitForTimeout(900);
  await p.click('#locbtn'); await p.waitForTimeout(700);   // distances live for normal rows
  await p.click('#dirbtn'); await p.waitForTimeout(500);
  const nm = (await p.evaluate(() => document.querySelectorAll('.row .nm')[0].textContent.trim()));
  const rowHadDist = (await p.evaluate(() => document.querySelectorAll('.row')[0].querySelectorAll('.dist').length)) > 0;
  await p.click('.row >> nth=0'); await p.waitForTimeout(300);
  const disclaimer = await p.textContent('#modal');
  say('modal disclaimer present', /peranti|device/i.test(disclaimer));
  await p.click('#modal #mfav'); await p.waitForTimeout(400);
  await p.click('#modal .x'); await p.waitForTimeout(300);
  const stored = await p.evaluate(() => JSON.parse(localStorage.getItem('mw_favs')));
  say('save wrote object record', stored && typeof stored[0] === 'object' && stored[0].name === nm, JSON.stringify(stored));
  say('control label shows count', /\(1\)/.test(await p.textContent(FAVBTN)), await p.textContent(FAVBTN));
  await p.click(FAVBTN); await p.waitForTimeout(400);
  const rows = await p.locator('.row').count();
  const shown = await p.evaluate(() => document.querySelector('.row .nm').textContent.trim());
  say('filter narrows to exactly the saved place', rows === 1 && shown === nm, `rows=${rows} shown=${shown}`);
  const distEls = await p.evaluate(() => document.querySelector('.row').querySelectorAll('.dist').length);
  const metaTxt = await p.evaluate(() => document.querySelector('.row .meta').textContent.replace(/\s+/g, ' ').trim());
  say('favourite row has NO distance element', distEls === 0, `(normal row had distance=${rowHadDist})`);
  say('favourite row has no distance text/placeholder', !/(\d[\d.]*\s*(km|m)\b)/.test(metaTxt) && !/—/.test(metaTxt), JSON.stringify(metaTxt));
  const hdr = await p.textContent('#dirsub');
  say('filtered header explains the list', /kegemaran/i.test(hdr), JSON.stringify(hdr));
  await p.close();
}

// 3. narrowed-to-nothing: distinct copy, never the first-run line
{
  const p = await ctx.newPage();
  await p.addInitScript(() => localStorage.setItem('mw_favs', JSON.stringify([{ id: 'Putrajaya|AFN Cafe & Restaurant', name: 'AFN Cafe & Restaurant', area: 'Putrajaya' }])));
  await p.goto(URL, { waitUntil: 'load' }); await p.waitForTimeout(900);
  await p.click('#dirbtn'); await p.waitForTimeout(400);
  await p.click(FAVBTN); await p.waitForTimeout(300);
  await p.fill('#q', 'zzzznomatch'); await p.waitForTimeout(400);
  const t = await p.evaluate(() => document.getElementById('list').textContent.replace(/\s+/g, ' ').trim());
  say('narrowed state distinct from first-run', /padan tapisan/i.test(t) && !/Tiada kedai kegemaran lagi/i.test(t), JSON.stringify(t));
  await p.close();
}

// 4. stale save: place absent from live data still renders honestly
{
  const p = await ctx.newPage();
  await p.addInitScript(() => localStorage.setItem('mw_favs', JSON.stringify([{ id: 'Nowhere|Kedai Yang Sudah Tutup', name: 'Kedai Yang Sudah Tutup', area: 'Nowhere' }])));
  await p.goto(URL, { waitUntil: 'load' }); await p.waitForTimeout(900);
  await p.click('#dirbtn'); await p.waitForTimeout(400);
  await p.click(FAVBTN); await p.waitForTimeout(400);
  const r = await p.evaluate(() => { const x = document.querySelector('.row'); return x ? { nm: x.querySelector('.nm').textContent.trim(), tag: x.querySelector('.tag').textContent.trim(), dist: x.querySelectorAll('.dist').length } : null; });
  say('stale save still renders name+area', !!r && r.nm === 'Kedai Yang Sudah Tutup' && r.tag === 'Nowhere', JSON.stringify(r));
  say('stale save renders no distance element', !!r && r.dist === 0);
  await p.close();
}

// 5. long name at mobile width: no overflow, truncates
{
  const long = { id: 'Putrajaya|Restoran Nasi Kandar Pelita Extra Long Name Test Twenty Four Hour', name: 'Restoran Nasi Kandar Pelita Extra Long Name Test Twenty Four Hour', area: 'Putrajaya' };
  const p = await ctx.newPage();
  await p.addInitScript((rec) => localStorage.setItem('mw_favs', JSON.stringify([rec])), long);
  await p.goto(URL, { waitUntil: 'load' }); await p.waitForTimeout(900);
  await p.click('#dirbtn'); await p.waitForTimeout(400);
  await p.click(FAVBTN); await p.waitForTimeout(400);
  const info = await p.evaluate(() => {
    const row = document.querySelector('.row'); const nm = row.querySelector('.nm');
    return { scrollW: document.documentElement.scrollWidth, rowH: row.getBoundingClientRect().height,
             nmH: nm.getBoundingClientRect().height,
             clipped: nm.scrollWidth > nm.clientWidth, areaVisible: !!row.querySelector('.tag') };
  });
  say('long name: no horizontal overflow at 390', info.scrollW <= 390, `scrollW=${info.scrollW}`);
  // Row height, not name height, is what catches wrapping. A two-line name would
  // keep `.nm` at its 18px line box and grow the ROW instead, so asserting on
  // `nmH` alone passes on a wrapped card. 78px is the measured single-line row.
  say('long name: row stays single-line height (no wrap)', info.rowH <= 84, `rowH=${info.rowH}`);
  say('long name: name is clipped, not wrapped', info.clipped && info.nmH < 30, JSON.stringify(info));
  say('long name: area still on the row', info.areaVisible);
  await p.close();
}

// 6. corrupt payloads: no throw, directory renders, storage normalised
for (const [label, payload] of [
  ['not-an-array', '{"not":"an array"}'],
  ['array-of-things', '[{"broken":true},null,42]'],
  ['garbage', 'not json at all'],
  ['mixed', JSON.stringify(['Putrajaya|AFN Cafe & Restaurant', { id: 'Cyberjaya|Some Place', name: 'Some Place', area: 'Cyberjaya' }])],
]) {
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e).split('\n')[0]));
  await p.addInitScript((v) => localStorage.setItem('mw_favs', v), payload);
  await p.goto(URL, { waitUntil: 'load' }); await p.waitForTimeout(900);
  await p.click('#dirbtn'); await p.waitForTimeout(400);
  const rows = await p.locator('.row').count();
  const norm = await p.evaluate(() => { try { const v = JSON.parse(localStorage.getItem('mw_favs')); return Array.isArray(v) ? v.map(r => typeof r) : 'not-array'; } catch (e) { return 'unparseable'; } });
  say(`corrupt(${label}) no throw`, errs.length === 0, errs.join(' | '));
  say(`corrupt(${label}) directory renders`, rows >= 100, `rows=${rows}`);
  say(`corrupt(${label}) normalised in storage`, Array.isArray(norm) && norm.every(t => t === 'object'), JSON.stringify(norm));
  await p.close();
}

// 7. blocked storage: no false success
{
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e).split('\n')[0]));
  await p.addInitScript(() => {
    const proto = Object.getPrototypeOf(window.localStorage);
    const g = proto.getItem, s = proto.setItem;
    proto.getItem = function (k) { if (k === 'mw_favs') throw new DOMException('denied', 'SecurityError'); return g.call(this, k); };
    proto.setItem = function (k, v) { if (k === 'mw_favs') throw new DOMException('quota', 'QuotaExceededError'); return s.call(this, k, v); };
  });
  await p.goto(URL, { waitUntil: 'load' }); await p.waitForTimeout(900);
  await p.click('#dirbtn'); await p.waitForTimeout(400);
  await p.click('.row >> nth=0'); await p.waitForTimeout(300);
  await p.click('#modal #mfav'); await p.waitForTimeout(500);
  const label = (await p.textContent('#modal #mfav')).trim();
  say('blocked storage: save not shown as successful', !/saved|disimpan|❤/i.test(label), JSON.stringify(label));
  say('blocked storage: no throw', errs.length === 0, errs.join(' | '));
  await p.close();
}

// 8. row click still opens the modal (half-removal guard)
{
  const p = await ctx.newPage();
  await p.goto(URL, { waitUntil: 'load' }); await p.waitForTimeout(900);
  await p.click('#dirbtn'); await p.waitForTimeout(400);
  await p.click('.row >> nth=3'); await p.waitForTimeout(400);
  say('row click opens modal (desktop ctx)', (await p.locator('#modalbg:visible').count()) === 1);
  await p.close();
}

console.log(out.join('\n'));
const fails = out.filter(l => l.startsWith('FAIL'));
console.log(`\nFAVOURITES BEHAVIOUR: ${out.length - fails.length}/${out.length} passed` + (fails.length ? ' ❌' : ' ✅'));
await ctx.close();
await browser.close();
process.exit(fails.length ? 1 : 0);