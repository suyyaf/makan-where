# 🍚 Makan Where?

Decides where you're eating tonight — **Cyberjaya & Putrajaya** edition. A mobile-first single-file web app that blends OpenStreetMap data with curated local favourites.

## What it does

- 🏆 **Tonight's Menu** — top 5 picks, re-ranked live by your location
- 🎲 **Tolong pilih!** — a slot-machine picker that prints your dinner verdict as a **receipt** (order number, area, craving, price range, distance)
- 🎚️ **Tune the verdict** — optional criteria (area, craving, budget, max distance, open-now, halal) before rolling
- 📲 **Share the verdict** — one tap sends the receipt to WhatsApp/group chats (Web Share API, clipboard fallback)
- 🗂️ **Food Directory** — mall-style A–Z directory of the live OSM dataset (179 places at last refresh) with search, filters, open-now & halal filters, and map
- 📱 **PWA** — installable on your phone's home screen, works offline (service worker + manifest)

## Live

**https://makan-where-steel.vercel.app** (Vercel, auto-deploys from `main` on GitHub)

## Data

- 179 eateries from **OpenStreetMap** (Overpass API) across Cyberjaya & Putrajaya, after junk-name filtering (institutional canteens, OSM mistags, redacted phone numbers)
- 12 curated top picks from published food reviews (ratings, price ranges, signature dishes)
- Prices marked *est.* are per-person estimates by venue type (jimat RM 5–12 / cafe RM 10–25 / sit-down RM 15–40)
- 🟢 Open-now / 🔴 closed status computed from OSM `opening_hours` where tagged (14 places; unknown hours show nothing — we don't guess)
- 🕌 Halal filter matches places explicitly tagged `diet:halal=yes` in OSM (12 places); untagged ≠ not halal

## Refreshing the data

```bash
node scripts/refresh-data.mjs            # live pull from Overpass + re-inject into index.html
node scripts/refresh-data.mjs --offline  # re-inject the last snapshot (data/places.json)
node scripts/make-og.mjs                 # regenerate the 1200x630 social card (icons/og-1200x630.png)
```

`refresh-data.mjs` rewrites the dataset, keeps the place count in the four static meta tags in sync, regenerates the OG card via `make-og.mjs`, and recomputes the inline-script hash baked into the `<meta>` CSP. Shared rules (dialable-phone, junk names) live in `scripts/lib/rules.mjs`; `index.html` needs its own copy of the phone rule (no build step) and `tests/smoke.mjs` fails if the two drift.

Curated top picks live in `data/tops.json` (manually maintained).

## Testing

```bash
npm install && npx playwright install chromium
npm test                                      # 31 checks (browser + static drift checks) against local index.html
npm run test:prod                             # same suite against production
node scripts/make-og.mjs                      # regenerate icons/og-1200x630.png
```

Tests also run on CI (`.github/workflows/smoke.yml`) on every push and PR.

## Security posture

Security headers are set in `vercel.json` (`X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, HSTS preload, `Permissions-Policy: geolocation=(self)`). A strict CSP pinned to a hash of the inline script travels with the HTML — an external script cannot be loaded and an injected node cannot run code. `.vercelignore` keeps `tests/`, `scripts/`, `data/` and `package.json` out of the deployment.

## Design

"Malam pasar" aesthetic: night-market neon signage (Anton), kopitiam tile motifs, hawker-stall amber on warm black, and verdicts printed as kopitiam receipts (IBM Plex Mono, zigzag tear edge). Mobile-first, 44px+ touch targets, keyboard-operable rows and modal, respects `prefers-reduced-motion`.

---
*Data: © OpenStreetMap contributors. Prices and ratings are estimates/curated — always trust the Maps link.*
