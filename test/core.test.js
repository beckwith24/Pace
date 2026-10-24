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
console.log('\nall tests passed');
