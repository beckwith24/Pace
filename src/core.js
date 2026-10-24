/* Pace core: dates, zones, readiness, plan generation, adaptation and
   Intervals.icu workout text. Pure functions only (no DOM, no network). */

const Z_COLORS = ['#8FA3BF', '#4EA8FF', '#3FD08A', '#FF9F43', '#FF5A5F'];
const Z_NAMES = ['Recovery', 'Endurance', 'Tempo', 'Threshold', 'Max effort'];
const Z_USES = ['Warm-ups, cool-downs, recoveries', 'Most runs and rides live here',
  'Comfortably hard, used sparingly', 'Intervals, 3–8 min repeats', 'Short all-out efforts, rarely'];
const Z_PCT = [0.6, 0.7, 0.8, 0.9, 1.0]; // upper bound of each zone, % of max HR

const SESSION_TYPES = {
  rest: { label: 'Rest', sport: null },
  easyRun: { label: 'Easy run', sport: 'Run' },
  qualityRun: { label: 'Run workout', sport: 'Run' },
  longRun: { label: 'Long run', sport: 'Run' },
  easyRide: { label: 'Endurance ride', sport: 'Ride' },
  longRide: { label: 'Long ride', sport: 'Ride' },
  liftA: { label: 'Dumbbell strength A', sport: 'WeightTraining' },
  liftB: { label: 'Dumbbell strength B', sport: 'WeightTraining' },
};

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const DEFAULT_SCHEDULE = {
  mon: 'liftA', tue: 'easyRun', wed: 'easyRide', thu: 'liftB',
  fri: 'rest', sat: 'qualityRun', sun: 'longRide',
};

const LIFTS = {
  liftA: {
    focus: 'Lower body + core',
    moves: [
      ['Goblet squat', '10', 'Goblet_Squat'],
      ['Dumbbell Romanian deadlift', '10', 'Stiff-Legged_Dumbbell_Deadlift'],
      ['Reverse lunge', '8 each leg', 'Dumbbell_Rear_Lunge'],
      ['Single-leg glute bridge', '12 each leg', 'Single_Leg_Glute_Bridge'],
      ['Dead bug', '10 each side', 'Dead_Bug'],
    ],
  },
  liftB: {
    focus: 'Upper body + core',
    moves: [
      ['Dumbbell floor press', '10', 'Dumbbell_Floor_Press'],
      ['One-arm dumbbell row', '10 each arm', 'One-Arm_Dumbbell_Row'],
      ['Standing overhead press', '8', 'Standing_Dumbbell_Press'],
      ['Dumbbell biceps curl', '12', 'Dumbbell_Bicep_Curl'],
      ['Side plank', '3 holds each side', 'Side_Bridge'],
    ],
  },
};

// Exercise photos come from free-exercise-db (public domain). Photos for the
// plan's own moves ship with the app; any other pick loads from the library.
const BUNDLED_EX = ['Goblet_Squat', 'Stiff-Legged_Dumbbell_Deadlift', 'Dumbbell_Rear_Lunge', 'Single_Leg_Glute_Bridge', 'Dead_Bug',
  'Dumbbell_Floor_Press', 'One-Arm_Dumbbell_Row', 'Standing_Dumbbell_Press', 'Dumbbell_Bicep_Curl', 'Side_Bridge'];
