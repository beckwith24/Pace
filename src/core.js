/* Pace core: dates, zones, readiness, plan generation, adaptation, data
   summaries and Intervals.icu workout text. Pure functions only. */

const Z_COLORS = ['#8FA3BF', '#4EA8FF', '#3FD08A', '#FF9F43', '#FF5A5F'];
const Z_NAMES = ['Recovery', 'Endurance', 'Tempo', 'Threshold', 'Max effort'];
const Z_USES = ['Warm-ups, cool-downs, recoveries', 'Most runs, rides and hikes live here',
  'Comfortably hard, used sparingly', 'Intervals, 3–8 min repeats', 'Short all-out efforts, rarely'];
const Z_PCT = [0.6, 0.7, 0.8, 0.9, 1.0]; // upper bound of each HR zone, % of max HR

// Power zones as % of FTP (Zwift workouts). Level 5 = anything above threshold.
const PZ_TOPS = [55, 75, 90, 105];
const PZ_NAMES = ['Recovery', 'Endurance', 'Tempo', 'Threshold', 'Above threshold'];
const PZ_RANGES = ['under 55% FTP', '56–75% FTP', '76–90% FTP', '91–105% FTP', 'over 105% FTP'];
function pzLevel(pct) { for (let i = 0; i < PZ_TOPS.length; i++) if (pct <= PZ_TOPS[i]) return i + 1; return 5; }

// Chart palette for sports, validated for the dark card surface (#171B22).
const SPORT_CATS = {
  run: { label: 'Run', color: '#3987e5', types: ['Run', 'TrailRun', 'VirtualRun', 'Treadmill'] },
  ride: { label: 'Ride', color: '#d95926', types: ['Ride', 'VirtualRide', 'GravelRide', 'MountainBikeRide', 'EBikeRide', 'EMountainBikeRide', 'Velomobile', 'Handcycle'] },
  strength: { label: 'Strength', color: '#199e70', types: ['WeightTraining', 'Workout', 'Crossfit', 'HighIntensityIntervalTraining', 'Yoga', 'Pilates'] },
  other: { label: 'Hike & other', color: '#9085e9', types: null },
};
function catOf(type) {
  for (const k of ['run', 'ride', 'strength']) if (SPORT_CATS[k].types.includes(type)) return k;
  return 'other';
}

const SESSION_TYPES = {
  rest: { label: 'Rest', sport: null, group: 'Rest' },
  easyRun: { label: 'Easy run', sport: 'Run', group: 'Run' },
  qualityRun: { label: 'Run workout', sport: 'Run', group: 'Run' },
  longRun: { label: 'Long run', sport: 'Run', group: 'Run' },
  tmEasy: { label: 'Treadmill easy run', sport: 'Run', treadmill: true, group: 'Treadmill' },
  tmQuality: { label: 'Treadmill hills', sport: 'Run', treadmill: true, group: 'Treadmill' },
  easyRide: { label: 'Endurance ride', sport: 'Ride', group: 'Ride' },
  longRide: { label: 'Long ride', sport: 'Ride', group: 'Ride' },
  zwiftEasy: { label: 'Zwift endurance', sport: 'VirtualRide', indoor: true, group: 'Zwift' },
  zwiftQuality: { label: 'Zwift workout', sport: 'VirtualRide', indoor: true, group: 'Zwift' },
  hike: { label: 'Hike', sport: 'Hike', group: 'Hike' },
  longHike: { label: 'Long hike', sport: 'Hike', group: 'Hike' },
  liftA: { label: 'Lower body + core', sport: 'WeightTraining', group: 'Strength' },
  liftB: { label: 'Upper body + core', sport: 'WeightTraining', group: 'Strength' },
  liftC: { label: 'Full body', sport: 'WeightTraining', group: 'Strength' },
  liftRun: { label: "Runner's strength", sport: 'WeightTraining', group: 'Strength' },
  core: { label: 'Core & mobility', sport: 'WeightTraining', group: 'Strength' },
};
const TYPE_GROUPS = ['Run', 'Treadmill', 'Ride', 'Zwift', 'Hike', 'Strength', 'Rest'];

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const DEFAULT_SCHEDULE = {
  mon: 'liftA', tue: 'easyRun', wed: 'easyRide', thu: 'liftB',
  fri: 'rest', sat: 'qualityRun', sun: 'longRide',
};

