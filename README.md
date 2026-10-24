# Pace

A personal training app for iPhone + Garmin fenix 7. Pace plans running, cycling and dumbbell sessions, adjusts each day to your readiness (HRV, resting HR, sleep, fatigue from Intervals.icu), and sends heart-rate-zone workouts to the watch through Intervals.icu → Garmin Connect.

## Use it

1. Open the GitHub Pages address in Safari on your iPhone, tap Share → **Add to Home Screen**.
2. In Intervals.icu: connect Garmin and enable **Upload planned workouts**; create an API key under Settings → Developer Settings.
3. In Pace → Settings: paste the API key (it is stored only on your phone).

## How the plan works

- 12-week blocks: three building weeks then a recovery week (about 30% less volume).
- Endurance time grows about 8% a week; it holds instead after a week with fewer than 60% of sessions done.
- Each morning readiness decides today's session: as planned (65+), fewer repeats with longer recoveries (55–64), an easy Zone 2 swap (40–54), or optional recovery (under 40).
- Every run and ride step carries a heart rate zone target, so the watch alerts at step changes and when you leave the zone.

## Develop

- `src/core.js`: plan, readiness, zones and Intervals.icu workout text (pure functions).
- `src/app.js`: UI and Intervals.icu API calls. `src/template.html`: markup and styles.
- `python3 build.py` inlines everything into `index.html`, the file GitHub Pages serves.
- `node test/core.test.js` checks plan logic; `python3 test/ui_check.py` renders the app with Playwright against a mocked API.