function exImage(id, frame) {
  if (!id || !/^[A-Za-z0-9_\-()',.]+$/.test(id)) return '';
  return BUNDLED_EX.includes(id) ? 'img/ex/' + id + '/' + frame + '.jpg'
    : 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/' + encodeURIComponent(id) + '/' + frame + '.jpg';
}

const SPORT_MATCH = {
  Run: ['Run', 'TrailRun', 'VirtualRun', 'Treadmill'],
  Ride: ['Ride', 'VirtualRide', 'GravelRide', 'MountainBikeRide', 'EBikeRide', 'EMountainBikeRide'],
  WeightTraining: ['WeightTraining', 'Workout', 'Crossfit', 'HighIntensityIntervalTraining'],
};

/* ---------- dates (local, YYYY-MM-DD strings) ---------- */
function pad(n) { return String(n).padStart(2, '0'); }
function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function parseYmd(s) { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(s, n) { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); }
function daysBetween(a, b) { return Math.round((parseYmd(b) - parseYmd(a)) / 86400000); }
function mondayOf(s) { const d = parseYmd(s); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return ymd(d); }
function dayIndex(s) { return (parseYmd(s).getDay() + 6) % 7; } // 0 = Monday

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
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  if (m >= 60) { const h = Math.floor(m / 60), mm = m % 60; return h + 'h' + (mm ? ' ' + mm + 'm' : ''); }
  return s ? m + ':' + pad(s) : m + ' min';
}
function fmtClock(sec) { const m = Math.floor(sec / 60), s = Math.round(sec % 60); return m + ':' + pad(s); }
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
function round5(min) { return Math.max(5, Math.round(min / 5) * 5); }

/* ---------- session model ----------
   session = { date, type, sport, name, summary, hard, blocks: [step | {repeat, label, steps}],
               notes: [], adjusted: bool, focus? }
   step = { label, sec, zone: [lo, hi] | null, kind } */
function totalSec(blocks) {
  return blocks.reduce((t, b) => t + (b.repeat ? b.repeat * b.steps.reduce((a, s) => a + s.sec, 0) : b.sec), 0);
}
function flatSteps(blocks) {
  const out = [];
  blocks.forEach(b => {
    if (b.repeat) { for (let i = 0; i < b.repeat; i++) b.steps.forEach(s => out.push(s)); }
    else out.push(b);
  });
  return out;
}
function zoneTime(blocks) {
  const t = [0, 0, 0, 0, 0];
  flatSteps(blocks).forEach(s => { if (s.zone) t[s.zone[1] - 1] += s.sec; });
  return t;
}
function summarize(s) {
  if (!s.sport) return 'Optional 10 min mobility';
  const lifts = s.blocks.filter(b => b.kind === 'lift');
  if (s.sport === 'WeightTraining') {
    const sets = lifts.length ? Math.max.apply(null, lifts.map(b => b.sets)) : 0;
    return (s.focus ? s.focus + ' · ' : '') + lifts.length + ' exercises · ' + sets + ' sets';
  }
  const steps = flatSteps(s.blocks).filter(x => x.zone);
  if (!steps.length) return fmtDur(totalSec(s.blocks));
  const top = Math.max.apply(null, steps.map(x => x.zone[1]));
  const hasRepeat = s.blocks.some(b => b.repeat);
  return fmtDur(totalSec(s.blocks)) + ' · ' + (top >= 3 ? 'Zone ' + top + (hasRepeat ? ' repeats' : ' work') : zoneLabel(steps[0].zone));
}
function liftLabel(b) { return b.move + ' ' + b.sets + '×' + b.reps; }
function intensitySplit(blocks) {
  let easy = 0, hard = 0;
  flatSteps(blocks).forEach(s => { if (!s.zone) return; if (s.zone[1] >= 3) hard += s.sec; else easy += s.sec; });
  return { easy, hard };
}

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

/* ---------- builders ---------- */
function easyZone(settings) { return settings.easyCeiling === false ? [2, 2] : [1, 2]; }

function buildEndurance(type, date, wi, factor, settings) {
  const base = { easyRun: 25, longRun: 40, easyRide: 40, longRide: 55 }[type];
  const min = round5(base * factor);
  const sport = SESSION_TYPES[type].sport;
  const z = easyZone(settings);
  const notes = [];
  if (sport === 'Run' && wi.block === 0 && wi.wib <= 4) notes.push('Walk breaks are fine. Staying under the Zone 2 ceiling is the goal.');
  return {
    date, type, sport, hard: false,
    name: SESSION_TYPES[type].label,
    summary: min + ' min · ' + zoneLabel(z),
    blocks: [{ label: sport === 'Ride' ? 'Steady' : 'Easy', sec: min * 60, zone: z, kind: 'easy' }],
    notes,
  };
}

function buildQualityRun(date, wi, settings) {
  const z = easyZone(settings);
  const warm = { label: 'Warm up', sec: 600, zone: [2, 2], kind: 'warm' };
  const cool = { label: 'Cool down', sec: 480, zone: [1, 1], kind: 'cool' };
  let reps, work, rec, name;
  if (wi.deload || wi.wib <= 3) {
    reps = wi.deload ? 4 : [3, 4, 5][wi.wib - 1];
    work = { label: 'Pick up', sec: 60, zone: [3, 3], kind: 'work' };
    rec = { label: 'Easy', sec: 120, zone: z, kind: 'rec' };
    name = 'Run · ' + reps + ' × 1 min pickups';
  } else if (wi.wib <= 7) {
    reps = [3, 4, 5][wi.wib - 5];
    work = { label: 'Work', sec: 180, zone: [4, 4], kind: 'work' };
    rec = { label: 'Recover', sec: 120, zone: [1, 1], kind: 'rec' };
    name = 'Run · ' + reps + ' × 3 min';
  } else {
    reps = [3, 3, 4][wi.wib - 9];
    work = { label: 'Work', sec: 300, zone: [4, 4], kind: 'work' };
    rec = { label: 'Recover', sec: 180, zone: [1, 1], kind: 'rec' };
    name = 'Run · ' + reps + ' × 5 min';
  }
  reps = Math.min(6, reps + wi.block);
  const s = {
    date, type: 'qualityRun', sport: 'Run', hard: true, name: name.replace(/\d+ ×/, reps + ' ×'),
    blocks: [warm, { repeat: reps, label: 'Intervals', steps: [work, rec] }, cool], notes: [],
  };
  s.summary = fmtDur(totalSec(s.blocks)) + ' · ' + zoneLabel(work.zone) + ' repeats';
  return s;
}

function buildLift(type, date, wi) {
  const sets = wi.deload ? 2 : (wi.block === 0 && wi.wib <= 2 ? 2 : 3);
  const lift = LIFTS[type];
  const blocks = [{ label: 'Warm up: easy movement', sec: 300, zone: null, kind: 'warm' }];
  lift.moves.forEach(([move, reps, ex]) => blocks.push({ label: move + ' ' + sets + '×' + reps, sec: sets * 120, zone: null, kind: 'lift', move, sets, reps, ex }));
  return {
    date, type, sport: 'WeightTraining', hard: false,
    name: SESSION_TYPES[type].label, focus: lift.focus,
    summary: lift.focus + ' · ' + sets + ' sets',
    blocks,
    notes: ['When you hit every rep on every set, go up 5 lb next time.'],
  };
}

function buildSession(type, date, settings, opts) {
  opts = opts || {};
  const wi = weekInfo(settings.planStart, date);
  let factor = volumeFactor(wi);
  if (opts.holdProgression && !wi.deload && wi.wib > 1) factor = volumeFactor(Object.assign({}, wi, { wib: wi.wib - 1, deload: (wi.wib - 1) % 4 === 0 }));
  let s;
  if (!type || type === 'rest') s = { date, type: 'rest', sport: null, hard: false, name: 'Rest', summary: 'Optional 10 min mobility', blocks: [], notes: [] };
  else if (type === 'qualityRun') s = buildQualityRun(date, wi, settings);
  else if (type === 'liftA' || type === 'liftB') s = buildLift(type, date, wi);
  else s = buildEndurance(type, date, wi, factor, settings);
  s.week = wi;
  s.adjusted = false;
  return s;
}

/* ---------- readiness ---------- */
function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; }
function sd(a) { const m = mean(a); return a.length > 1 ? Math.sqrt(a.reduce((t, x) => t + (x - m) * (x - m), 0) / (a.length - 1)) : null; }

