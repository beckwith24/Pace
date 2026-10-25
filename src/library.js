/* Pace workout library: ready-made sessions you can schedule on any day. */
(function () {
  const C = typeof PaceCore !== 'undefined' ? PaceCore : require('./core.js');
  const m = n => Math.round(n * 60);
  const W = (label, min, zone, kind) => C.hr(label, m(min), zone, kind);
  const P = (label, min, lo, hi, extra) => C.pw(label, m(min), lo, hi, extra);
  const R = (n, label, steps) => ({ repeat: n, label, steps });
  const work = (s) => Object.assign(s, { kind: 'work' });
  const rec = (s) => Object.assign(s, { kind: 'rec' });

  const CATS = [
    { key: 'run', label: 'Run', sport: 'Run' },
    { key: 'treadmill', label: 'Treadmill', sport: 'Run', treadmill: true },
    { key: 'ride', label: 'Ride', sport: 'Ride' },
    { key: 'zwift', label: 'Zwift', sport: 'VirtualRide', indoor: true },
    { key: 'hike', label: 'Hike', sport: 'Hike' },
    { key: 'strength', label: 'Strength', sport: 'WeightTraining' },
    { key: 'mobility', label: 'Mobility', sport: 'WeightTraining' },
  ];
  const T = [];
  function add(cat, id, name, level, desc, blocks, notes) {
    const c = CATS.find(x => x.key === cat);
    T.push({ id, cat, name, level, desc, sport: c.sport, treadmill: !!c.treadmill, indoor: !!c.indoor, type: 'lib:' + id, blocks, notes: notes || [] });
  }
  const tmNote = 'Start it from the Treadmill activity on your watch.';
  const zwNote = 'Ride it in ERG mode in Zwift. Targets follow your Zwift FTP.';

  /* ---- Run (outdoor, heart rate) ---- */
  add('run', 'run-easy', 'Easy run', 'Easy', 'Conversational pace. The backbone of every plan.', [W('Easy', 30, [1, 2])]);
  add('run', 'run-recovery', 'Recovery run', 'Easy', 'Very easy shakeout the day after something hard.', [W('Very easy', 20, [1, 1])]);
  add('run', 'run-long', 'Long run', 'Moderate', 'Builds endurance. Slow down on hills to stay in Zone 2.', [W('Easy', 60, [1, 2])], ['Bring water for anything over an hour.']);
  add('run', 'run-strides', 'Easy run + strides', 'Easy', 'Easy miles plus six short, relaxed speed bursts for form.',
    [W('Easy', 25, [1, 2]), R(6, 'Strides', [work(C.hr('Stride, fast and relaxed', 20, null)), rec(C.hr('Walk back', 60, [1, 2]))]), W('Cool down', 5, [1, 1], 'cool')],
    ['Strides have no heart rate target: it can\'t rise in 20 seconds. Run tall and quick, not all-out.']);
  add('run', 'run-walkrun', 'Run-walk 8 × 4 min', 'Easy', 'Beginner-friendly: 3 minutes running, 1 minute walking.',
    [W('Brisk walk', 5, [1, 1], 'warm'), R(8, 'Run-walk', [work(W('Run', 3, [2, 2])), rec(W('Walk', 1, [1, 1]))]), W('Walk', 5, [1, 1], 'cool')]);
  add('run', 'run-progression', 'Progression run', 'Moderate', 'Start easy, finish strong. Great pacing practice.',
    [W('Easy', 20, [2, 2]), W('Steady', 10, [3, 3], 'work'), W('Strong finish', 5, [4, 4], 'work'), W('Cool down', 5, [1, 1], 'cool')]);
  add('run', 'run-fartlek', 'Fartlek 10 × 1 min', 'Moderate', 'Playful surges. Fast on, float off.',
    [W('Warm up', 10, [2, 2], 'warm'), R(10, 'Fartlek', [work(W('Fast', 1, [3, 4])), rec(W('Float', 1, [1, 2]))]), W('Cool down', 8, [1, 1], 'cool')]);
  add('run', 'run-tempo', 'Tempo 20 min', 'Hard', 'Comfortably hard and continuous. Raises your threshold.',
    [W('Warm up', 12, [2, 2], 'warm'), W('Tempo', 20, [3, 3], 'work'), W('Cool down', 8, [1, 1], 'cool')]);
  add('run', 'run-cruise', 'Cruise intervals 3 × 8 min', 'Hard', 'Threshold work broken into chunks with short jogs.',
    [W('Warm up', 12, [2, 2], 'warm'), R(3, 'Cruise', [work(W('Cruise', 8, [4, 4])), rec(W('Jog', 2, [1, 1]))]), W('Cool down', 8, [1, 1], 'cool')]);
  add('run', 'run-threshold', 'Threshold 4 × 5 min', 'Hard', 'Classic threshold session.',
    [W('Warm up', 12, [2, 2], 'warm'), R(4, 'Threshold', [work(W('Work', 5, [4, 4])), rec(W('Recover', 3, [1, 1]))]), W('Cool down', 8, [1, 1], 'cool')]);
  add('run', 'run-vo2', 'VO2 max 5 × 3 min', 'Hard', 'Hard repeats near max. Heart rate climbs through each rep.',
    [W('Warm up', 15, [2, 2], 'warm'), R(5, 'VO2', [work(W('Hard', 3, [4, 5])), rec(W('Jog', 3, [1, 1]))]), W('Cool down', 8, [1, 1], 'cool')]);
  add('run', 'run-hills', 'Hill repeats 8 × 60 sec', 'Hard', 'Strength and power on a moderate hill.',
    [W('Warm up', 12, [2, 2], 'warm'), R(8, 'Hills', [work(C.hr('Uphill, strong', 60, [4, 5])), rec(C.hr('Jog down', 90, [1, 1]))]), W('Cool down', 8, [1, 1], 'cool')]);

  /* ---- Treadmill (heart rate) ---- */
  add('treadmill', 'tm-easy', 'Treadmill easy run', 'Easy', 'Steady easy running at 1% incline.', [W('Easy, 1 percent incline', 30, [1, 2])], [tmNote]);
  add('treadmill', 'tm-incline-walk', 'Incline walk 40 min', 'Easy', 'Low-impact aerobic work. Great on recovery days.',
    [W('Walk, 3 percent incline', 5, [1, 1], 'warm'), W('Walk, 10 to 12 percent incline', 30, [2, 3]), W('Walk flat', 5, [1, 1], 'cool')], [tmNote]);
  add('treadmill', 'tm-progression', 'Treadmill progression', 'Moderate', 'Nudge the speed up every block.',
    [W('Easy', 15, [2, 2]), W('A little faster', 10, [2, 3]), W('Steady', 10, [3, 3], 'work'), W('Strong', 5, [4, 4], 'work'), W('Cool down', 5, [1, 1], 'cool')], [tmNote]);
  add('treadmill', 'tm-hills', 'Treadmill hills 6 × 2 min', 'Moderate', 'Incline repeats without the pounding of a downhill.',
    [W('Warm up', 10, [2, 2], 'warm'), R(6, 'Hills', [work(W('Incline 6 percent', 2, [3, 4])), rec(W('Flat, easy', 2, [1, 2]))]), W('Cool down', 8, [1, 1], 'cool')], [tmNote]);
  add('treadmill', 'tm-tempo', 'Treadmill tempo 3 × 8 min', 'Hard', 'Locked-in tempo efforts.',
    [W('Warm up', 10, [2, 2], 'warm'), R(3, 'Tempo', [work(W('Tempo', 8, [3, 3])), rec(W('Easy', 2, [1, 2]))]), W('Cool down', 8, [1, 1], 'cool')], [tmNote]);
  add('treadmill', 'tm-intervals', 'Treadmill 6 × 3 min', 'Hard', 'Threshold intervals with easy jogs.',
    [W('Warm up', 10, [2, 2], 'warm'), R(6, 'Intervals', [work(W('Work', 3, [4, 4])), rec(W('Jog', 2, [1, 1]))]), W('Cool down', 8, [1, 1], 'cool')], [tmNote]);

  /* ---- Ride (outdoor, heart rate) ---- */
  add('ride', 'ride-recovery', 'Recovery spin 30 min', 'Easy', 'Flat and easy. Light gears, high cadence.', [W('Easy spin', 30, [1, 1])]);
  add('ride', 'ride-endurance', 'Endurance ride 60 min', 'Easy', 'Steady Zone 2 aerobic riding.', [W('Steady', 60, [2, 2])]);
  add('ride', 'ride-long', 'Long ride 2 h', 'Moderate', 'Long aerobic ride. Eat and drink every 20–30 minutes.', [W('Steady', 120, [1, 2])], ['Eat something every 30 minutes on rides over 90 minutes.']);
  add('ride', 'ride-tempo', 'Tempo ride 2 × 15 min', 'Moderate', 'Sustained, comfortably hard efforts.',
    [W('Warm up', 15, [2, 2], 'warm'), R(2, 'Tempo', [work(W('Tempo', 15, [3, 3])), rec(W('Easy', 5, [1, 2]))]), W('Cool down', 10, [1, 1], 'cool')]);
  add('ride', 'ride-hills', 'Hill repeats 5 × 4 min', 'Hard', 'Seated climbing at threshold.',
    [W('Warm up', 15, [2, 2], 'warm'), R(5, 'Climbs', [work(W('Climb, seated', 4, [4, 4])), rec(W('Roll back down', 4, [1, 1]))]), W('Cool down', 10, [1, 1], 'cool')]);

  /* ---- Zwift (power, ERG) ---- */
  add('zwift', 'zw-recovery', 'Zwift recovery spin', 'Easy', 'Easy legs, high cadence.', [P('Easy spin', 30, 45, 55, { rpm: [90, 100] })], [zwNote]);
  add('zwift', 'zw-endurance', 'Zwift endurance 45 min', 'Easy', 'Steady Zone 2 power.',
    [P('Warm up', 10, 50, 65, { ramp: true, kind: 'warm' }), P('Endurance', 30, 65, 72, { rpm: [85, 95] }), P('Cool down', 5, 50, 50, { kind: 'cool' })], [zwNote]);
  add('zwift', 'zw-cadence', 'Zwift cadence drills', 'Easy', 'Smooth pedaling at high cadence, low power.',
    [P('Warm up', 10, 50, 65, { ramp: true, kind: 'warm' }), R(5, 'Cadence', [work(P('High cadence', 1, 65, 70, { rpm: [105, 115] })), rec(P('Normal cadence', 2, 65, 70, { rpm: [85, 90] }))]), P('Steady', 10, 70, 75), P('Cool down', 5, 50, 50, { kind: 'cool' })], [zwNote]);
  add('zwift', 'zw-sweetspot', 'Sweet spot 3 × 10 min', 'Moderate', 'Just under threshold. Big fitness return for the effort.',
    [P('Warm up', 10, 50, 70, { ramp: true, kind: 'warm' }), R(3, 'Sweet spot', [work(P('Sweet spot', 10, 88, 93, { rpm: [85, 95] })), rec(P('Recover', 3, 50, 55))]), P('Cool down', 8, 50, 50, { kind: 'cool' })], [zwNote]);
  add('zwift', 'zw-threshold', 'Threshold 2 × 15 min', 'Hard', 'Long efforts at FTP.',
    [P('Warm up', 12, 50, 75, { ramp: true, kind: 'warm' }), R(2, 'Threshold', [work(P('Threshold', 15, 95, 100, { rpm: [85, 95] })), rec(P('Recover', 5, 50, 55))]), P('Cool down', 8, 50, 50, { kind: 'cool' })], [zwNote]);
  add('zwift', 'zw-ftp-builder', 'FTP builder 4 × 8 min', 'Hard', 'Right at or a touch above FTP.',
    [P('Warm up', 12, 50, 75, { ramp: true, kind: 'warm' }), R(4, 'FTP', [work(P('Work', 8, 100, 105, { rpm: [85, 95] })), rec(P('Recover', 4, 50, 50))]), P('Cool down', 8, 50, 50, { kind: 'cool' })], [zwNote]);
  add('zwift', 'zw-overunder', 'Over-unders 3 × 8 min', 'Hard', 'Alternate just under and just over FTP.',
    [P('Warm up', 12, 50, 75, { ramp: true, kind: 'warm' }), R(3, 'Over-under', [work(P('Under', 2, 95, 95)), work(P('Over', 1, 105, 105)), work(P('Under', 2, 95, 95)), work(P('Over', 1, 105, 105)), work(P('Under', 2, 95, 95)), rec(P('Recover', 4, 50, 50))]), P('Cool down', 8, 50, 50, { kind: 'cool' })], [zwNote]);
  add('zwift', 'zw-vo2', 'VO2 max 5 × 3 min', 'Hard', 'Hard, high-cadence repeats.',
    [P('Warm up', 12, 50, 75, { ramp: true, kind: 'warm' }), R(5, 'VO2', [work(P('Hard', 3, 110, 120, { rpm: [95, 105] })), rec(P('Easy', 3, 50, 50))]), P('Cool down', 8, 50, 50, { kind: 'cool' })], [zwNote]);
  add('zwift', 'zw-3030', '30/30s 2 × 10', 'Hard', 'Short and sharp: 30 seconds on, 30 seconds off.',
    [P('Warm up', 12, 50, 75, { ramp: true, kind: 'warm' }), R(10, 'Set 1', [work(P('On', 0.5, 120, 120, { rpm: [100, 110] })), rec(P('Off', 0.5, 50, 50))]), P('Easy between sets', 5, 50, 55), R(10, 'Set 2', [work(P('On', 0.5, 120, 120, { rpm: [100, 110] })), rec(P('Off', 0.5, 50, 50))]), P('Cool down', 8, 50, 50, { kind: 'cool' })], [zwNote]);

  /* ---- Hike ---- */
  add('hike', 'hike-easy', 'Easy hike 60 min', 'Easy', 'Time on your feet at a conversational effort.', [W('Hike', 60, [1, 2])]);
  add('hike', 'hike-hills', 'Hill hike', 'Moderate', 'Four steady climbs with easy descents.',
    [W('Warm up on the flat', 10, [1, 1], 'warm'), R(4, 'Climbs', [work(W('Climb, steady', 8, [2, 3])), rec(W('Descend, easy', 5, [1, 1]))]), W('Walk out', 10, [1, 1], 'cool')]);
  add('hike', 'hike-ruck', 'Ruck 45 min', 'Moderate', 'Hike with a loaded pack. Start with 10–15% of body weight.', [W('Ruck with a loaded pack', 45, [2, 3])]);
  add('hike', 'hike-long', 'Long hike 2.5 h', 'Moderate', 'Big day out. Fuel and drink regularly.', [W('Hike', 150, [1, 2])], ['Bring water and food. Eat something every hour.']);

  /* ---- Strength & mobility ---- */
  const lift = (cat, key, level, desc) => {
    const L = C.LIFTS[key];
    T.push({ id: 'lift-' + key, cat, name: L.name, level, desc, sport: 'WeightTraining', type: key, focus: L.focus,
      blocks: C.liftBlocks(key, 3), notes: ['When you hit every rep on every set, go up 5 lb next time.'] });
  };
  lift('strength', 'liftA', 'Moderate', 'Squat, hinge, lunge, glutes and core.');
  lift('strength', 'liftB', 'Moderate', 'Press, row, overhead press, arms and core.');
  lift('strength', 'liftC', 'Moderate', 'One session that hits everything.');
  lift('strength', 'quick', 'Moderate', 'Five moves, minimal rest. For busy days.');
  lift('strength', 'liftRun', 'Moderate', 'Single-leg strength and calves that protect runners.');
  lift('strength', 'push', 'Moderate', 'Chest, shoulders and triceps.');
  lift('strength', 'pull', 'Moderate', 'Back, rear shoulders and biceps.');
  lift('strength', 'legs', 'Hard', 'Full leg session. Not the day before a hard run.');
  lift('mobility', 'core', 'Easy', 'Core stability plus hip and back mobility.');
  lift('mobility', 'stretch', 'Easy', '10 minutes of stretching after a run or ride.');
  T.filter(t => t.cat === 'mobility').forEach(t => { t.notes = ['Move slowly and breathe. Stretches are holds, not reps.']; });

  T.forEach(t => { t.summary = C.summarize(t); t.minutes = Math.round(C.totalSec(t.blocks) / 60); });

  function toSession(t, date) {
    const s = C.clone({ type: t.type, sport: t.sport, treadmill: t.treadmill, indoor: t.indoor, name: t.name, focus: t.focus, blocks: t.blocks, notes: t.notes });
    s.date = date; s.template = t.id;
    return s;
  }
  const PaceLibrary = { CATS, TEMPLATES: T, get: id => T.find(t => t.id === id), toSession };
  if (typeof module !== 'undefined') module.exports = PaceLibrary; else window.PaceLibrary = PaceLibrary;
})();
