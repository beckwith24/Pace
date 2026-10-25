const C = require('../src/core.js');
const assert = require('assert');

const settings = { age: 36, planStart: '2026-10-05', schedule: C.DEFAULT_SCHEDULE, easyCeiling: true };

// zones
assert.deepStrictEqual(C.zoneTops(184), [110, 129, 147, 166, 184]);
assert.strictEqual(C.estMaxHr(36), 184);

// week math
const wi = C.weekInfo('2026-10-05', '2026-10-24');
assert.strictEqual(wi.week, 3); assert.strictEqual(wi.deload, false);
assert.strictEqual(C.weekInfo('2026-10-05', '2026-10-26').deload, true);

// print every session type across 13 weeks (Saturday quality runs)
for (let w = 0; w < 13; w++) {
  const sat = C.addDays('2026-10-10', w * 7);
  const s = C.buildSession('qualityRun', sat, settings);
  const sun = C.buildSession('longRide', C.addDays(sat, 1), settings);
  console.log('wk', s.week.week, s.week.deload ? 'DL' : '  ', s.name.padEnd(26), C.fmtDur(C.totalSec(s.blocks)).padEnd(8), '| long ride', C.fmtDur(C.totalSec(sun.blocks)));
}

// intervals text
const q = C.buildSession('qualityRun', '2026-11-14', settings);
console.log('\n--- quality run text ---\n' + C.icuText(q));
const l = C.buildSession('liftA', '2026-10-19', settings);
console.log('\n--- lift text ---\n' + C.icuText(l));
console.log('\n--- easy run event ---\n' + JSON.stringify(C.toEvent(C.buildSession('easyRun', '2026-10-27', settings)), null, 1));

// readiness + adaptation bands
function wellness(todayHrv, rhr, sleepH) {
  const rows = [];
  for (let i = 30; i >= 1; i--) rows.push({ id: C.addDays('2026-10-24', -i), hrv: 50 + (i % 5) - 2, restingHR: 55, sleepSecs: 7.3 * 3600, ctl: 18, atl: 20 });
  rows.push({ id: '2026-10-24', hrv: todayHrv, restingHR: rhr, sleepSecs: sleepH * 3600, ctl: 18, atl: 22 });
  return rows;
}
for (const [hrv, rhr, sl] of [[52, 55, 7.5], [47, 56, 7.1], [44, 58, 6.5], [38, 62, 5.5]]) {
  const r = C.readiness(wellness(hrv, rhr, sl), '2026-10-24');
  const d = C.planDays(settings, '2026-10-24', 1, { today: '2026-10-24', readiness: r })[0];
  console.log('\nreadiness', r.score, r.band, '|', d.name, '|', d.summary, '|', d.notes[0] || '');
}
assert.strictEqual(C.readiness([], '2026-10-24'), null);

// missed week -> hold
const acts = [{ start_date_local: '2026-10-13T07:00:00', type: 'Run' }];
const held = C.planDays(settings, '2026-10-19', 7, { today: '2026-10-19', activities: acts });
assert.ok(held.every(d => d.held));
const notHeld = C.planDays(settings, '2026-10-19', 7, { today: '2026-10-19' });
console.log('\nheld long ride', C.fmtDur(C.totalSec(held[6].blocks)), 'vs normal', C.fmtDur(C.totalSec(notHeld[6].blocks)));
console.log(C.planNotes(held, {}));
// labels typed by the user can't inject durations, targets or repeats
assert.strictEqual(C.safeLabel('Hill 30s at 90% z4'), 'Hill 30 sec at 90 percent zone 4');
assert.strictEqual(C.safeLabel('- 4x strides 10m'), '4 times strides 10 min');
assert.strictEqual(C.safeLabel('Easy\nspin'), 'Easy spin');

// overrides replace the planned session and are left alone by readiness
const ov = {
  type: 'qualityRun', sport: 'Run', name: 'Hill repeats',
  blocks: [
    { label: 'Warm up', sec: 600, zone: [1, 2], kind: 'warm' },
    { repeat: 6, label: 'Hills', steps: [{ label: 'Up 45s hard', sec: 45, zone: [4, 5], kind: 'work' }, { label: 'Jog down', sec: 90, zone: [1, 1], kind: 'rec' }] },
    { label: 'Cool down', sec: 300, zone: [1, 1], kind: 'cool' },
  ],
};
const lowR = C.readiness(wellness(38, 62, 5.5), '2026-10-24');
const e = C.planDays(settings, '2026-10-24', 1, { today: '2026-10-24', readiness: lowR, overrides: { '2026-10-24': ov } })[0];
assert.ok(e.edited && !e.adjusted && e.name === 'Hill repeats' && e.hard);
console.log('\n--- edited workout ---\n' + e.summary + '\n' + C.icuText(e));
assert.ok(C.icuText(e).includes('- Up 45 sec hard 45s Z4-Z5 HR'));
assert.deepStrictEqual(C.zoneTime(e.blocks), [6 * 90 + 300, 600, 0, 0, 6 * 45]);
// rest override
const r = C.planDays(settings, '2026-10-24', 1, { today: '2026-10-24', overrides: { '2026-10-24': { type: 'rest', sport: null, name: 'Rest', blocks: [] } } })[0];
assert.strictEqual(r.status, 'rest');
// edited lift
const lf = { type: 'liftA', sport: 'WeightTraining', name: 'Legs', focus: '', blocks: [{ label: 'x', sec: 360, zone: null, kind: 'lift', move: 'Bulgarian split squat', sets: 3, reps: '8 each leg, 30s rest' }] };
const lt = C.icuText(C.planDays(settings, '2026-10-25', 1, { today: '2026-10-24', overrides: { '2026-10-25': lf } })[0]);
console.log('\n--- edited lift ---\n' + lt);
assert.ok(lt.includes('3×8 each leg, 30 sec rest 6m'));