function readiness(wellness, today) {
  const rows = (wellness || []).filter(r => r && r.id && r.id <= today).sort((a, b) => a.id < b.id ? -1 : 1);
  if (!rows.length) return null;
  const last = rows[rows.length - 1];
  if (daysBetween(last.id, today) > 1) return null;
  const prior = rows.filter(r => r.id < last.id);
  const vals = (key, days) => prior.filter(r => daysBetween(r.id, last.id) <= days && r[key] != null && r[key] > 0).map(r => r[key]);

  let score = 70; const reasons = []; const metrics = {};
  if (last.hrv) {
    const b7 = mean(vals('hrv', 7)), b28 = vals('hrv', 28), m28 = mean(b28);
    // Day-to-day HRV normally swings ~8%; floor the spread so a very steady
    // baseline doesn't turn a small dip into a big score drop.
    const s28 = m28 ? Math.max(sd(b28) || 0, m28 * 0.08) : null;
    metrics.hrv = { value: Math.round(last.hrv), vs7: b7 ? (last.hrv - b7) / b7 : null };
    if (m28 && s28 && b28.length >= 5) {
      const z = (last.hrv - m28) / s28;
      score += Math.max(-25, Math.min(15, z * 10));
      if (metrics.hrv.vs7 != null && Math.abs(metrics.hrv.vs7) >= 0.05) reasons.push('HRV ' + Math.round(Math.abs(metrics.hrv.vs7) * 100) + '% ' + (metrics.hrv.vs7 < 0 ? 'below' : 'above') + ' your 7-day average');
    }
  }
  if (last.restingHR) {
    const b7 = mean(vals('restingHR', 7));
    metrics.rhr = { value: Math.round(last.restingHR), delta: b7 ? last.restingHR - b7 : null };
    if (b7) {
      const d = last.restingHR - b7;
      score -= Math.max(-6, Math.min(20, d * 3));
      if (d >= 3) reasons.push('Resting HR ' + Math.round(d) + ' bpm above normal');
    }
  }
  if (last.sleepSecs) {
    const h = last.sleepSecs / 3600;
    metrics.sleep = { value: h };
    if (h < 6) { score -= 15; reasons.push('Short sleep (' + h.toFixed(1) + ' h)'); }
    else if (h < 7) score -= 5;
    else if (h >= 8) score += 5;
  }
  if (last.ctl != null && last.atl != null) {
    const form = last.ctl - last.atl;
    metrics.form = { value: Math.round(form), ctl: Math.round(last.ctl), atl: Math.round(last.atl) };
    if (form < -25) { score -= 10; reasons.push('Fatigue is high relative to fitness'); }
    else if (form < -15) score -= 5;
    else if (form > 5) score += 5;
  }
  if (!metrics.hrv && !metrics.rhr && !metrics.sleep) return null;
  score = Math.round(Math.max(5, Math.min(100, score)));
  const band = score >= 65 ? 'go' : score >= 55 ? 'trim' : score >= 40 ? 'easy' : 'rest';
  const headline = { go: 'Ready, go as planned', trim: 'A little off, hard work trimmed', easy: 'Take it easy today', rest: 'Rest and recover today' }[band];
  return { score, band, headline, reasons, metrics, date: last.id };
}

