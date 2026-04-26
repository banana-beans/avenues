# Optimal-conditions ("sweet spot") detection

The score model is a penalty stack from 100 — it tells you what's *wrong*. When
nothing's wrong, the score plateaus at 100 but the verdict copy doesn't
distinguish between "OK day" and "the day distance runners pray for."

The sweet-spot detector is a small additional gate on the verdict: when the
score lands in the `good` band AND the current weather sits inside an
empirical "feels-best" envelope, the headline upgrades.

## The envelopes

Defined in `src/model/coefficients.ts` as `SWEET_SPOT`:

### Run

| Variable | Range | Why |
|---|---|---|
| Air temp | 5–12°C (41–54°F) | Where world-record marathon paces cluster. Below 5°C, muscles stiffen; above 12°C, heat buildup begins. |
| Humidity | < 60% | Sweat evaporation is the body's primary heat-shedding mechanism. High humidity blocks it even at moderate temps. |
| Wind | < 15 kph | Headwinds slow pace; tailwinds give back less than they cost. Below 15 kph wind is mostly imperceptible during a run. |
| Cloud cover | 20–70% | Partial cloud diffuses sun (cools you) but isn't gloomy. Full sun adds radiative heat; full overcast often correlates with damp/heavy air. |
| Surface | dry | Slip risk + wet feet. |
| Precipitation | none | Rain is tolerable but never *optimal*. |

### Bike

| Variable | Range | Why |
|---|---|---|
| Air temp | 12–22°C (54–72°F) | Cyclists self-cool via airflow at speed, so tolerate ~5°C warmer than runners before performance suffers. |
| Humidity | < 65% | Same evaporation logic as run, but airflow dries sweat faster, so the threshold is more permissive. |
| Wind | < 18 kph | Wind affects cyclists asymmetrically (drag is quadratic in apparent wind speed) but well-tuned road riders cope below ~18 kph. |
| Surface | dry asphalt + dry paint | Painted lanes slick at any wet level — disqualifying. |
| Precipitation | none | |

## Sources / references

- **El Helou, N. et al. (2012).** *Impact of environmental parameters on
  marathon running performance.* PLOS ONE 7(5): e37407. Six major marathons
  over a decade; optimal performance temp 7–12°C across genders and elite
  pace groups.
- **Vihma, T. (2010).** *Effects of weather on the performance of marathon
  runners.* Int J Biometeorol 54: 297. Confirms drop-off at both ends of the
  temperature range.
- **Galloway, S. & Maughan, R. (1997).** *Effects of ambient temperature on
  the capacity to perform prolonged cycle exercise.* Med Sci Sports Exerc
  29(9). For cyclists: optimum ~11°C, performance halves by ~30°C.
- **NWS Heat Index categories.** Used directly for the run-mode `heatCaution
  / heatExtreme / heatDanger` penalty ladder in `RUN_PENALTY`. NWS thresholds
  are 27°C (caution), 32°C (extreme), 39°C (danger).

## What this is NOT

- Not a separate score. The 0-100 score is unchanged. Sweet-spot is a
  side-channel boolean (`ScoreResult.sweetSpot`) that callers can use to
  upgrade copy.
- Not a guarantee. The envelopes are rules of thumb. Personal optimum varies:
  some runners thrive at 0°C, some don't notice 25°C. The current envelopes
  are population-level defaults.
- Not back-fittable yet. When the calibration loop in `src/calibrate/backfit.ts`
  lands (v3), it'll tune the *penalty* coefficients. The sweet-spot envelope
  is hand-tuned and lives separately for now.

## Future tuning

If you log enough rides/runs with conditions snapshots and a "felt great"
flag, you can shift the envelopes to your personal optimum. The shape is the
same — six bounded ranges, AND-combined.