/* Strength routines. Each move: [name, reps, Free Exercise DB id, seconds per set]. */
const LIFTS = {
  liftA: { name: 'Lower body + core', focus: 'Lower body + core', moves: [
    ['Goblet squat', '10', 'Goblet_Squat'],
    ['Dumbbell Romanian deadlift', '10', 'Stiff-Legged_Dumbbell_Deadlift'],
    ['Reverse lunge', '8 each leg', 'Dumbbell_Rear_Lunge'],
    ['Single-leg glute bridge', '12 each leg', 'Single_Leg_Glute_Bridge'],
    ['Dead bug', '10 each side', 'Dead_Bug'],
  ] },
  liftB: { name: 'Upper body + core', focus: 'Upper body + core', moves: [
    ['Dumbbell floor press', '10', 'Dumbbell_Floor_Press'],
    ['One-arm dumbbell row', '10 each arm', 'One-Arm_Dumbbell_Row'],
    ['Standing overhead press', '8', 'Standing_Dumbbell_Press'],
    ['Dumbbell biceps curl', '12', 'Dumbbell_Bicep_Curl'],
    ['Side plank', '3 holds each side', 'Side_Bridge'],
  ] },
  liftC: { name: 'Full body', focus: 'Full body', moves: [
    ['Dumbbell squat', '10', 'Dumbbell_Squat'],
    ['Push-up', '8–12', 'Pushups'],
    ['Bent-over dumbbell row', '10', 'Bent_Over_Two-Dumbbell_Row'],
    ['Dumbbell step-up', '8 each leg', 'Dumbbell_Step_Ups'],
    ['Arnold press', '8', 'Arnold_Dumbbell_Press'],
    ['Plank', '30–45 sec hold', 'Plank', 90],
  ] },
  liftRun: { name: "Runner's strength", focus: 'Single-leg strength, calves, hips', moves: [
    ['Dumbbell split squat', '8 each leg', 'Split_Squat_with_Dumbbells'],
    ['Dumbbell Romanian deadlift', '10', 'Stiff-Legged_Dumbbell_Deadlift'],
    ['Standing calf raise', '15', 'Standing_Dumbbell_Calf_Raise', 90],
    ['Dumbbell step-up', '8 each leg', 'Dumbbell_Step_Ups'],
    ['Side plank', '30 sec each side', 'Side_Bridge', 90],
    ['Superman', '10 slow reps', 'Superman', 90],
  ] },
  core: { name: 'Core & mobility', focus: 'Core, hips and stretching', maxSets: 2, moves: [
    ['Plank', '30–45 sec hold', 'Plank', 75],
    ['Dead bug', '10 each side', 'Dead_Bug', 75],
    ['Side plank', '30 sec each side', 'Side_Bridge', 90],
    ['Russian twist', '12 each side', 'Russian_Twist', 75],
    ['Cat stretch', '8 slow reps', 'Cat_Stretch', 60],
    ['Kneeling hip flexor stretch', '30 sec each side', 'Kneeling_Hip_Flexor', 75],
    ["Child's pose", '45 sec', 'Childs_Pose', 60],
  ] },
  push: { name: 'Push day', focus: 'Chest, shoulders, triceps', moves: [
    ['Dumbbell floor press', '10', 'Dumbbell_Floor_Press'],
    ['Dumbbell shoulder press', '10', 'Dumbbell_Shoulder_Press'],
    ['Incline push-up', '10–15', 'Incline_Push-Up'],
    ['Side lateral raise', '12', 'Side_Lateral_Raise', 90],
    ['Dumbbell triceps kickback', '12 each arm', 'Tricep_Dumbbell_Kickback', 90],
  ] },
  pull: { name: 'Pull day', focus: 'Back, rear shoulders, biceps', moves: [
    ['Bent-over dumbbell row', '10', 'Bent_Over_Two-Dumbbell_Row'],
    ['One-arm dumbbell row', '10 each arm', 'One-Arm_Dumbbell_Row'],
    ['Reverse fly', '12', 'Reverse_Flyes', 90],
    ['Dumbbell shrug', '12', 'Dumbbell_Shrug', 90],
    ['Hammer curl', '10', 'Hammer_Curls', 90],
    ['Superman', '10 slow reps', 'Superman', 90],
  ] },
  legs: { name: 'Leg day', focus: 'Quads, hamstrings, glutes, calves', moves: [
    ['Goblet squat', '10', 'Goblet_Squat'],
    ['Dumbbell Romanian deadlift', '10', 'Stiff-Legged_Dumbbell_Deadlift'],
    ['Walking dumbbell lunge', '8 each leg', 'Dumbbell_Lunges'],
    ['Dumbbell step-up', '8 each leg', 'Dumbbell_Step_Ups'],
    ['Standing calf raise', '15', 'Standing_Dumbbell_Calf_Raise', 90],
    ['Glute bridge', '15', 'Butt_Lift_Bridge', 90],
  ] },
  stretch: { name: 'Post-run stretch', focus: 'Calves, hamstrings, quads, hips', maxSets: 1, moves: [
    ['Calf stretch', '30 sec each leg', 'Standing_Gastrocnemius_Calf_Stretch', 75],
    ['Hamstring stretch', '30 sec each leg', 'Hamstring_Stretch', 75],
    ['Quad stretch', '30 sec each leg', 'All_Fours_Quad_Stretch', 75],
    ['Kneeling hip flexor stretch', '30 sec each side', 'Kneeling_Hip_Flexor', 75],
    ['Lying glute stretch', '30 sec each side', 'Lying_Glute', 75],
    ["Child's pose", '45 sec', 'Childs_Pose', 60],
  ] },
  quick: { name: 'Quick 20-minute circuit', focus: 'Full body, minimal rest', maxSets: 3, moves: [
    ['Dumbbell squat', '12', 'Dumbbell_Squat', 70],
    ['Push-up', '10', 'Pushups', 70],
    ['Bent-over dumbbell row', '12', 'Bent_Over_Two-Dumbbell_Row', 70],
    ['Walking dumbbell lunge', '8 each leg', 'Dumbbell_Lunges', 70],
    ['Mountain climbers', '30 sec', 'Mountain_Climbers', 60],
  ] },
};

