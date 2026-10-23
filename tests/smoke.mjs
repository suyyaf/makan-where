// Makan Where? — browser smoke test
// Usage:
//   npm test                (tests local index.html via file://)
//   SMOKE_URL=<url> npm test  (tests a deployed URL)
// Exits non-zero if any check fails.
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const URL = process.env.SMOKE_URL || 'file:///' + path.join(root, 'index.html').replace(/\\/g, '/');

const results = [];
const check = (name, cond) => {
  results.push({ name, ok: !!cond });
  console.log((cond ? '  ✅' : '  ❌') + ' ' + name);
};

// Stub geolocation deterministically (Cyberjaya south) before any page script runs.
const GEO_STUB = `
  Object.defineProperty(navigator, 'geolocation', {
    value: { getCurrentPosition: (ok) => ok({ coords: { latitude: 2.9156, longitude: 101.6505 } }) },
    configurable: true
  });`;

const browser = await chromium.launch();
try {
  // ---------- Desktop ----------
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(GEO_STUB);

  console.log('\n>Loading ' + URL);
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(1500); // fonts

  check('no JS/console errors on load', errors.length === 0);

  check('neon hero renders', (await page.locator('.neon').count()) >= 1 && (await page.locator('.neon').first().isVisible()));
  const menuItems = await page.locator('.mitem').count();
  check('Tonight\u2019s Menu has 5 picks', menuItems === 5);

  // location → menu re-ranks + distances appear
  await page.click('#locbtn');
  await page.waitForTimeout(800);
  check('location turns on', await page.locator('#locbtn.on').count() === 1);
  check('menu shows distances', (await page.locator('.mmeta .dist').count()) >= 3);

  // criteria → receipt
  await page.click('#crithead');
  await page.locator('#cCraving .chip[data-v="Mamak"]').click();
  const poolText = await page.textContent('#critpool');
  check('criteria pool counter > 0', /in the pot/.test(poolText) && !poolText.startsWith('0 '));
  // open-now + halal toggles in criteria
  await page.locator('#cExtras .chip[data-c="open"]').click();
  const openPool = await page.textContent('#critpool');
  check('open-now criteria narrows pool', parseInt(openPool) > 0 && parseInt(openPool) < 176);
  await page.locator('#cExtras .chip[data-c="open"]').click();
  await page.locator('#cExtras .chip[data-c="halal"]').click();
  const halalPool = await page.textContent('#critpool');
  check('halal criteria narrows pool', parseInt(halalPool) > 0 && parseInt(halalPool) < 176);
  await page.locator('#cExtras .chip[data-c="halal"]').click();
  await page.click('#decide');
  await page.waitForSelector('#pick .rname', { timeout: 8000 });
  await page.waitForFunction(() => /ORDER NO\./.test(document.getElementById('pick').textContent), { timeout: 10000 });
  const receipt = await page.textContent('#pick');
  check('receipt prints verdict with order no.', /ORDER NO\./.test(receipt));
  check('receipt has share button', (await page.locator('#pick .rre:has-text("SHARE")').count()) === 1);
  check('no JS errors after interactions', errors.length === 0);

  // directory
  await page.click('#dirbtn');
  await page.waitForTimeout(500);
  const rows = await page.locator('.row').count();
  check('directory lists places (>=100)', rows >= 100);
  check('A-Z letter sections render', (await page.locator('.ltr').count()) >= 20);
  const letters = await page.locator('.ltr').allTextContents();
  check('letter sections in alphabetical order', letters.every((l, i) => i === 0 || l > letters[i - 1]));
  check('YOU ARE HERE badge visible after location', (await page.locator('#youare:visible').count()) === 1);

  // search
  await page.fill('#q', 'nasi');
  await page.waitForTimeout(300);
  const nasi = await page.textContent('#count');
  check('search narrows results', /\b(\d+)\b/.test(nasi) && parseInt(nasi.match(/\d+/)[0]) < rows);
  await page.fill('#q', '');
  await page.waitForTimeout(300);

  // area filter
  await page.locator('#area .chip[data-v="Cyberjaya"]').click();
  await page.waitForTimeout(300);
  const cj = await page.textContent('#count');
  check('area filter narrows results', parseInt(cj.match(/\d+/)[0]) < rows);
  await page.locator('#area .chip[data-v="Cyberjaya"]').click(); // toggle off
  await page.waitForTimeout(300);

  // extras filters (open now / halal)
  await page.locator('#extras .chip[data-k="openOnly"]').click();
  await page.waitForTimeout(300);
  const openCt = parseInt((await page.textContent('#count')).match(/\d+/)[0]);
  check('directory open-now filter works', openCt > 0 && openCt < rows);
  await page.locator('#extras .chip[data-k="openOnly"]').click();
  await page.locator('#extras .chip[data-k="halalOnly"]').click();
  await page.waitForTimeout(300);
  const halalCt = parseInt((await page.textContent('#count')).match(/\d+/)[0]);
  check('directory halal filter works', halalCt > 0 && halalCt < rows);
  await page.locator('#extras .chip[data-k="halalOnly"]').click();
  await page.waitForTimeout(300);

  // map
  await page.click('#maphead');
  await page.waitForTimeout(400);
  const pins = await page.locator('.pin').count();
  check('map pins drawn (>50)', pins > 50);
  await page.click('#zin');
  await page.click('#zin');
  check('zoom changes transform', (await page.getAttribute('#map g:nth-of-type(1)', 'transform'))?.includes('scale'));

  // modal + favourites
  await page.click('.row >> nth=0');
  await page.waitForTimeout(300);
  check('detail modal opens', (await page.locator('#modalbg:visible').count()) === 1);
  await page.click('#modal #mfav');
  await page.waitForTimeout(300);
  const stored = await page.evaluate(() => localStorage.getItem('mw_favs'));
  check('favourite persists to localStorage', !!stored && stored.length > 2);
  await page.click('#modal .x');
  check('modal closes', (await page.locator('#modalbg:visible').count()) === 0);
  await page.evaluate(() => localStorage.removeItem('mw_favs'));
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(600);
  await page.click('#dirbtn');
  await page.waitForTimeout(500);

  // ---------- favourites: the hardened gate ----------
  // Shape-agnostic readers. The approved saved-record shape is
  //   { id, name, area, lat?, lon?, cuisine? }
  // with `id` === "Area|Name" and `name` the bare human name. A bare-ID-only
  // store (pre-migration, or written by a cached old build) is a plain string.
  // Every assertion reads through these so it states the *rule* — "the saved
  // record names the place the user saved" — not one format's spelling of it.
  const readFavs = () => page.evaluate(() => {
    let v;
    try { v = JSON.parse(localStorage.getItem('mw_favs') || '[]'); } catch (e) { return { raw: 'unparseable' }; }
    if (!Array.isArray(v)) return { raw: 'not-array' };
    const recs = v.map((x) => {
      if (typeof x === 'string') {
        const [area, name] = x.split('|');
        return { id: x, name: name || '', area: area || '', bare: true };
      }
      if (x && typeof x === 'object') {
        return { id: x.id || '', name: x.name || '', area: x.area || '', bare: false };
      }
      return { id: '', name: '', area: '', bad: true };
    });
    return { raw: v, recs, ids: recs.map((r) => r.id) };
  });
  // A record "is" a given place if its exact name matches — the bare name, not a
  // substring of a composite id. This is what survives the shape change.
  const isPlace = (recs, name, area) =>
    Array.isArray(recs) && recs.some((r) => r.name === name && (!area || !r.area || r.area === area));
  const rowName = (i) => page.evaluate((n) => {
    const r = document.querySelectorAll('.row')[n];
    return r ? r.querySelector('.nm').textContent.trim() : null;
  }, i);
  const rowArea = (i) => page.evaluate((n) => {
    const r = document.querySelectorAll('.row')[n];
    const t = r && r.querySelector('.tag');
    return t ? t.textContent.trim() : null;
  }, i);

  // Before the first save the store must be absent/empty — not "non-empty after a click".
  const preSave = await readFavs();
  check('favourites: nothing is stored before the first save', preSave.raw === undefined || (Array.isArray(preSave.ids) && preSave.ids.length === 0));

  // Save a SPECIFIC place from the detail modal and assert that place is the one recorded.
  const targetName = await rowName(3);
  const targetArea = await rowArea(3);
  await page.click('.row >> nth=3');
  await page.waitForTimeout(300);
  await page.click('#modal #mfav');
  await page.waitForTimeout(300);
  const one = await readFavs();
  check('favourites: save from detail modal records that specific place (not just non-empty)',
    Array.isArray(one.ids) && one.ids.length === 1 && isPlace(one.recs, targetName, targetArea));
  const modalSaysSaved = await page.evaluate(() => /Saved|Disimpan|❤/i.test(document.getElementById('mfav').textContent));
  check('favourites: the save control reflects the saved state', modalSaysSaved);
  const disclaimer = await page.textContent('#modal');
  check('favourites: per-device disclaimer present in the detail modal', /peranti|device|this phone|this device/i.test(disclaimer));
  await page.click('#modal .x');
  await page.waitForTimeout(200);

  // Reaching favourites must be possible through the UI — no internal calls.
  // NOTE: this must NOT match the row hearts (aria-label "Add X to favourites"),
  // or it passes on the very thing we are removing. Scope to the filter rows and
  // exclude .fav explicitly, then require the resulting control to actually filter.
  const FAV_CTL = '#dir .frow button:visible:not(.fav), #dir .frow [role=button]:visible:not(.fav), [data-k="favsOnly"]:visible, [data-favs]:visible';
  const favControls = await page.locator(FAV_CTL).evaluateAll((els) =>
    els.filter((el) => /favourite|favorit|kegemaran|favsOnly/i.test(el.outerHTML + ' ' + el.textContent)).length
  );
  check('favourites: a reachable control exists in the directory (discoverable without remembering saves)',
    favControls > 0);

  if (favControls > 0) {
    const clickable = page.locator(FAV_CTL).filter({ hasText: /kegemaran|favourite/i });
    const clickableExists = (await clickable.count()) > 0;
    if (clickableExists) await clickable.first().click();
    await page.waitForTimeout(400);
    const rowsShown = await page.locator('.row').count();
    check('favourites: the filter narrows the directory to saved places only', clickableExists && rowsShown === 1);
    const shownName = await rowName(0);
    check('favourites: the filtered row is the place that was saved', shownName === targetName);
    const header = await page.textContent('#dir .sub2, #dirsub').catch(() => '');
    check('favourites: filtered view carries a header explaining what the list is', /favourite|kegemaran|simpan/i.test(header));
  } else {
    check('favourites: the filter narrows the directory to saved places only', false);
    check('favourites: the filtered row is the place that was saved', false);
    check('favourites: filtered view carries a header explaining what the list is', false);
  }

  // Empty state on the filtered view with zero saves.
  // Selectors are deliberately NOT pinned to #list / #dir inner containers —
  // Noctis is right that coupling the assertion to the render path makes it fail
  // for reasons unrelated to the copy. Assert "visible anywhere in the directory
  // view", which is what the user actually perceives.
  await page.evaluate(() => localStorage.removeItem('mw_favs'));
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(600);
  await page.click('#dirbtn');
  await page.waitForTimeout(400);
  const emptyCtl = await page.locator(FAV_CTL).filter({ hasText: /kegemaran|favourite/i }).first();
  const emptyCtlExists = (await emptyCtl.count()) > 0;
  if (emptyCtlExists) await emptyCtl.click();
  await page.waitForTimeout(400);
  const dirVisibleText = (v) => v.evaluate(() => {
    const root = document.getElementById('dir');
    if (!root) return '';
    // visible text only, so a hidden panel does not satisfy the assertion
    return Array.from(root.querySelectorAll('*'))
      .filter((el) => el.offsetParent !== null || el === root)
      .map((el) => (el.children.length ? '' : el.textContent || ''))
      .join(' ')
      .replace(/\s+/g, ' ');
  });
  const emptyViewText = await dirVisibleText(page);
  check('favourites: empty filtered view explains itself in BM (not a blank panel)',
    emptyCtlExists && /kegemaran|simpan|favourite/i.test(emptyViewText));
  check('favourites: empty filtered view carries the per-device disclaimer',
    emptyCtlExists && /peranti|device/i.test(emptyViewText));

  // Second zero-item state: saves EXIST, but another filter narrows the list to
  // nothing. Must not reuse the first-run copy, or a user reads "no favourites"
  // and concludes the app ate them.
  const narrowed = await ctx.newPage();
  await narrowed.addInitScript(() => localStorage.setItem('mw_favs', JSON.stringify(['Putrajaya|AFN Cafe & Restaurant'])));
  await narrowed.goto(URL, { waitUntil: 'load' });
  await narrowed.waitForTimeout(900);
  await narrowed.click('#dirbtn');
  await narrowed.waitForTimeout(400);
  const nCtl = narrowed.locator(FAV_CTL).filter({ hasText: /kegemaran|favourite/i }).first();
  const nCtlExists = (await nCtl.count()) > 0;
  if (nCtlExists) await nCtl.click();
  await narrowed.waitForTimeout(400);
  // now narrow to nothing with a search term that matches no saved place
  await narrowed.fill('#q', 'zzzznomatch');
  await narrowed.waitForTimeout(400);
  const narrowedText = await dirVisibleText(narrowed);
  const savedRowShown = await narrowed.locator('.row').count();
  check('favourites: narrowed-to-nothing state is distinguishable from the empty state',
    nCtlExists && savedRowShown === 0 && /padan|tapisan|filter|search|cari/i.test(narrowedText) && !/tiada kedai kegemaran lagi/i.test(narrowedText));
  await narrowed.close();

  // Two-item unsave: removing one must not disturb the other.
  await page.evaluate(() => localStorage.removeItem('mw_favs'));
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(600);
  await page.click('#dirbtn');
  await page.waitForTimeout(400);
  await page.click('.row >> nth=1');
  await page.waitForTimeout(250);
  await page.click('#modal #mfav');
  await page.waitForTimeout(250);
  await page.click('#modal .x');
  await page.waitForTimeout(250);
  const aName = await rowName(1);
  const bName = await rowName(4);
  await page.click('.row >> nth=4');
  await page.waitForTimeout(250);
  await page.click('#modal #mfav');
  await page.waitForTimeout(250);
  await page.click('#modal .x');
  await page.waitForTimeout(250);
  const two = await readFavs();
  check('favourites: two saves record exactly two distinct places',
    Array.isArray(two.recs) && two.recs.length === 2 && isPlace(two.recs, aName) && isPlace(two.recs, bName));
  await page.click('.row >> nth=1');
  await page.waitForTimeout(250);
  await page.click('#modal #mfav');
  await page.waitForTimeout(300);
  await page.click('#modal .x');
  await page.waitForTimeout(250);
  const afterUnsave = await readFavs();
  check('favourites: unsave removes the exact record opened, and leaves the other intact',
    Array.isArray(afterUnsave.recs) && afterUnsave.recs.length === 1 && isPlace(afterUnsave.recs, bName) && !isPlace(afterUnsave.recs, aName));
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(600);
  const survived = await readFavs();
  check('favourites: the surviving save persists across reload',
    Array.isArray(survived.recs) && survived.recs.length === 1 && isPlace(survived.recs, bName) && !isPlace(survived.recs, aName));

  // Corrupt payload must not take the app down. mw_favs is user-writable storage:
  // valid JSON that is not an array is reachable from a half-written value or an
  // older build, and today it poisons the whole directory render.
  for (const [label, payload] of [
    ['valid JSON, not an array', '{"not":"an array"}'],
    ['valid JSON, array of things', '[{"broken":true},null,42]'],
    ['garbage', 'not json at all'],
    // The half-migrated store a mid-rollout cache produces: one bare-ID string and
    // one approved-shape record in the same array. The accessor must resolve BOTH.
    ['mixed bare-ID + snapshot record', JSON.stringify(['Putrajaya|AFN Cafe & Restaurant', { id: 'Cyberjaya|Some Place', name: 'Some Place', area: 'Cyberjaya' }])],
  ]) {
    const cp = await ctx.newPage();
    const cpErrs = [];
    cp.on('pageerror', (e) => cpErrs.push(String(e).split('\n')[0]));
    await cp.addInitScript((v) => localStorage.setItem('mw_favs', v), payload);
    await cp.goto(URL, { waitUntil: 'load' });
    await cp.waitForTimeout(900);
    await cp.click('#dirbtn');
    await cp.waitForTimeout(500);
    const cpRows = await cp.locator('.row').count();
    const cpFavs = await cp.evaluate(() => localStorage.getItem('mw_favs'));
    check(`favourites: corrupt mw_favs (${label}) does not throw`, cpErrs.length === 0);
    check(`favourites: corrupt mw_favs (${label}) still renders the directory`, cpRows >= 100);
    // A bad value must be normalised in storage, not merely survived on read —
    // otherwise the poison is still there for the next code path that touches it.
    let normalised = true;
    try { normalised = Array.isArray(JSON.parse(cpFavs || '[]')); } catch (e) { normalised = false; }
    if (!/mixed/.test(label)) {
      check(`favourites: corrupt mw_favs (${label}) is normalised in storage`, normalised);
    }
    await cp.close();
  }

  // Approved record shape: { id, name, area, lat?, lon?, cuisine? } — id stays
  // "Area|Name", name is the BARE human name. A save must write that shape, not a
  // bare id string; a migration must read a bare id and produce it.
  //
  // Two defects fixed here, both mine (found by Cloud, verified by probe):
  //  1. area was read as global `querySelectorAll('.row .tag')[2]`. Each row has TWO
  //     .tag elements (area, craving), so index 2 is row **0**'s area, not row 2's.
  //     Read row-scoped: `.row >> nth=2` then that row's own `.tag`.
  //  2. it read `written[0]`. This page SHARES a context with earlier blocks, so a
  //     pre-existing favourite occupies index 0 and the assertion compared row 2
  //     against an unrelated record. Fixes: give this block its OWN context (the
  //     context is the storage boundary, not the page), and locate the record by the
  //     id this block just created rather than by array position.
  const shapeCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const shape = await shapeCtx.newPage();
  await shape.goto(URL, { waitUntil: 'load' });
  await shape.waitForTimeout(900);
  await shape.click('#dirbtn');
  await shape.waitForTimeout(500);
  const row2 = await shape.evaluate(() => {
    const r = document.querySelectorAll('.row')[2];
    return { name: r.querySelector('.nm').textContent.trim(), area: r.querySelector('.tag').textContent.trim() };
  });
  await shape.evaluate(() => localStorage.removeItem('mw_favs'));
  const preShape = await shape.evaluate(() => localStorage.getItem('mw_favs'));
  await shape.click('.row >> nth=2');
  await shape.waitForTimeout(300);
  await shape.click('#modal #mfav');
  await shape.waitForTimeout(400);
  const written = await shape.evaluate(() => { try { return JSON.parse(localStorage.getItem('mw_favs') || '[]'); } catch (e) { return 'unparseable'; } });
  const wantedId = row2.area + '|' + row2.name;
  const rec = Array.isArray(written) ? written.find((x) => x && typeof x === 'object' && x.id === wantedId) : null;
  check('favourites: the store is empty before this save (no cross-block contamination)',
    preShape === null && Array.isArray(written) && written.length === 1);
  check('favourites: a save writes the approved record shape {id,name,area} (not a bare id string)',
    !!rec && typeof rec.id === 'string' && rec.name === row2.name && rec.area === row2.area && rec.id === wantedId);
  await shapeCtx.close();

  // Migrated bare-ID save must render a card with a real, correct name AND area.
  const mig = await ctx.newPage();
  const migErrs = [];
  mig.on('pageerror', (e) => migErrs.push(String(e).split('\n')[0]));
  await mig.addInitScript(() => localStorage.setItem('mw_favs', JSON.stringify(['Putrajaya|AFN Cafe & Restaurant'])));
  await mig.goto(URL, { waitUntil: 'load' });
  await mig.waitForTimeout(900);
  await mig.click('#dirbtn');
  await mig.waitForTimeout(500);
  const migCtl = mig.locator(FAV_CTL).filter({ hasText: /kegemaran|favourite/i }).first();
  const migCtlExists = (await migCtl.count()) > 0;
  if (migCtlExists) await migCtl.click();
  await mig.waitForTimeout(400);
  if (migCtlExists) {
    const migRows = await mig.locator('.row').count();
    const migName = migRows ? (await mig.textContent('.row .nm')).trim() : '';
    const migArea = migRows ? (await mig.textContent('.row .tag')).trim() : '';
    check('favourites: a migrated bare-ID save renders a card with a visible, correct name',
      migRows === 1 && migName === 'AFN Cafe & Restaurant');
    check('favourites: a migrated bare-ID save renders the area on the card',
      migRows === 1 && migArea === 'Putrajaya');
    // And the migration must have upgraded it in storage to the approved shape.
    const migStore = await mig.evaluate(() => { try { return JSON.parse(localStorage.getItem('mw_favs') || '[]'); } catch (e) { return 'unparseable'; } });
    const m0 = Array.isArray(migStore) ? migStore[0] : null;
    check('favourites: a migrated bare-ID save is upgraded in storage to the approved shape',
      !!m0 && typeof m0 === 'object' && m0.id === 'Putrajaya|AFN Cafe & Restaurant' && m0.name === 'AFN Cafe & Restaurant' && m0.area === 'Putrajaya');
  } else {
    check('favourites: a migrated bare-ID save renders a card with a visible, correct name', false);
    check('favourites: a migrated bare-ID save renders the area on the card', false);
    check('favourites: a migrated bare-ID save is upgraded in storage to the approved shape', false);
  }
  check('favourites: migrated save load throws nothing', migErrs.length === 0);
  await mig.close();

  // Noctis's call: a favourite card shows no distance at all — omitted, not a "—"
  // placeholder. Two assertions, because one is not enough to hold the rule:
  //   (a) no .dist element in the favourite card
  //   (b) no distance-shaped TEXT either (km / m / "—"), which is what catches the
  //       placeholder case a missing-element check would pass.
  const dist = await ctx.newPage();
  await dist.addInitScript(GEO_STUB);
  await dist.addInitScript(() => localStorage.setItem('mw_favs', JSON.stringify(['Putrajaya|AFN Cafe & Restaurant'])));
  await dist.goto(URL, { waitUntil: 'load' });
  await dist.waitForTimeout(900);
  // turn location on so every non-favourite row WOULD show a distance
  await dist.click('#locbtn');
  await dist.waitForTimeout(800);
  await dist.click('#dirbtn');
  await dist.waitForTimeout(600);
  const distCtl = dist.locator(FAV_CTL).filter({ hasText: /kegemaran|favourite/i }).first();
  const distCtlExists = (await distCtl.count()) > 0;
  if (distCtlExists) await distCtl.click();
  await dist.waitForTimeout(500);
  const cfg = await dist.evaluate(() => {
    const row = document.querySelector('.row');
    if (!row) return { hasRow: false };
    const meta = row.querySelector('.meta') || row;
    const txt = (meta.textContent || '').replace(/\s+/g, ' ');
    return {
      hasRow: true,
      distEls: row.querySelectorAll('.dist').length,
      metaText: txt.trim(),
      distShaped: /(\d[\d.]*\s*(km|m)\b)/.test(txt),
      placeholder: /(^|[\s|·])—([\s|·]|$)/.test(txt),
    };
  });
  check('favourites: a favourite card renders no distance element',
    distCtlExists && cfg.hasRow && cfg.distEls === 0);
  check('favourites: a favourite card renders no distance text or placeholder (no "—", no "km")',
    distCtlExists && cfg.hasRow && !cfg.distShaped && !cfg.placeholder);
  await dist.close();

  // Noctis's honesty rule: never show a save as successful when the write failed.
  // With mw_favs writes throwing (blocked storage / quota), the in-memory array
  // still mutates, so isFav() returns true and the UI would render success for a
  // save that dies on reload. Replaces the row-heart half of this check once the
  // heart is removed — after removal the modal is the only save surface, and this
  // asserts on #mfav, which stays.
  const blocked = await ctx.newPage();
  const blockedErrs = [];
  blocked.on('pageerror', (e) => blockedErrs.push(String(e).split('\n')[0]));
  await blocked.addInitScript(() => {
    const proto = Object.getPrototypeOf(window.localStorage);
    const g = proto.getItem;
    const s = proto.setItem;
    proto.getItem = function (k) { if (k === 'mw_favs') throw new DOMException('denied', 'SecurityError'); return g.call(this, k); };
    proto.setItem = function (k, v) { if (k === 'mw_favs') throw new DOMException('quota', 'QuotaExceededError'); return s.call(this, k, v); };
  });
  await blocked.goto(URL, { waitUntil: 'load' });
  await blocked.waitForTimeout(1000);
  await blocked.click('#dirbtn');
  await blocked.waitForTimeout(500);
  await blocked.click('.row >> nth=0');
  await blocked.waitForTimeout(350);
  const savedLabel = /saved|disimpan|❤/i;
  const beforeBlocked = (await blocked.textContent('#modal #mfav')).trim();
  await blocked.click('#modal #mfav');
  await blocked.waitForTimeout(500);
  const afterBlocked = (await blocked.textContent('#modal #mfav')).trim();
  check('favourites: a save that cannot be persisted is not shown as successful',
    !savedLabel.test(beforeBlocked) && !savedLabel.test(afterBlocked));
  check('favourites: a blocked-storage save attempt throws nothing', blockedErrs.length === 0);
  await blocked.close();

  // Row-heart removal must be complete: no button, no CSS hook, no stranded guard.
  const heartGone = await page.evaluate(() => {
    const inDom = document.querySelectorAll('.fav, .mw-heart, [data-fav], .row button, .row [data-fav]').length;
    let inCss = 0;
    for (const sheet of Array.from(document.styleSheets)) {
      let rules = [];
      try { rules = Array.from(sheet.cssRules); } catch (e) { continue; }
      for (const r of rules) if (r.selectorText && /\.fav\b|\.mw-heart\b/.test(r.selectorText)) inCss++;
    }
    return { inDom, inCss };
  });
  check('favourites: no row-heart DOM remains (no .fav / [data-fav] buttons)', heartGone.inDom === 0);
  check('favourites: no row-heart CSS rules remain', heartGone.inCss === 0);

  await ctx.close(); await ctx.close();

  // Row click must still open the modal after the heart + its guard are removed.
  // This is the assertion that catches a half-removal: drop the DOM but leave the
  // line-535 closest('.fav') guard, or the stopPropagation, and row taps die.
  const rcctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const rc = await rcctx.newPage();
  await rc.addInitScript(GEO_STUB);
  await rc.goto(URL, { waitUntil: 'load' });
  await rc.waitForTimeout(900);
  await rc.click('#dirbtn');
  await rc.waitForTimeout(500);
  await rc.click('.row >> nth=2');
  await rc.waitForTimeout(400);
  check('favourites: row click still opens the detail modal after heart removal',
    (await rc.locator('#modalbg:visible').count()) === 1);
  await rcctx.close();

  // ---------- Mobile ----------
  const mctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true, hasTouch: true,
    deviceScaleFactor: 2,
  });
  const mpage = await mctx.newPage();
  await mpage.addInitScript(GEO_STUB);
  await mpage.goto(URL, { waitUntil: 'load' });
  await mpage.waitForTimeout(1200);
  const overflow = await mpage.evaluate(() => document.documentElement.scrollWidth > 390);
  check('mobile 390px: no horizontal overflow', !overflow);
  check('mobile: bottom action bar visible', (await mpage.locator('#decide:visible').count()) === 1);
  const tap = await mpage.locator('.mitem >> nth=0').boundingBox();
  check('mobile: menu rows are tappable (>=40px tall)', !!tap && tap.height >= 40);
  check('mobile: PWA manifest linked', (await mpage.getAttribute('link[rel="manifest"]', 'href')) === 'manifest.webmanifest');

  await ctx.close(); await mctx.close();
} finally {
  await browser.close();
}

