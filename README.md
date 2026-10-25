# Pace

A personal training app for iPhone + Garmin fenix 7. Pace plans running, cycling and dumbbell sessions, adjusts each day to your readiness (HRV, resting HR, sleep, fatigue from Intervals.icu), and sends heart-rate-zone workouts to the watch through Intervals.icu → Garmin Connect.

## Use it

1. Open the GitHub Pages address in Safari on your iPhone, tap Share → **Add to Home Screen**.
2. In Intervals.icu: connect Garmin and enable **Upload planned workouts**; create an API key under Settings → Developer Settings.
3. In Pace → Settings: paste the API key (it is stored only on your phone).

## What's in the app

- **Today**: readiness score with HRV, resting HR, sleep and form; today's workout with one-tap changes (easier, move to treadmill or Zwift, swap from the library, edit steps, rest).
- **Plan**: any week from 8 back to 6 ahead, planned time by sport, easy/hard split, done and missed sessions, and why the plan changed.
- **Library**: 46 ready-made workouts (run, treadmill, outdoor ride, Zwift power workouts, hikes, dumbbell strength, mobility) to schedule on any day or customize first.
- **Data**: everything pulled from Intervals.icu. Readiness math line by line, 7-day vs 4-week averages, charts (readiness, HRV with normal range, resting HR, sleep, fitness/fatigue, form, weekly time by sport), every activity with all its raw fields, a daily wellness log, and CSV export.
- **Sync status**: a spinner and status chip whenever Pace is syncing or sending, step-by-step send progress, and cached data so the app opens instantly and works offline.

Zwift workouts use power targets (% FTP) and are marked Indoor, which Zwift requires. Treadmill workouts are run workouts you start from the Treadmill activity on the watch.

## How the plan works

- 12-week blocks: three building weeks then a recovery week (about 30% less volume).
- Endurance time grows about 8% a week; it holds instead after a week with fewer than 60% of sessions done.
- Each morning readiness decides today's session: as planned (65+), fewer repeats with longer recoveries (55–64), an easy Zone 2 swap (40–54), or optional recovery (under 40).
- Every run and ride step carries a heart rate zone target, so the watch alerts at step changes and when you leave the zone.

## Exercise photos

Strength exercises, photos and how-to steps come from [Free Exercise DB](https://github.com/yuhonas/free-exercise-db), released into the public domain (Unlicense). `lib/exercises.json` is a slimmed copy (home-gym equipment only); photos for the plan's own moves are bundled in `img/ex/`, and others load from the Free Exercise DB repository.

## Develop

- `src/core.js`: plan, readiness, zones and Intervals.icu workout text (pure functions).
- `src/app.js`: UI and Intervals.icu API calls. `src/template.html`: markup and styles.
- `python3 build.py` inlines everything into `index.html`, the file GitHub Pages serves.
- `node test/core.test.js` checks plan logic; `python3 test/ui_check.py` renders the app with Playwright against a mocked API.