// Photos for these ship with the app; any other pick loads from the library.
const BUNDLED_EX = Array.from(new Set(Object.keys(LIFTS).reduce((a, k) => a.concat(LIFTS[k].moves.map(m => m[2])), [])));
function exImage(id, frame) {
  if (!id || !/^[A-Za-z0-9_\-()',.]+$/.test(id)) return '';
  return BUNDLED_EX.includes(id) ? 'img/ex/' + id + '/' + frame + '.jpg'
    : 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/' + encodeURIComponent(id) + '/' + frame + '.jpg';
}

const SPORT_MATCH = {
  Run: SPORT_CATS.run.types,
  Ride: SPORT_CATS.ride.types,
  VirtualRide: SPORT_CATS.ride.types,
  Hike: ['Hike', 'Walk'],
  WeightTraining: SPORT_CATS.strength.types,
};

/* ---------- dates (local, YYYY-MM-DD strings) ---------- */
function pad(n) { return String(n).padStart(2, '0'); }
function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function parseYmd(s) { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(s, n) { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); }
function daysBetween(a, b) { return Math.round((parseYmd(b) - parseYmd(a)) / 86400000); }
function mondayOf(s) { const d = parseYmd(s); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return ymd(d); }
function dayIndex(s) { return (parseYmd(s).getDay() + 6) % 7; } // 0 = Monday
function dateRange(from, to) { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; }

/* ---------- zones ---------- */
function estMaxHr(age) { return Math.round(220 - (Number(age) || 36)); }
function maxHrFor(settings) { return Number(settings.maxHr) > 0 ? Number(settings.maxHr) : estMaxHr(settings.age); }
function zoneTops(maxHr) { return Z_PCT.map(p => Math.round(maxHr * p)); }
function zoneRanges(maxHr) {
  const tops = zoneTops(maxHr);
  return tops.map((top, i) => ({ zone: i + 1, lo: i === 0 ? Math.round(maxHr * 0.5) : tops[i - 1], hi: top }));
}

/* ---------- formatting ---------- */
function fmtDur(sec) {
  sec = Math.round(sec || 0);
  const m = Math.floor(sec / 60), s = sec % 60;
  if (m >= 60) { const h = Math.floor(m / 60), mm = m % 60; return h + 'h' + (mm ? ' ' + mm + 'm' : ''); }
  return s ? m + ':' + pad(s) : m + ' min';
}
function fmtClock(sec) {
  sec = Math.round(sec || 0);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? h + ':' + pad(m) + ':' + pad(s) : m + ':' + pad(s);
}
function icuDur(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.round(sec % 60);
  return (h ? h + 'h' : '') + (m ? m + 'm' : '') + (s ? s + 's' : '') || '0s';
}
function zoneLabel(z) { if (!z) return ''; return z[0] === z[1] ? 'Zone ' + z[0] : 'Zone ' + z[0] + '–' + z[1]; }
function zoneBpm(z, maxHr) {
  if (!z) return '';
  const r = zoneRanges(maxHr);
  const lo = r[z[0] - 1].lo, hi = r[z[1] - 1].hi;
  return z[0] === 1 ? 'under ' + hi + ' bpm' : lo + '–' + hi + ' bpm';
}
function pwLabel(st) {
  if (!st.pw) return '';
  const [lo, hi] = st.pw;
  return (st.ramp ? 'Ramp ' + lo + '→' + hi : lo === hi ? lo : lo + '–' + hi) + '% FTP';
}
function pwWatts(st, ftp) {
  if (!st.pw || !(ftp > 0)) return '';
  const w = st.pw.map(p => Math.round(ftp * p / 100));
  return w[0] === w[1] ? w[0] + ' W' : w[0] + (st.ramp ? '→' : '–') + w[1] + ' W';
}
function rpmLabel(st) { return st.rpm ? (Array.isArray(st.rpm) ? st.rpm[0] + '–' + st.rpm[1] : st.rpm) + ' rpm' : ''; }
function targetLabel(st, maxHr, ftp) {
  if (st.pw) return [pwLabel(st), pwWatts(st, ftp), rpmLabel(st)].filter(Boolean).join(' · ');
  if (st.zone) return zoneLabel(st.zone) + ' · ' + zoneBpm(st.zone, maxHr);
  return '';
}
function round5(min) { return Math.max(5, Math.round(min / 5) * 5); }

/* ---------- session model ----------
   session = { date, type, sport, treadmill?, indoor?, name, summary, hard, focus?,
               blocks: [step | {repeat, label, steps}], notes: [], adjusted, edited }
   step = { label, sec, kind, zone?: [lo, hi] (HR zones), pw?: [lo, hi] (% FTP), ramp?, rpm?,
            move/sets/reps/ex (lifts) } */
function stepLevel(s) {
  if (s.pw) return pzLevel(Math.max(s.pw[0], s.pw[1]));
  if (s.zone) return s.zone[1];
  return 0;
}
function totalSec(blocks) {
  return (blocks || []).reduce((t, b) => t + (b.repeat ? b.repeat * b.steps.reduce((a, s) => a + s.sec, 0) : b.sec), 0);
}
function flatSteps(blocks) {
  const out = [];
  (blocks || []).forEach(b => {
    if (b.repeat) { for (let i = 0; i < b.repeat; i++) b.steps.forEach(s => out.push(s)); }
    else out.push(b);
  });
  return out;
}
// Each distinct step once (repeat blocks reuse the same step objects).
function eachStep(blocks, fn) { (blocks || []).forEach(b => (b.repeat ? b.steps : [b]).forEach(fn)); }
function zoneTime(blocks) {
  const t = [0, 0, 0, 0, 0];
  flatSteps(blocks).forEach(s => { const l = stepLevel(s); if (l) t[l - 1] += s.sec; });
  return t;
}
function usesPower(s) { return flatSteps(s.blocks).some(x => x.pw); }
function intensitySplit(blocks) {
  let easy = 0, hard = 0;
  flatSteps(blocks).forEach(s => { const l = stepLevel(s); if (!l) return; if (l >= 3) hard += s.sec; else easy += s.sec; });
  return { easy, hard };
}
function isHard(s) { return flatSteps(s.blocks).some(x => stepLevel(x) >= 4) || flatSteps(s.blocks).filter(x => stepLevel(x) >= 3).reduce((a, x) => a + x.sec, 0) >= 900; }
function kindOf(s) {
  if (!s || !s.sport) return 'rest';
  if (s.sport === 'VirtualRide') return 'zwift';
  if (s.treadmill) return 'treadmill';
  return { Run: 'run', Ride: 'ride', Hike: 'hike', WeightTraining: 'strength' }[s.sport] || 'run';
}
function fmtMin(sec) { return fmtDur(Math.round((sec || 0) / 60) * 60); }
function summarize(s) {
  if (!s.sport) return 'Optional 10 min mobility';
  const lifts = s.blocks.filter(b => b.kind === 'lift');
  if (s.sport === 'WeightTraining') {
    const sets = lifts.length ? Math.max.apply(null, lifts.map(b => b.sets)) : 0;
    return fmtMin(totalSec(s.blocks)) + ' · ' + lifts.length + ' exercises · ' + sets + ' sets';
  }
  const steps = flatSteps(s.blocks).filter(x => stepLevel(x));
  if (!steps.length) return fmtMin(totalSec(s.blocks));
  const top = Math.max.apply(null, steps.map(stepLevel));
  const hasRepeat = s.blocks.some(b => b.repeat);
  if (usesPower(s)) {
    const hi = Math.max.apply(null, steps.map(x => Math.max(x.pw ? x.pw[1] : 0, x.pw ? x.pw[0] : 0)));
    return fmtMin(totalSec(s.blocks)) + ' · ' + (top >= 3 ? 'up to ' + hi + '% FTP' + (hasRepeat ? ' repeats' : '') : 'Endurance power');
  }
  return fmtMin(totalSec(s.blocks)) + ' · ' + (top >= 3 ? 'Zone ' + top + (hasRepeat ? ' repeats' : ' work') : zoneLabel(steps[0].zone));
}
function liftLabel(b) { return b.move + ' ' + b.sets + '×' + b.reps; }
function clone(o) { return JSON.parse(JSON.stringify(o)); }

/* ---------- plan position ---------- */
function weekInfo(planStart, date) {
  const start = mondayOf(planStart || date);
  let w = Math.floor(daysBetween(start, date) / 7) + 1;
  if (w < 1) w = 1;
  const block = Math.floor((w - 1) / 12);
  const wib = ((w - 1) % 12) + 1;
  const deload = wib % 4 === 0;
  const phase = wib <= 4 ? 'Base building' : wib <= 8 ? 'Build' : 'Sharpen';
  return { week: w, block, wib, deload, phase, monday: addDays(start, (w - 1) * 7) };
}
function volumeFactor(wi) {
  const progressiveBefore = (wi.wib - 1) - Math.floor((wi.wib - 1) / 4);
  let f = Math.pow(1.08, progressiveBefore) * Math.pow(1.12, wi.block);
  if (wi.deload) f *= 0.7;
  return f;
}

/* ---------- step helpers ---------- */
const hr = (label, sec, zone, kind) => ({ label, sec, zone, kind: kind || 'easy' });
const pw = (label, sec, lo, hi, extra) => Object.assign({ label, sec, pw: [lo, hi == null ? lo : hi], kind: 'easy' }, extra || {});
function easyZone(settings) { return settings && settings.easyCeiling === false ? [2, 2] : [1, 2]; }

/* ---------- builders ---------- */
function buildEndurance(type, date, wi, factor, settings) {
  const base = { easyRun: 25, longRun: 40, easyRide: 40, longRide: 55, tmEasy: 25, hike: 50, longHike: 90, zwiftEasy: 40 }[type];
  const min = round5(base * factor);
  const t = SESSION_TYPES[type];
  const z = easyZone(settings);
  const notes = [];
  let blocks;
  if (type === 'zwiftEasy') {
    blocks = [pw('Warm up', 600, 50, 65, { ramp: true, kind: 'warm' }), pw('Endurance', Math.max(10, min - 15) * 60, 65, 72, { rpm: [85, 95] }), pw('Cool down', 300, 50, 50, { kind: 'cool' })];
    notes.push('Steady endurance in ERG mode. Keep cadence smooth, 85–95 rpm.');
  } else if (t.sport === 'Hike') {
    blocks = [hr('Hike', min * 60, [1, 2])];
    notes.push(type === 'longHike' ? 'Bring water and a snack for anything over 90 minutes. Climbs can push you into Zone 3; slow down to stay under it.' : 'Keep it conversational. On climbs, shorten your stride to stay in Zone 1–2.');
  } else {
    blocks = [hr(t.sport === 'Ride' ? 'Steady' : 'Easy', min * 60, z)];
    if (t.sport === 'Run' && wi.block === 0 && wi.wib <= 4) notes.push('Walk breaks are fine. Staying under the Zone 2 ceiling is the goal.');
    if (t.treadmill) notes.push('Set the treadmill to 1% incline to mimic outdoor effort.');
  }
  return { date, type, sport: t.sport, treadmill: !!t.treadmill, indoor: !!t.indoor, hard: false, name: t.label, blocks, notes };
}

function buildQualityRun(date, wi, settings, treadmill) {
  const z = easyZone(settings);
  const warm = hr('Warm up', 600, [2, 2], 'warm');
  const cool = hr('Cool down', 480, [1, 1], 'cool');
  let reps, work, rec, name;
  if (treadmill) {
    if (wi.deload || wi.wib <= 3) {
      reps = wi.deload ? 4 : [4, 5, 6][wi.wib - 1];
      work = hr('Incline 5 percent', 120, [3, 3], 'work'); rec = hr('Flat, easy', 120, z, 'rec');
      name = 'Treadmill hills · ' + reps + ' × 2 min';
    } else if (wi.wib <= 7) {
      reps = [4, 5, 6][wi.wib - 5];
      work = hr('Incline 6 percent', 180, [4, 4], 'work'); rec = hr('Flat, easy', 120, [1, 1], 'rec');
      name = 'Treadmill hills · ' + reps + ' × 3 min';
    } else {
      reps = [3, 4, 4][wi.wib - 9];
      work = hr('Incline 6 percent', 300, [4, 4], 'work'); rec = hr('Flat, easy', 180, [1, 1], 'rec');
      name = 'Treadmill hills · ' + reps + ' × 5 min';
    }
  } else if (wi.deload || wi.wib <= 3) {
    reps = wi.deload ? 4 : [3, 4, 5][wi.wib - 1];
    work = hr('Pick up', 60, [3, 3], 'work'); rec = hr('Easy', 120, z, 'rec');
    name = 'Run · ' + reps + ' × 1 min pickups';
  } else if (wi.wib <= 7) {
    reps = [3, 4, 5][wi.wib - 5];
    work = hr('Work', 180, [4, 4], 'work'); rec = hr('Recover', 120, [1, 1], 'rec');
    name = 'Run · ' + reps + ' × 3 min';
  } else {
    reps = [3, 3, 4][wi.wib - 9];
    work = hr('Work', 300, [4, 4], 'work'); rec = hr('Recover', 180, [1, 1], 'rec');
    name = 'Run · ' + reps + ' × 5 min';
  }
  reps = Math.min(6, reps + wi.block);
  return {
    date, type: treadmill ? 'tmQuality' : 'qualityRun', sport: 'Run', treadmill: !!treadmill, hard: true,
    name: name.replace(/\d+ ×/, reps + ' ×'),
    blocks: [warm, { repeat: reps, label: treadmill ? 'Hills' : 'Intervals', steps: [work, rec] }, cool],
    notes: treadmill ? ['Start it from the Treadmill activity on your watch. Change the incline at each step.'] : [],
  };
}

function buildZwiftQuality(date, wi) {
  let reps, workMin, lo, hi, restMin, name;
  if (wi.deload) { reps = 3; workMin = 5; lo = 85; hi = 88; restMin = 3; name = 'Zwift · easy sweet spot'; }
  else if (wi.wib <= 3) { reps = 3; workMin = [6, 8, 10][wi.wib - 1]; lo = 88; hi = 93; restMin = 3; name = 'Zwift · sweet spot'; }
  else if (wi.wib <= 7) { reps = [2, 2, 3][wi.wib - 5]; workMin = [12, 15, 12][wi.wib - 5]; lo = 88; hi = 93; restMin = 4; name = 'Zwift · sweet spot'; }
  else { reps = [3, 4, 2][wi.wib - 9]; workMin = [8, 8, 15][wi.wib - 9]; lo = 95; hi = 100; restMin = 4; name = 'Zwift · threshold'; }
  reps = Math.min(5, reps + wi.block);
  return {
    date, type: 'zwiftQuality', sport: 'VirtualRide', indoor: true, hard: true,
    name: name + ' ' + reps + ' × ' + workMin + ' min',
    blocks: [
      pw('Warm up', 600, 50, 70, { ramp: true, kind: 'warm' }),
      { repeat: reps, label: 'Intervals', steps: [pw('Work', workMin * 60, lo, hi, { kind: 'work', rpm: [85, 95] }), pw('Recover', restMin * 60, 50, 55, { kind: 'rec' })] },
      pw('Cool down', 480, 50, 50, { kind: 'cool' }),
    ],
    notes: ['Ride it in ERG mode in Zwift. Targets follow your Zwift FTP.'],
  };
}

function liftBlocks(key, sets) {
  const lift = LIFTS[key];
  const n = Math.min(sets, lift.maxSets || 6);
  const blocks = [{ label: 'Warm up: easy movement', sec: 300, zone: null, kind: 'warm' }];
  lift.moves.forEach(([move, reps, ex, perSet]) => {
    const b = { label: '', sec: n * (perSet || 120), zone: null, kind: 'lift', move, sets: n, reps, ex, perSet: perSet || 120 };
    b.label = liftLabel(b);
    blocks.push(b);
  });
  return blocks;
}
function buildLift(type, date, wi) {
  const sets = wi.deload ? 2 : (wi.block === 0 && wi.wib <= 2 ? 2 : 3);
  const lift = LIFTS[type];
  const notes = type === 'core' ? ['Move slowly and breathe. Stretches are holds, not reps.'] : ['When you hit every rep on every set, go up 5 lb next time.'];
  return { date, type, sport: 'WeightTraining', hard: false, name: lift.name, focus: lift.focus, blocks: liftBlocks(type, sets), notes };
}

function restSession(date) { return { date, type: 'rest', sport: null, hard: false, name: 'Rest', blocks: [], notes: [] }; }

function buildSession(type, date, settings, opts) {
  opts = opts || {};
  const wi = weekInfo(settings.planStart, date);
  let factor = volumeFactor(wi);
  if (opts.holdProgression && !wi.deload && wi.wib > 1) factor = volumeFactor(Object.assign({}, wi, { wib: wi.wib - 1, deload: (wi.wib - 1) % 4 === 0 }));
  let s;
  if (!type || !SESSION_TYPES[type] || type === 'rest') s = restSession(date);
  else if (type === 'qualityRun') s = buildQualityRun(date, wi, settings, false);
  else if (type === 'tmQuality') s = buildQualityRun(date, wi, settings, true);
  else if (type === 'zwiftQuality') s = buildZwiftQuality(date, wi);
  else if (LIFTS[type]) s = buildLift(type, date, wi);
  else s = buildEndurance(type, date, wi, factor, settings);
  s.summary = summarize(s);
  s.week = wi;
  s.adjusted = false;
  return s;
}

/* ---------- readiness ---------- */
function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; }
function sd(a) { const m = mean(a); return a.length > 1 ? Math.sqrt(a.reduce((t, x) => t + (x - m) * (x - m), 0) / (a.length - 1)) : null; }
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/* Score = 70 + HRV + resting HR + sleep + form effects, kept within 5–100.
   Every effect is reported so the Data tab can show the math. */
function readiness(wellness, today) {
  const rows = (wellness || []).filter(r => r && r.id && r.id <= today).sort((a, b) => a.id < b.id ? -1 : 1);
  if (!rows.length) return null;
  const last = rows[rows.length - 1];
  if (daysBetween(last.id, today) > 1) return null;
  const prior = rows.filter(r => r.id < last.id);
  const vals = (key, days) => prior.filter(r => daysBetween(r.id, last.id) <= days && r[key] != null && r[key] > 0).map(r => r[key]);

  let score = 70; const reasons = []; const metrics = {}; const comps = [];
  if (last.hrv) {
    const b7 = mean(vals('hrv', 7)), b28 = vals('hrv', 28), m28 = mean(b28);
    // Day-to-day HRV normally swings ~8%; floor the spread so a very steady
    // baseline doesn't turn a small dip into a big score drop.
    const s28 = m28 ? Math.max(sd(b28) || 0, m28 * 0.08) : null;
    metrics.hrv = { value: Math.round(last.hrv), vs7: b7 ? (last.hrv - b7) / b7 : null };
    let pts = 0, note = 'Needs 5+ nights of history (' + b28.length + ' so far)';
    if (m28 && s28 && b28.length >= 5) {
      const z = (last.hrv - m28) / s28;
      pts = clamp(z * 10, -25, 15);
      note = (z >= 0 ? '+' : '') + z.toFixed(1) + ' SD vs 28-day baseline';
      if (metrics.hrv.vs7 != null && Math.abs(metrics.hrv.vs7) >= 0.05) reasons.push('HRV ' + Math.round(Math.abs(metrics.hrv.vs7) * 100) + '% ' + (metrics.hrv.vs7 < 0 ? 'below' : 'above') + ' your 7-day average');
    }
    score += pts;
    comps.push({ key: 'hrv', label: 'HRV (overnight)', value: Math.round(last.hrv) + ' ms', base: m28 ? Math.round(m28) + ' ms' : '—', pts, note });
  }
  if (last.restingHR) {
    const b7 = mean(vals('restingHR', 7));
    metrics.rhr = { value: Math.round(last.restingHR), delta: b7 ? last.restingHR - b7 : null };
    let pts = 0, note = 'Needs at least one earlier day';
    if (b7) {
      const d = last.restingHR - b7;
      pts = -clamp(d * 3, -6, 20);
      note = (d >= 0 ? '+' : '') + d.toFixed(1) + ' bpm vs 7-day average';
      if (d >= 3) reasons.push('Resting HR ' + Math.round(d) + ' bpm above normal');
    }
    score += pts;
    comps.push({ key: 'rhr', label: 'Resting HR', value: Math.round(last.restingHR) + ' bpm', base: b7 ? b7.toFixed(0) + ' bpm' : '—', pts, note });
  }
  if (last.sleepSecs) {
    const h = last.sleepSecs / 3600;
    metrics.sleep = { value: h };
    let pts = 0;
    if (h < 6) { pts = -15; reasons.push('Short sleep (' + h.toFixed(1) + ' h)'); }
    else if (h < 7) pts = -5;
    else if (h >= 8) pts = 5;
    score += pts;
    const b7 = mean(vals('sleepSecs', 7));
    comps.push({ key: 'sleep', label: 'Sleep', value: fmtHours(h), base: b7 ? fmtHours(b7 / 3600) : '—', pts, note: 'Under 6 h −15 · 6–7 h −5 · 7–8 h 0 · 8 h+ +5' });
  }
  if (last.ctl != null && last.atl != null) {
    const form = last.ctl - last.atl;
    metrics.form = { value: Math.round(form), ctl: Math.round(last.ctl), atl: Math.round(last.atl) };
    let pts = 0;
    if (form < -25) { pts = -10; reasons.push('Fatigue is high relative to fitness'); }
    else if (form < -15) pts = -5;
    else if (form > 5) pts = 5;
    score += pts;
    comps.push({ key: 'form', label: 'Form (fitness − fatigue)', value: (form >= 0 ? '+' : '') + Math.round(form), base: 'CTL ' + Math.round(last.ctl) + ' / ATL ' + Math.round(last.atl), pts, note: 'Below −25 −10 · −25 to −15 −5 · above +5 +5' });
  }
  if (!metrics.hrv && !metrics.rhr && !metrics.sleep) return null;
  const raw = score;
  score = Math.round(clamp(score, 5, 100));
  const band = score >= 65 ? 'go' : score >= 55 ? 'trim' : score >= 40 ? 'easy' : 'rest';
  const headline = { go: 'Ready, go as planned', trim: 'A little off, hard work trimmed', easy: 'Take it easy today', rest: 'Rest and recover today' }[band];
  return { score, raw, band, headline, reasons, metrics, comps, date: last.id };
}
function fmtHours(h) { return Math.floor(h) + 'h ' + pad(Math.round((h % 1) * 60) % 60) + 'm'; }
function readinessSeries(wellness, dates) { return dates.map(d => { const r = readiness(wellness, d); return r && r.date === d ? r.score : null; }); }
function rolling(values, n) {
  return values.map((_, i) => {
    const win = values.slice(Math.max(0, i - n + 1), i + 1).filter(v => v != null);
    return win.length >= Math.min(3, n) ? win.reduce((a, b) => a + b, 0) / win.length : null;
  });
}

/* ---------- adaptation ---------- */
function easyVersion(s, settings, frac) {
  const total = totalSec(s.blocks) * (frac || 0.8);
  const min = round5(total / 60);
  if (s.sport === 'VirtualRide') return [pw('Warm up', 300, 50, 60, { ramp: true, kind: 'warm' }), pw('Endurance', Math.max(10, min - 10) * 60, 60, 70, { rpm: [85, 95] }), pw('Cool down', 300, 50, 50, { kind: 'cool' })];
  return [hr('Easy', min * 60, s.sport === 'Hike' ? [1, 2] : easyZone(settings))];
}

function adapt(session, r, settings) {
  if (!r || session.type === 'rest' || r.band === 'go') return session;
  const s = clone(session);
  const why = r.reasons.length ? r.reasons[0] : 'Readiness ' + r.score;
  const finish = () => { s.summary = summarize(s); s.adjusted = true; return s; };
  if (r.band === 'rest') {
    if (s.sport === 'WeightTraining') {
      return Object.assign(s, { type: 'rest', sport: null, name: 'Rest (was ' + session.name + ')', summary: 'Optional 10 min mobility', blocks: [], hard: false, adjusted: true,
        notes: [why + ', so strength moves to another day.'] });
    }
    if (s.sport === 'VirtualRide') {
      Object.assign(s, { name: 'Recovery spin', hard: false, blocks: [pw('Easy spin', 1200, 45, 55, { rpm: [85, 95] })], notes: [why + ', so today is an optional 20 min easy spin.'] });
      return finish();
    }
    const label = s.sport === 'Hike' ? 'Easy walk' : s.sport === 'Ride' ? 'Recovery spin' : 'Recovery walk or jog';
    Object.assign(s, { name: (s.treadmill ? 'Treadmill ' : '') + label, hard: false, blocks: [hr('Recovery', 1200, [1, 1])], notes: [why + ', so today is an optional 20 min in Zone 1.'] });
    return finish();
  }
  if (s.sport === 'WeightTraining') {
    if (r.band === 'easy') {
      s.blocks.forEach(b => { if (b.kind === 'lift' && b.sets > 2) { b.sets -= 1; b.sec = b.sets * (b.perSet || 120); b.label = liftLabel(b); } });
      s.notes.unshift(why + ', so one set comes off each exercise.');
      return finish();
    }
    return s;
  }
  if (s.hard) {
    const rep = s.blocks.find(b => b.repeat);
    if (r.band === 'trim' && rep && rep.repeat > 2) {
      const before = rep.repeat;
      rep.repeat -= 1;
      rep.steps[rep.steps.length - 1].sec += 60;
      s.name = s.name.replace(new RegExp('\\b' + before + ' ×'), rep.repeat + ' ×');
      s.notes.unshift(why + ', so we cut ' + before + ' repeats to ' + rep.repeat + ' and added a minute to each recovery.');
      return finish();
    }
    if (r.band === 'trim' && !rep) {
      eachStep(s.blocks, x => { if (stepLevel(x) >= 3) x.sec = Math.max(60, Math.round(x.sec * 0.75 / 30) * 30); });
      s.notes.unshift(why + ', so the hard part is 25% shorter.');
      return finish();
    }
    const label = s.sport === 'VirtualRide' ? 'Zwift endurance (swapped)' : (s.treadmill ? 'Treadmill easy run' : 'Easy run') + ' (swapped)';
    Object.assign(s, { name: label, hard: false, blocks: easyVersion(s, settings, 0.8),
      notes: [why + ', so the intervals became ' + (s.sport === 'VirtualRide' ? 'an easy endurance ride.' : 'an easy Zone 2 run.')] });
    return finish();
  }
  if (r.band === 'easy') {
    eachStep(s.blocks, x => { x.sec = x.sec >= 600 ? round5((x.sec / 60) * 0.8) * 60 : x.sec; });
    s.notes.unshift(why + ', so this is about 20% shorter.');
    return finish();
  }
  return s;
}

/* ---------- conversions (indoors / outdoors / easier) ---------- */
const HR_TO_PW = { 1: [45, 55], 2: [60, 70], 3: [76, 85], 4: [91, 100], 5: [106, 115] };
function toIndoor(s) {
  const o = clone(s);
  if (o.sport === 'Run' && !o.treadmill) {
    o.treadmill = true; o.name = 'Treadmill · ' + o.name.replace(/^Run · /, '');
    o.notes = ['Start it from the Treadmill activity on your watch. Set 1% incline for easy running.'].concat(o.notes || []);
  } else if (o.sport === 'Ride') {
    o.sport = 'VirtualRide'; o.indoor = true; o.name = 'Zwift · ' + o.name;
    const conv = st => { if (st.zone) { st.pw = HR_TO_PW[st.zone[1]].slice(); delete st.zone; } return st; };
    o.blocks.forEach(b => { if (b.repeat) b.steps.forEach(conv); else conv(b); });
    o.notes = ['Converted from heart rate zones to power for Zwift ERG mode.'].concat(o.notes || []);
  } else return null;
  o.summary = summarize(o);
  return o;
}
function toOutdoor(s, settings) {
  const o = clone(s);
  if (o.treadmill) { o.treadmill = false; o.name = o.name.replace(/^Treadmill · /, 'Run · ').replace(/^Treadmill /, ''); o.notes = (o.notes || []).filter(n => !/Treadmill|incline/.test(n)); }
  else if (o.sport === 'VirtualRide') {
    o.sport = 'Ride'; o.indoor = false; o.name = o.name.replace(/^Zwift · /, '').replace(/^Zwift /, '') || 'Ride';
    const conv = st => { if (st.pw) { const l = pzLevel(Math.max(st.pw[0], st.pw[1])); st.zone = l <= 2 ? easyZone(settings) : [l, l]; delete st.pw; delete st.ramp; delete st.rpm; } return st; };
    o.blocks.forEach(b => { if (b.repeat) b.steps.forEach(conv); else conv(b); });
    o.notes = ['Converted from power to heart rate zones for riding outside.'];
  } else return null;
  o.summary = summarize(o);
  return o;
}

/* ---------- completion ---------- */
function activitiesByDate(acts) {
  const m = {};
  (acts || []).forEach(a => { const d = (a.start_date_local || '').slice(0, 10); if (!d) return; (m[d] = m[d] || []).push(a.type); });
  return m;
}
function isDone(session, actMap) {
  if (!session.sport) return false;
  const types = actMap[session.date] || [];
  return types.some(t => (SPORT_MATCH[session.sport] || []).includes(t));
}
function weekCompletion(settings, monday, actMap, upTo) {
  let planned = 0, done = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDays(monday, i);
    if (d >= upTo) break;
    const type = (settings.schedule || DEFAULT_SCHEDULE)[DAY_KEYS[i]];
    if (!type || type === 'rest' || !SESSION_TYPES[type]) continue;
    planned++;
    if (isDone({ date: d, sport: SESSION_TYPES[type].sport }, actMap)) done++;
  }
  return { planned, done, rate: planned ? done / planned : 1 };
}

