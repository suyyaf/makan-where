// Makan Where? — browser smoke test
// Usage:
//   npm test                (tests local index.html via file://)
//   SMOKE_URL=<url> npm test  (tests a deployed URL)
// Exits non-zero if any check fails.
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

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
} catch (e) {
  check('phone rule drift check could not run (read error)', false);
}

const failed = results.filter(r => !r.ok);
console.log('\n' + '='.repeat(50));
console.log(`SMOKE RESULT: ${results.length - failed.length}/${results.length} passed` + (failed.length ? ' ❌' : ' ✅'));
if (failed.length) { console.log('Failed:'); failed.forEach(f => console.log('  - ' + f.name)); process.exit(1); }
