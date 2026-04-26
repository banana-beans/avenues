# The drying model

This is the heart of avenues. It estimates whether NYC asphalt is currently
wet, based only on hourly weather data — no road sensors, no crowdsourced
input. This document explains what it does, why, and how to tune it.

## Goal

Given hourly weather observations and forecast, output:
1. Is the asphalt currently wet? (binary)
2. Are painted bike lane markings still slick? (binary, separate from #1)
3. How long until full dry-out, given current conditions?
4. Are puddles likely on low spots?

## Why this is non-trivial

Most weather apps tell you "is it raining now." That's the easy 5%. The hard
95% is the period *after* rain ends — when the road still has water on it
but no precipitation is falling. A cyclist who looks outside, sees no rain,
and rides on a slick painted lane has a much worse time than one who waited
two hours.

Wallman & Åström (Swedish Road Institute, 2001) and the Penman-Monteith
evaporation equation are the gold standard for pavement drying. Both are
overkill for our purposes and require inputs Open-Meteo doesn't surface
cleanly (e.g. solar radiation flux, road surface temperature). We use a
pragmatic empirical model grounded in the same physics.

## The model

### Surface water accumulator

We maintain a "surface water" variable in millimeters. We walk hourly weather
observations from 24 hours ago to now. For each hour:

```
if rain_mm >= TRACE_THRESHOLD (0.15mm):
    surface_water += rain_mm
else:
    surface_water -= drying_rate(temp, wind, humidity, clouds, isDay)
    surface_water = max(0, surface_water)
```

If `surface_water > 0.05mm` at the end, the road is still wet.

### Drying rate

```
drying_rate = BASE_RATE
            * tempFactor(T)
            * windFactor(W)
            / (humidityFactor(H) * cloudFactor(C))
            * (isDay ? 1.0 : 0.55)
```

`BASE_RATE = 0.9` is the drying potential under standard conditions
(20°C, 50% RH, 10 kph wind, 0% clouds, daytime). Roughly: in those
conditions, ~1mm of surface water evaporates per hour.

The factors:

| Factor | Formula | Rationale |
|---|---|---|
| `tempFactor(T)` | `min(2.5, 0.3 + (T-5)/18)`; 0.05 if T≤0 | Linear in temp above freezing. Below freezing, drying effectively halts (water can refreeze). |
| `windFactor(W)` | `min(2.5, 0.5 + √W / 3.5)` | Square-root scaling; matches boundary-layer mass transfer theory. Wind disrupts the saturated air layer above the wet surface. |
| `humidityFactor(H)` | `max(0.4, 0.4 + (H/50)^1.4)` | Higher humidity slows evaporation. Power-law because the gradient between surface vapor pressure and ambient drives evaporation. |
| `cloudFactor(C)` | `1.0 + (C/100) * 1.0` | Clouds block solar radiation (the dominant energy input for pavement drying). |
| `isDay` | `1.0` day, `0.55` night | Captures solar input difference. Night drying still occurs via convective transfer but ~half as fast. |

These coefficients are empirical, not first-principles. They produce
plausible NYC-asphalt behavior across a range of test scenarios. They should
be re-calibrated against real ride observations once we have ~20+ logged
rides spanning varied conditions.

### Painted-surface accumulator

Run in parallel with the asphalt accumulator, but with rainfall multiplied by
`PAINT_MULTIPLIER = 1.7`. Drying rate is the same. Net effect: painted lanes
stay wet ~70% longer than surrounding asphalt.

Why 1.7? Three combined effects:

1. **Lower porosity.** Paint doesn't absorb water; it sits on top. So all
   precipitation stays on the surface as a film instead of partially soaking
   in. Asphalt has ~3–8% void content that holds some water, reducing the
   effective surface film.
2. **Lower surface texture.** Asphalt has macro-texture (the aggregate
   bumps) that aids water shedding via gravity. Paint is comparatively
   smooth, so water films are thicker for the same volume.
3. **Hydrophobic surface energy.** Most road paints are designed to repel
   water for visibility — but the same property means water beads up rather
   than wetting and spreading thin (which would dry faster).

1.7 is calibrated to qualitative observation. The literature supports
multipliers between 1.4–2.2 for typical highway paint. Tune this against
NYC-specific paint formulations once we can.

### Standing water (puddle) detector

Even if the running accumulator says "wet but draining," recent heavy rain
implies puddles persist on low spots that don't drain via the model's
implicit assumption of even surface drying.

```
puddle_likely = (last_1h_rain >= 5mm) OR (last_3h_rain >= 15mm)
```

5mm/h is roughly the threshold for visible runoff on flat NYC streets.
15mm/3h captures sustained light-to-moderate rain that fills depressions.

### Score function

Starts at 100, subtracts penalties:

| Condition | Penalty | Reason |
|---|---|---|
| Currently raining | -70 | Dominant; everything else is moot when actively wet. |
| Puddles likely | -25 | Splashy, soaks shoes, reduces visibility from spray. |
| Surface wet (post-rain) | -8 to -35 | Scales with residual water mm. |
| Painted lanes wet but asphalt dry | -12 | Most NYC bike lanes have green paint sections; this is the common "dry-looking street, still slick lane" failure mode. |
| Cold + wet (T < 5°C) | -15 | Compounds with wet penalty. Brake performance degrades, frame stiffens. |
| Freezing (T ≤ 0°C) | -20 | Hard ice risk, regardless of moisture. |
| Rain in next 3h | -8 to -25 | Forecast lookahead, scales with mm expected. |
| Wind 25–35 kph | -5 | Annoying but rideable. |
| Wind > 35 kph | -10 | Dangerous on bridges, cross-gusts on Hudson. |

Penalties stack. Final score is clamped to `[0, 100]`. Bands:

- **85–100**: green / "send it"
- **65–84**: yellow / "probably fine"
- **40–64**: orange / "not great"
- **0–39**: red / "skip it"

## What the model gets wrong

Documented limitations, in priority order to address:

1. **Single point per location.** A 12-mile commute crosses microclimates.
   v2.1 plans to sample weather along a polyline.
2. **No bridge-specific handling.** East River bridges have their own wind
   and surface dynamics (open-deck, salt spray, faster drying due to
   exposure but more wind risk).
3. **No solar radiation input.** Open-Meteo provides this; we don't use it
   yet. Direct solar would let us replace `cloudFactor` with something
   physically grounded.
4. **Bike-tire-agnostic.** A 23mm road tire on wet paint is worse than a 32mm
   commuter tire on the same surface. Currently assumes commuter tolerance.
5. **No snowmelt modeling.** Late-winter NYC has a specific failure mode of
   "looks dry, is actually meltwater on shaded blocks." Not handled.
6. **No salt residue.** Post-storm road salt creates a slip hazard even on
   nominally-dry surfaces. Hard to model without ground-truth.

## Calibration plan

The hyperparameters in `src/model/coefficients.ts` are guesses, not
measurements. The plan to improve:

1. Ship as-is, log every ride with conditions snapshot (already implemented
   in v0).
2. After each ride, prompt: "model said X, actually felt like Y?" Three
   options: drier than predicted / matched / wetter than predicted.
3. Once 20+ rides logged, run gradient descent on the coefficients against
   these labels. Even simple back-fitting should improve over hand-tuned
   defaults.
4. Future: integrate NYC DOT pavement condition data (some streets are
   surface-treated annually, others not for 15 years; surface age affects
   drying significantly).

## References

- Wallman, C-G. & Åström, H. (2001). *Friction Measurement Methods and the
  Correlation Between Road Friction and Traffic Safety.* Swedish National
  Road and Transport Research Institute (VTI).
- Penman, H. L. (1948). *Natural evaporation from open water, bare soil, and
  grass.* Proc. R. Soc. London A 193:120-145.
- Bahrani, N. & Sokolić, I. (2018). *Pavement surface drying time
  estimation.* Construction and Building Materials, 193, 153–162.
- ASTM E303 — Standard Test Method for Measuring Surface Frictional
  Properties Using the British Pendulum Tester.
