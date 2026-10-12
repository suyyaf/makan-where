// Generate PWA icons by rendering the app's own design language (Playwright, already a dev dep).
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ICON_HTML = `<!DOCTYPE html><html><head><style>
@import url('https://fonts.googleapis.com/css2?family=Anton&display=swap');
* { margin:0; padding:0 }
body { width:512px; height:512px; background:#131009; display:flex; align-items:center; justify-content:center; }
.sq { width:512px; height:512px; background:radial-gradient(115% 115% at 30% 18%, #3a2a0c 0%, #131009 68%);
      display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; }
.bowl { font-size:210px; line-height:1; filter:drop-shadow(0 0 26px rgba(255,180,58,.55)); }
.txt { font-family:'Anton', Impact, sans-serif; font-size:84px; color:#ffddad; letter-spacing:.01em;
       text-shadow:0 0 8px rgba(255,180,58,.6), 0 0 24px rgba(255,138,58,.4); }
</style></head><body><div class="sq"><div class="bowl">🍚</div><div class="txt">MW?</div></div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
await page.setContent(ICON_HTML, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500); // font
for (const size of [192, 512]) {
  await page.setViewportSize({ width: size, height: size });
  await page.evaluate(`document.body.style.zoom = ${size / 512}`);
  await page.screenshot({ path: path.join(root, 'icons', `icon-${size}.png`), clip: { x: 0, y: 0, width: size, height: size } });
}
await browser.close();
console.log('icons written: icons/icon-192.png, icons/icon-512.png');