/* ---------- the plan ---------- */
function planDays(settings, from, n, ctx) {
  ctx = ctx || {};
  const today = ctx.today || from;
  const actMap = activitiesByDate(ctx.activities);
  const sched = settings.schedule || DEFAULT_SCHEDULE;
  const out = [];
  for (let i = 0; i < n; i++) {
    const date = addDays(from, i);
    const wi = weekInfo(settings.planStart, date);
    let hold = false;
    if (ctx.activities && wi.week > 1) {
      const prev = weekCompletion(settings, addDays(wi.monday, -7), actMap, wi.monday);
      hold = prev.planned > 0 && prev.rate < 0.6;
    }
    const ov = ctx.overrides && ctx.overrides[date];
    let s;
    if (ov) {
      s = Object.assign(clone(ov), { date, week: wi, held: false, adjusted: false, edited: true });
      s.blocks = s.blocks || [];
      s.hard = s.sport ? isHard(s) : false;
      s.summary = summarize(s);
      s.notes = (s.notes || []).filter(n => n.indexOf('You edited') !== 0 && n.indexOf('You changed') !== 0);
      s.notes.unshift('You changed this workout, so readiness changes leave it alone.');
    } else {
      s = buildSession(sched[DAY_KEYS[dayIndex(date)]], date, settings, { holdProgression: hold });
      s.held = hold;
      if (date === today) s = adapt(s, ctx.readiness, settings);
    }
    s.done = isDone(s, actMap);
    s.status = s.type === 'rest' || !s.sport ? 'rest' : s.done ? 'done' : date < today ? (ctx.activities ? 'missed' : 'past') : date === today ? 'today' : 'upcoming';
    out.push(s);
  }
  return out;
}

