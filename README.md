# 🍚 Makan Where?

Decides where you're eating tonight — **Cyberjaya & Putrajaya** edition. A mobile-first single-file web app that blends OpenStreetMap data with curated local favourites.

## What it does

- 🏆 **Tonight's Menu** — top 5 picks, re-ranked live by your location
- 🎲 **Tolong pilih!** — a slot-machine picker that prints your dinner verdict as a **receipt** (order number, area, craving, price range, distance)
- 🎚️ **Tune the verdict** — optional criteria (area, craving, budget, max distance) before rolling
- 🗂️ **Food Directory** — mall-style A–Z directory of 176 eateries with search, filters and map
- 📍 **Near me** — geolocation with distance sorting and a "YOU ARE HERE" marker
- ❤ **Favourites** — saved locally, with a favourites-only mode

## Data

- 176 eateries from **OpenStreetMap** (Overpass API) across Cyberjaya & Putrajaya
- 12 curated top picks from published food reviews (ratings, price ranges, signature dishes)
- Prices marked *est.* are per-person estimates by venue type (jimat RM 5–12 / cafe RM 10–25 / sit-down RM 15–40)

## Run it

No build step, no dependencies. Open `index.html` in a browser, or serve it:

```bash
npx serve .
```

## Design

"Malam pasar" aesthetic: night-market neon signage (Anton), kopitiam tile motifs, hawker-stall amber on warm black, and verdicts printed as kopitiam receipts (IBM Plex Mono, zigzag tear edge). Mobile-first, 44px+ touch targets, respects `prefers-reduced-motion`.

---
*Data: © OpenStreetMap contributors. Prices and ratings are estimates/curated — always trust the Maps link.*