/* ---------- adaptation ---------- */
function clone(o) { return JSON.parse(JSON.stringify(o)); }

function adapt(session, r, settings) {
  if (!r || session.type === 'rest' || r.band === 'go') return session;
  const s = clone(session);
  const why = r.reasons.length ? r.reasons[0] : 'Readiness ' + r.score;
  const z = easyZone(settings);
  if (r.band === 'rest') {
    if (s.sport === 'WeightTraining') {
      return Object.assign(s, { type: 'rest', sport: null, name: 'Rest (was ' + session.name + ')', summary: 'Optional 10 min mobility', blocks: [], hard: false, adjusted: true,
        notes: [why + ', so strength moves to another day.'] });
    }
    return Object.assign(s, { name: 'Recovery ' + (s.sport === 'Ride' ? 'spin' : 'walk or jog'), summary: '20 min · Zone 1', hard: false, adjusted: true,
      blocks: [{ label: 'Recovery', sec: 1200, zone: [1, 1], kind: 'easy' }],
      notes: [why + ', so today is an optional 20 min in Zone 1.'] });
  }
  if (s.sport === 'WeightTraining') {
    if (r.band === 'easy') {
      s.blocks.forEach(b => { if (b.kind === 'lift' && b.sets > 2) { b.sets -= 1; b.sec = b.sets * 120; b.label = b.move + ' ' + b.sets + '×' + b.reps; } });
      s.summary = s.focus + ' · 2 sets';
      s.adjusted = true;
      s.notes.unshift(why + ', so one set comes off each exercise.');
    }
    return s;
  }
  if (s.hard) {
    const rep = s.blocks.find(b => b.repeat);
    if (r.band === 'trim' && rep) {
      const before = rep.repeat;
      rep.repeat = Math.max(2, rep.repeat - 1);
      rep.steps[1].sec += 60;
      s.name = s.name.replace(/\d+ ×/, rep.repeat + ' ×');
      s.summary = fmtDur(totalSec(s.blocks)) + ' · ' + zoneLabel(rep.steps[0].zone) + ' repeats';
      s.adjusted = true;
      s.notes.unshift(why + ', so we cut ' + before + ' repeats to ' + rep.repeat + ' and added a minute to each recovery.');
      return s;
    }
    const min = round5((totalSec(s.blocks) / 60) * 0.8);
    return Object.assign(s, { name: 'Easy run (swapped)', summary: min + ' min · ' + zoneLabel(z), hard: false, adjusted: true,
      blocks: [{ label: 'Easy', sec: min * 60, zone: z, kind: 'easy' }],
      notes: [why + ', so the intervals became an easy Zone 2 run.'] });
  }
  if (r.band === 'easy') {
    const b = s.blocks[0];
    const min = round5((b.sec / 60) * 0.8);
    b.sec = min * 60;
    s.summary = min + ' min · ' + zoneLabel(b.zone);
    s.adjusted = true;
    s.notes.unshift(why + ', so this is 20% shorter.');
  }
  return s;
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
    if (!type || type === 'rest') continue;
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
      s.hard = flatSteps(s.blocks).some(x => x.zone && x.zone[1] >= 4);
      s.summary = summarize(s);
      s.notes = (s.notes || []).filter(n => n.indexOf('You edited') !== 0);
      s.notes.unshift('You edited this workout, so readiness changes leave it alone.');
    } else {
      s = buildSession(sched[DAY_KEYS[dayIndex(date)]], date, settings, { holdProgression: hold });
      s.held = hold;
      if (date === today) s = adapt(s, ctx.readiness, settings);
    }
    s.done = isDone(s, actMap);
    s.status = s.type === 'rest' ? 'rest' : s.done ? 'done' : date < today ? 'missed' : date === today ? 'today' : 'upcoming';
    out.push(s);
  }
  return out;
}