function planNotes(days) {
  const notes = [];
  days.forEach(d => { if (d.adjusted && d.notes[0]) notes.push({ tone: 'warn', text: DAY_SHORT[dayIndex(d.date)] + ': ' + d.notes[0] }); });
  const first = days[0];
  if (first && first.week.deload) notes.push({ tone: 'info', text: 'Recovery week: volume drops about 30% so the last three weeks sink in.' });
  else if (first && first.week.wib % 4 === 3) notes.push({ tone: 'info', text: 'Next week is a recovery week with about 30% less volume.' });
  if (days.some(d => d.held)) notes.push({ tone: 'warn', text: 'Last week was short on sessions, so volume holds instead of growing.' });
  else if (first && !first.week.deload && first.week.wib > 1) notes.push({ tone: 'good', text: 'Endurance time grows about 8% this week, under the 10% cap.' });
  const missed = days.filter(d => d.status === 'missed');
  if (missed.length) notes.push({ tone: 'info', text: missed.length + ' missed session' + (missed.length > 1 ? 's' : '') + ' this week. They are not stacked onto other days.' });
  return notes;
}

/* ---------- data summaries ---------- */
function weeklyVolume(acts, mondays) {
  const rows = mondays.map(m => ({ monday: m, run: 0, ride: 0, strength: 0, other: 0, count: 0 }));
  (acts || []).forEach(a => {
    const d = (a.start_date_local || '').slice(0, 10); if (!d) return;
    const m = mondayOf(d), row = rows.find(r => r.monday === m); if (!row) return;
    row[catOf(a.type)] += Number(a.moving_time || a.elapsed_time || 0);
    row.count++;
  });
  return rows;
}