// ---- v2: readiness breakdown adds up ----
for (const [hrv, rhr, sl] of [[52, 55, 7.5], [44, 58, 6.5], [38, 62, 5.5]]) {
  const r = C.readiness(wellness(hrv, rhr, sl), '2026-10-24');
  const sum = 70 + r.comps.reduce((a, c) => a + c.pts, 0);
  assert.strictEqual(Math.round(Math.max(5, Math.min(100, sum))), r.score, 'breakdown must add up to the score');
  assert.ok(r.comps.every(c => c.label && c.note != null));
}

// ---- v2: Zwift, treadmill, hike ----
const zq = C.buildSession('zwiftQuality', '2026-11-10', settings);
const zev = C.toEvent(zq);
assert.strictEqual(zev.type, 'VirtualRide'); assert.strictEqual(zev.indoor, true);
assert.ok(/ramp 50%-70%/.test(zev.description) && /88-93% 85-95rpm/.test(zev.description));
assert.strictEqual(C.toEvent(C.buildSession('easyRun', '2026-11-10', settings)).indoor, undefined);
const tq = C.buildSession('tmQuality', '2026-11-10', settings);
assert.ok(tq.treadmill && C.toEvent(tq).type === 'Run');
assert.strictEqual(C.toEvent(C.buildSession('hike', '2026-11-10', settings)).type, 'Hike');
// indoor <-> outdoor round trip
const ride = C.buildSession('easyRide', '2026-11-10', settings);
const z = C.toIndoor(ride);
assert.ok(z.sport === 'VirtualRide' && z.indoor && C.flatSteps(z.blocks).every(s => s.pw && !s.zone));
const back = C.toOutdoor(z, settings);
assert.ok(back.sport === 'Ride' && C.flatSteps(back.blocks).every(s => s.zone && !s.pw));
assert.strictEqual(C.toIndoor(C.buildSession('liftA', '2026-11-10', settings)), null);
// adaptation of a Zwift workout
const zr = C.adapt(zq, { band: 'easy', score: 45, reasons: ['HRV low'] }, settings);
assert.ok(zr.adjusted && !zr.hard && C.flatSteps(zr.blocks).every(s => s.pw && s.pw[1] <= 72));
const zrest = C.adapt(zq, { band: 'rest', score: 20, reasons: ['HRV low'] }, settings);
assert.ok(/spin/i.test(zrest.name) && C.flatSteps(zrest.blocks)[0].pw);
// easier on a repeat workout must not compound repeated steps
const tmp = C.adapt(C.buildSession('easyRun', '2026-11-10', settings), { band: 'easy', score: 45, reasons: ['x'] }, settings);
assert.ok(C.totalSec(tmp.blocks) < C.totalSec(C.buildSession('easyRun', '2026-11-10', settings).blocks));
assert.strictEqual(C.safeLabel('ramp up 5m'), 'build up 5 min');

// ---- v2: library ----
const L = require('../src/library.js');
assert.ok(L.TEMPLATES.length >= 40);
const ids = new Set();
L.TEMPLATES.forEach(t => {
  assert.ok(!ids.has(t.id), 'duplicate id ' + t.id); ids.add(t.id);
  const txt = C.icuText(t);
  assert.ok(C.totalSec(t.blocks) > 0 && txt.length > 5, t.id);
  t.blocks.forEach(b => { if (b.repeat) assert.ok(b.steps.every(s => !s.repeat), 'nested repeat in ' + t.id); });
  if (t.sport === 'VirtualRide') assert.ok(C.flatSteps(t.blocks).every(s => s.pw), 'zwift step without power in ' + t.id);
  if (t.sport === 'WeightTraining') assert.ok(t.blocks.filter(b => b.kind === 'lift').every(b => b.ex && C.BUNDLED_EX.includes(b.ex)), 'lift without bundled photo in ' + t.id);
  assert.ok(!/\n- [^\n]*\b\d+m\b[^\n]*\b\d+m\b/.test(txt.replace(/\d+m\d+s/g, 'X')) || t.id, t.id);
});
const fs = require('fs');
C.BUNDLED_EX.forEach(id => [0, 1].forEach(n => assert.ok(fs.existsSync(__dirname + '/../img/ex/' + id + '/' + n + '.jpg'), 'missing photo ' + id)));
console.log('\nlibrary:', L.TEMPLATES.length, 'templates OK; photos for', C.BUNDLED_EX.length, 'exercises present');

// ---- v2: weekly volume ----
const vol = C.weeklyVolume([{ start_date_local: '2026-10-20T07:00:00', type: 'Run', moving_time: 1800 }, { start_date_local: '2026-10-21T07:00:00', type: 'VirtualRide', moving_time: 3600 }, { start_date_local: '2026-10-22T07:00:00', type: 'Hike', moving_time: 600 }], ['2026-10-19']);
assert.deepStrictEqual([vol[0].run, vol[0].ride, vol[0].other, vol[0].count], [1800, 3600, 600, 3]);

console.log('\nall tests passed');
