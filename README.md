# 🍚 Makan Where?

Decides where you're eating tonight — **Cyberjaya & Putrajaya** edition. A mobile-first single-file web app that blends OpenStreetMap data with curated local favourites.

## What it does

- 🏆 **Tonight's Menu** — top 5 picks, re-ranked live by your location
- 🎲 **Tolong pilih!** — a slot-machine picker that prints your dinner verdict as a **receipt** (order number, area, craving, price range, distance)
- 🎚️ **Tune the verdict** — optional criteria (area, craving, budget, max distance, open-now, halal) before rolling
- 📲 **Share the verdict** — one tap sends the receipt to WhatsApp/group chats (Web Share API, clipboard fallback)
- 🗂️ **Food Directory** — mall-style A–Z directory of the live OSM dataset (185 places at last refresh) with search, filters, open-now & halal filters, and map
- 📱 **PWA** — installable on your phone's home screen, works offline (service worker + manifest)

## Live

**https://makan-where-steel.vercel.app** (Vercel, auto-deploys from `main` on GitHub)

## Data

- 176 eateries from **OpenStreetMap** (Overpass API) across Cyberjaya & Putrajaya
- 12 curated top picks from published food reviews (ratings, price ranges, signature dishes)
- Prices marked *est.* are per-person estimates by venue type (jimat RM 5–12 / cafe RM 10–25 / sit-down RM 15–40)
- 🟢 Open-now / 🔴 closed status computed from OSM `opening_hours` where tagged (~11 places; unknown hours show nothing — we don't guess)
- 🕌 Halal filter matches places explicitly tagged `diet:halal=yes` in OSM (~11 places); untagged ≠ not halal

## Refreshing the data

```bash
node scripts/refresh-data.mjs          # live pull from Overpass + re-inject into index.html
node scripts/refresh-data.mjs --offline  # re-inject the last snapshot (data/places.json)
node scripts/make-icons.mjs            # regenerate PWA icons
```

Curated top picks live in `data/tops.json` (manually maintained).

## Testing

```bash
npm install && npx playwright install chromium
npm test                                      # 27 browser checks against local index.html
SMOKE_URL=https://makan-where-steel.vercel.app npm test   # against production
```

## Design

"Malam pasar" aesthetic: night-market neon signage (Anton), kopitiam tile motifs, hawker-stall amber on warm black, and verdicts printed as kopitiam receipts (IBM Plex Mono, zigzag tear edge). Mobile-first, 44px+ touch targets, respects `prefers-reduced-motion`.

---
*Data: © OpenStreetMap contributors. Prices and ratings are estimates/curated — always trust the Maps link.*