/* ---------- Intervals.icu ---------- */
/* Step labels are free text, but Intervals.icu reads durations (10m, 30s),
   targets (70%, Z2, 220w) and repeat headers (4x) out of a line. Rewrite
   those tokens in words so a typed label can't change the workout. */
const UNIT_WORDS = { s: 'sec', sec: 'sec', secs: 'sec', m: 'min', min: 'min', mins: 'min', h: 'hr', hr: 'hr', hrs: 'hr', km: 'kilometers', mi: 'miles', mtr: 'meters', w: 'watts', rpm: 'cadence' };
function safeLabel(text) {
  return String(text || '').replace(/[\r\n]+/g, ' ')
    .replace(/(\d+(?:\.\d+)?)\s*(secs|sec|s|mins|min|m|hrs|hr|h|km|mi|mtr|w|rpm)\b/gi, (_, n, u) => n + ' ' + UNIT_WORDS[u.toLowerCase()])
    .replace(/(\d+)\s*%/g, '$1 percent')
    .replace(/\b[zZ](\d)\b/g, 'zone $1')
    .replace(/\b(\d+)\s*[xX]\b/g, '$1 times')
    .replace(/\bramp\b/gi, 'build')
    .replace(/^[\s-]+/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
function icuTarget(s) {
  if (s.pw) {
    const [lo, hi] = s.pw;
    let t = s.ramp ? 'ramp ' + lo + '%-' + hi + '%' : lo === hi ? lo + '%' : lo + '-' + hi + '%';
    if (s.rpm) t += ' ' + (Array.isArray(s.rpm) ? s.rpm[0] + '-' + s.rpm[1] : s.rpm) + 'rpm';
    return t;
  }
  if (s.zone) return s.zone[0] === s.zone[1] ? 'Z' + s.zone[0] + ' HR' : 'Z' + s.zone[0] + '-Z' + s.zone[1] + ' HR';
  return '';
}
function icuStep(s) {
  const label = s.kind === 'lift' ? safeLabel(s.move) + ' ' + s.sets + '×' + safeLabel(s.reps) : safeLabel(s.label);
  return ('- ' + label + ' ' + icuDur(s.sec) + ' ' + icuTarget(s)).replace(/\s{2,}/g, ' ').trim();
}
function icuText(session) {
  const parts = [];
  if (session.blocks.some(b => b.kind === 'lift')) parts.push((session.focus ? safeLabel(session.focus) + '. ' : '') + 'Each step is all sets of one exercise, rest included.\n');
  session.blocks.forEach(b => {
    if (b.repeat) parts.push('\n' + (safeLabel(b.label) || 'Repeat') + ' ' + b.repeat + 'x\n' + b.steps.map(icuStep).join('\n') + '\n');
    else parts.push(icuStep(b));
  });
  return parts.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
function externalId(date) { return 'pace-' + date; }
function toEvent(session) {
  const ev = {
    category: 'WORKOUT',
    start_date_local: session.date + 'T00:00:00',
    type: session.sport,
    name: String(session.name || 'Workout').slice(0, 80),
    description: icuText(session),
    external_id: externalId(session.date),
  };
  if (session.sport === 'VirtualRide' || session.indoor) ev.indoor = true; // Zwift only takes Indoor workouts
  return ev;
}

const PaceCore = {
  Z_COLORS, Z_NAMES, Z_USES, PZ_NAMES, PZ_RANGES, SPORT_CATS, SESSION_TYPES, TYPE_GROUPS, DAY_KEYS, DAY_SHORT, DEFAULT_SCHEDULE, LIFTS, BUNDLED_EX,
  ymd, parseYmd, addDays, daysBetween, mondayOf, dayIndex, dateRange,
  estMaxHr, maxHrFor, zoneTops, zoneRanges, pzLevel, fmtDur, fmtMin, fmtClock, fmtHours, icuDur, zoneLabel, zoneBpm, pwLabel, pwWatts, rpmLabel, targetLabel,
  exImage, catOf, kindOf, stepLevel, totalSec, flatSteps, eachStep, intensitySplit, zoneTime, usesPower, isHard, summarize, liftLabel, liftBlocks, safeLabel, clone,
  weekInfo, volumeFactor, buildSession, restSession, readiness, readinessSeries, rolling, mean, adapt, easyVersion, toIndoor, toOutdoor,
  activitiesByDate, isDone, planDays, planNotes, weeklyVolume, icuText, toEvent, externalId, hr, pw,
};
if (typeof module !== 'undefined') module.exports = PaceCore;
