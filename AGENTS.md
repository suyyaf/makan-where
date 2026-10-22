# Makan Where? — agent context

Mobile-first food decider for **Cyberjaya & Putrajaya**. Live: https://makan-where-steel.vercel.app

## Hard constraints

- **Single-file app. No build step.** All app code lives in `index.html` (inline CSS + inline JS). Do not introduce a bundler, framework, or `src/` split.
- **`data/tops.json` is manually curated — never overwrite it.** `refresh-data.mjs` must not touch it.
- **`index.html` carries its own copy of the dialable-phone rule.** There is no build step to share it, so the rule is duplicated by necessity. `tests/smoke.mjs` fails if it drifts from `scripts/lib/rules.mjs`. If you change one, change both.
- **The CSP is pinned to a hash of the inline script.** Anything that alters the inline JS changes that hash. `refresh-data.mjs` recomputes it — if you edit the script by hand, the CSP must be regenerated or the page breaks.
- Do not hand-edit the place count. `refresh-data.mjs` keeps it in sync across **four** static meta tags.

## Commands

```bash
npm install && npx playwright install chromium   # one-time
npm test                        # 31 checks against local index.html
npm run test:prod               # same suite against the live URL
node scripts/refresh-data.mjs            # live Overpass pull + re-inject + OG + CSP hash
node scripts/refresh-data.mjs --offline  # re-inject last snapshot (data/places.json)
node scripts/make-og.mjs                 # regenerate icons/og-1200x630.png
```

Deploy: `npx vercel deploy --prod --yes`. Vercel auto-deploys from `main` on GitHub, so a push to `main` ships.

**Never use `makan-where.vercel.app`** — that is a stranger's unrelated app. The project's URL is `makan-where-steel.vercel.app`.

## Layout

```
index.html              # the entire app (inline CSS + JS)
sw.js                   # service worker
manifest.webmanifest    # PWA manifest
data/places.json        # generated OSM dataset — regenerated, not hand-edited
data/tops.json          # 12 curated top picks — MANUALLY MAINTAINED, never overwritten
scripts/refresh-data.mjs
scripts/make-og.mjs     # social card
scripts/make-icons.mjs
scripts/lib/rules.mjs   # shared junk-name / dialable-phone rules
tests/smoke.mjs         # 31 Playwright checks
vercel.json             # security headers
```

## Design system

"Malam pasar" aesthetic — do not drift from it:

- Night-market neon signage, hawker-stall amber on **warm black**
- **Anton** for display, **IBM Plex Mono** for verdicts
- Verdicts render as **kopitiam receipts** (zigzag tear edge, order number, area, craving, price, distance)
- Mobile-first, **44px+ touch targets**, keyboard-operable rows and modal
- Respects `prefers-reduced-motion`

## Copy

Malay-first and local: `Tolong pilih!`, `Jom makan`. The receipt phrasing is a feature — keep it. Don't sand off the local flavour for generic English.

## Data honesty

- Prices marked *est.* are per-person estimates by venue type (jimat RM 5–12 / cafe RM 10–25 / sit-down RM 15–40)
- Open-now/closed comes from OSM `opening_hours`; **unknown hours show nothing — we don't guess**
- Halal filter matches only explicit `diet:halal=yes`; **untagged ≠ not halal**
- 179 eateries at last refresh

If a change would make the app assert something it doesn't know, don't make it.

## Security

Headers live in `vercel.json` (`X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy: geolocation=(self)`). Strict CSP pinned to the inline-script hash — an external script cannot load and injected nodes cannot execute. `.vercelignore` keeps `tests/`, `scripts/`, `data/`, `package.json` out of the deployment.

## Git

Small, focused commits. Tests must pass before a change is called done (`npm test`). CI runs the smoke suite on every push and PR via `.github/workflows/smoke.yml`.

Do not commit or push without an explicit request.