# Session 2 status — v1 build complete

**Date:** 2026-04-26 evening
**Goal:** Working app by tomorrow morning.

## What you can do right now

```bash
cd D:\repos\avenues\avenues
pnpm dev
```

Open http://localhost:5173. You should see:

- Top primary verdict block with score 0–100, headline, telemetry strip
- Locations grid (HOME = Bay Ridge, OFFICE = Midtown placeholder, both seeded on first run)
- Commute windows (today morning/evening or tomorrow morning, projected)
- 18-hour forecast strip with rainfall bars
- Ride log (empty until you log one)
- Add Location modal via the dashed "+ ADD LOCATION" button

Edits persist in localStorage. Hard reload to test seeding behavior (clear `avenues:locations` in DevTools → Application).

## What's built

```
src/
├── main.ts                  bootstrap, state, render, event delegation, clock
├── data/openmeteo.ts        fetchOpenMeteo + shapeHourly + WeatherHour
├── model/
│   ├── coefficients.ts      all tunable hyperparameters
│   ├── drying.ts            evaluate(), factor functions
│   ├── score.ts             score() → {score, band, headline, body, reasons}
│   └── project.ts           projectForward() + nextCommuteWindows()
├── storage/
│   ├── types.ts             Location, RideLogEntry, ScoreBand
│   ├── persistence.ts       localStorage impl behind PersistenceLayer
│   └── defaults.ts          seed locations
└── ui/
    ├── styles.css           full palette/layout ported from v0
    ├── format.ts            escape, fmtTime, makeLocationId, ...
    ├── PrimaryVerdict.ts    top score block + telemetry
    ├── LocationCard.ts      cards grid + add button
    ├── CommuteWindows.ts    morning/evening projection cards
    ├── ForecastStrip.ts     18-hour timeline
    ├── RideLog.ts           log table + add row
    └── LocationModal.ts     modal helpers (markup in index.html)
```

## Tests — 57 passing

- 13 drying-model (factor shape + 6 scenarios + edges)
- 9 score (band thresholds, penalty stacking, clamping)
- 17 Open-Meteo (URL params, HTTP error, shape windowing, fallback chain)
- 7 projection (projectForward, nextCommuteWindows scheduling)
- 4 storage (round-trip, corrupt JSON, log cap)
- 7 UI render-smoke (each component renders + XSS escape)

`pnpm test` runs them. `pnpm typecheck` is also clean.

## What's intentionally NOT in v1

These are deferred per `docs/first-claude-code-session.md` and CLAUDE.md:

- **MapLibre map.** Listed as v1 in CLAUDE.md but bottom of priority. The instrument-panel UI works without a map.
- **PWA** (manifest + service worker). v1.1.
- **Vercel deploy.** Needs `vercel link` (interactive login) and ideally a domain purchased first. Two-line task once you're ready: `vercel link && vercel --prod`.
- **Citi Bike layer, polyline routing, calibration mode.** v2+.

## Things to verify in the morning

1. **Open-Meteo loads.** If primary card shows "no weather data", the request failed — likely network or the lat/lon. DevTools network tab will tell you which.
2. **Clock + date update** in the top-right.
3. **Logo dot color** should match primary band.
4. **Add a third location** via the modal, see it render.
5. **Log a ride**, see it appear in the ride log.
6. **Switch primary** via the ★ button on a secondary card.
7. **Fonts.** Should be Archivo Narrow / JetBrains Mono / Instrument Serif. If they're system-ui that means Google Fonts didn't load (offline?); page still works, just looks generic.

## Known soft spots

- **Office coords are a placeholder** (40.7589, -73.9851 = Times Square area). Severud Associates is closer to 469 7th Ave (~40.7505, -73.9897). Edit via the modal once you confirm.
- **Cross-timezone correctness.** `shapeHourly` parses Open-Meteo `timezone=auto` time strings as runtime-local. Correct for NYC user querying NYC; needs a fix if you ever query a location outside your machine TZ.
- **CSS-only hover** to reveal EDIT/PRIMARY actions on a location card — won't work on touch devices. Will need a tap-to-show pattern eventually.
- **No loading state during refresh.** The 10-minute auto-refresh re-renders silently; add a subtle indicator if you want.

## Next sessions

In the order from `docs/first-claude-code-session.md`:

- **Session 7:** Vercel deploy preview. Buy `avenues.bike` (Namecheap or Cloudflare Registrar), `vercel link`, `vercel --prod`.
- **Session 8 (PWA):** add `public/manifest.webmanifest`, generate icons (192/512/maskable), add a service worker that caches the shell + last weather response per location.
- **Session 9 (MapLibre):** add `Map.ts`, Protomaps tiles, dark asphalt style in `public/map-style.json`.
