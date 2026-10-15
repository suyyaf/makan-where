// Makan Where? — social card generator
// Renders icons/og-1200x630.png (the og:image / twitter:image target) by
// screenshotting a 1200x630 card with Playwright.
//
// Usage:
//   node scripts/make-og.mjs
//
// The place count is read from data/places.json, never hardcoded, so the card
// cannot drift out of sync with the dataset the site actually ships.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(root, 'icons', 'og-1200x630.png');
const URL = 'makan-where-steel.vercel.app';

const places = JSON.parse(fs.readFileSync(path.join(root, 'data', 'places.json'), 'utf8'));
const count = places.length;
const areas = [...new Set(places.map(p => p.area))].sort().join(' · ').toUpperCase();

const html = `<!doctype html>
<html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Space+Grotesk:wght@400;500;700&family=IBM+Plex+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { width:1200px; height:630px; overflow:hidden;
         background:radial-gradient(115% 85% at 50% -12%, #3a2b0e 0%, #1b1409 48%, #0f0c06 100%);
         color:#f2ead9; font-family:'Space Grotesk',sans-serif;
         display:flex; flex-direction:column; align-items:center; justify-content:center;
         position:relative; }
  /* kopitiam floor-tile strip, same as the app header */
  .tiles { position:absolute; top:0; left:0; right:0; height:22px;
           background:repeating-conic-gradient(#2a2312 0% 25%, #191408 0% 50%) 0 0/22px 22px; }
  .glow { position:absolute; width:760px; height:420px; border-radius:50%;
          background:radial-gradient(closest-side, rgba(255,180,58,.16), transparent 72%);
          top:-120px; left:50%; transform:translateX(-50%); }

  .neon { position:relative; font-family:'Anton',Impact,sans-serif; line-height:.88;
          letter-spacing:.012em; text-align:center; color:#ffddad;
          text-shadow:0 0 6px rgba(255,180,58,.55), 0 0 18px rgba(255,138,58,.34), 0 0 42px rgba(255,138,58,.18); }
  .neon .l1 { display:block; font-size:132px; }
  .neon .l2 { display:block; font-size:132px; color:#ffc861; }

  .tag { position:relative; margin-top:20px; font-family:'IBM Plex Mono',monospace;
         font-size:19px; letter-spacing:.30em; color:#b7a87f; text-transform:uppercase; }

  .receipt { position:relative; margin-top:34px; display:flex; align-items:stretch;
             background:#f6efdd; color:#2b241c; border-radius:14px;
             box-shadow:0 18px 44px rgba(0,0,0,.55); overflow:hidden; }
  .cell { padding:18px 30px; display:flex; flex-direction:column; align-items:center; justify-content:center; }
  .cell + .cell { border-left:2px dashed #b9ab8c; }
  .cell .n { font-family:'Anton',sans-serif; font-size:46px; line-height:1; color:#231a06; }
  .cell .k { font-family:'IBM Plex Mono',monospace; font-size:12px; letter-spacing:.22em;
             text-transform:uppercase; color:#6d6047; margin-top:7px; }
  .sep { width:2px; background:repeating-linear-gradient(#b9ab8c 0 7px, transparent 7px 14px); }

  .url { position:absolute; bottom:30px; font-family:'IBM Plex Mono',monospace;
         font-size:16px; letter-spacing:.20em; color:#8d7f5c; }
  .pill { position:absolute; top:44px; right:46px; display:flex; align-items:center; gap:9px;
          font-family:'IBM Plex Mono',monospace; font-size:13px; letter-spacing:.16em;
          color:#ffb43a; background:rgba(255,180,58,.10); border:1px solid rgba(255,180,58,.42);
          border-radius:999px; padding:9px 17px; text-transform:uppercase; }
  .pill i { width:7px; height:7px; border-radius:50%; background:#ffb43a; font-style:normal;
            box-shadow:0 0 10px rgba(255,180,58,.9); }
</style></head>
<body>
  <div class="tiles"></div>
  <div class="glow"></div>
  <div class="pill"><i></i>${areas}</div>
  <div class="neon">
    <span class="l1">MAKAN</span>
    <span class="l2">WHERE?</span>
  </div>
  <div class="tag">tak tahu nak makan mana?</div>
  <div class="receipt">
    <div class="cell"><div class="n">${count}</div><div class="k">Places</div></div>
    <div class="sep"></div>
    <div class="cell"><div class="n" style="font-size:34px;">JOM</div><div class="k">Makan tonight</div></div>
  </div>
  <div class="url">${URL}</div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(400); // let the neon glow settle / fonts swap in
await page.screenshot({ path: OUT, type: 'png' });
await browser.close();

console.log(`wrote ${path.relative(root, OUT)} (${count} places from data/places.json)`);