// ---------- static checks (no browser needed) ----------
// The dialable-phone rule exists in two places by necessity (the bypass logic in
// the pipeline, the render-time decision in the app). They must stay character-
// identical, so this asserts the literal in index.html matches rules.mjs — if
// one is edited and the other is not, the smoke suite fails instead of letting
// the tel: links disagree with what the pipeline actually shipped.
try {
  const rules = await fs.promises.readFile(path.join(root, 'scripts', 'lib', 'rules.mjs'), 'utf8');
  const htmlSrc = await fs.promises.readFile(path.join(root, 'index.html'), 'utf8');
  const dialInRules = rules.match(/export const DIAL_RE = (\/[^\n]+\/);/)?.[1];
  const dialInHtml = htmlSrc.match(/const dialable = p => (\/[^\n]+\/)\.test/)?.[1];
  check('phone rule in index.html matches scripts/lib/rules.mjs', !!dialInRules && !!dialInHtml && dialInRules === dialInHtml);

  // Raw `<` in the injected PLACES JSON breaks out of the inline <script> it is
  // written into: `</script>` closes the element and whatever follows is painted
  // into the DOM as markup, NOT parsed as JS — the app's esc() helper never
  // runs. inject() escapes it as \u003c; this asserts that stays true.
  const placesLine = htmlSrc.match(/const PLACES = (.+)/)?.[1];
  check('injected PLACES JSON has no raw `<` (inline script break-out)',
    !!placesLine && placesLine.startsWith('[') && placesLine.slice(0, -1).indexOf('<') === -1);

  // The CSP's script hash travels with the HTML in a <meta> tag and is
  // recomputed by refresh-data.mjs every run. If someone hand-edits the inline
  // <script> between refreshes the hash goes stale and CSP blocks ALL inline
  // scripts — the whole page dead-parses. Assert the on-disk script still
  // hashes to the value in the policy; the browser normalises \r\n to \n before
  // hashing (HTML input preprocessor), so do the same here.
  const csp = htmlSrc.match(/http-equiv="Content-Security-Policy" content="([^"]*)"/)?.[1];
  const scriptLf = htmlSrc.replace(/\r\n/g, '\n').match(/<script(?![^>]*\bsrc)[^>]*>([\s\S]*?)<\/script>/)?.[1];
  const onDiskHash = scriptLf ? crypto.createHash('sha256').update(scriptLf, 'utf8').digest('base64') : null;
  check('inline script hash still matches the shipped CSP',
    !!csp && !!onDiskHash && csp.includes(`'sha256-${onDiskHash}'`));
} catch (e) {
  check('static drift/escape checks could not run (read error)', false);
}

const failed = results.filter(r => !r.ok);
console.log('\n' + '='.repeat(50));
console.log(`SMOKE RESULT: ${results.length - failed.length}/${results.length} passed` + (failed.length ? ' ❌' : ' ✅'));
if (failed.length) { console.log('Failed:'); failed.forEach(f => console.log('  - ' + f.name)); process.exit(1); }