function planNotes(days, ctx) {
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
    .replace(/^[\s-]+/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
function icuStep(s) {
  const target = s.zone ? (s.zone[0] === s.zone[1] ? 'Z' + s.zone[0] + ' HR' : 'Z' + s.zone[0] + '-Z' + s.zone[1] + ' HR') : '';
  const label = s.kind === 'lift' ? safeLabel(s.move) + ' ' + s.sets + '×' + safeLabel(s.reps) : safeLabel(s.label);
  return ('- ' + label + ' ' + icuDur(s.sec) + ' ' + target).replace(/\s{2,}/g, ' ').trim();
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
  return {
    category: 'WORKOUT',
    start_date_local: session.date + 'T00:00:00',
    type: session.sport,
    name: String(session.name || 'Workout').slice(0, 80),
    description: icuText(session),
    external_id: externalId(session.date),
  };
}

const PaceCore = {
  Z_COLORS, Z_NAMES, Z_USES, SESSION_TYPES, DAY_KEYS, DAY_SHORT, DEFAULT_SCHEDULE, LIFTS,
  ymd, parseYmd, addDays, daysBetween, mondayOf, dayIndex,
  estMaxHr, maxHrFor, zoneTops, zoneRanges, fmtDur, fmtClock, icuDur, zoneLabel, zoneBpm,
  exImage, totalSec, flatSteps, intensitySplit, zoneTime, summarize, liftLabel, safeLabel, clone, weekInfo, volumeFactor, buildSession, readiness, adapt,
  activitiesByDate, planDays, planNotes, icuText, toEvent, externalId,
};
if (typeof module !== 'undefined') module.exports = PaceCore;
