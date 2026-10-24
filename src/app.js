/* Pace UI: state, Intervals.icu calls and rendering. Depends on PaceCore. */
(function () {
  const C = PaceCore;
  const LS_KEY = 'pace.v1';
  const BASE = 'https://intervals.icu/api/v1';

  const DEFAULTS = {
    apiKey: '', athleteId: '0', age: 36, maxHr: '', planStart: '',
    schedule: Object.assign({}, C.DEFAULT_SCHEDULE), easyCeiling: true, autoSend: true, lastSent: '',
    overrides: {},
  };
  const ZONE_OPTIONS = [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [1, 2], [2, 3], [3, 4], [4, 5]];

  function loadSettings() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch (e) { s = {}; }
    const out = Object.assign({}, DEFAULTS, s);
    out.schedule = Object.assign({}, C.DEFAULT_SCHEDULE, s.schedule || {});
    out.overrides = (s.overrides && typeof s.overrides === 'object') ? s.overrides : {};
    // drop edits for days more than two weeks gone
    const cutoff = C.addDays(C.ymd(new Date()), -14);
    Object.keys(out.overrides).forEach(d => { if (d < cutoff) delete out.overrides[d]; });
    return out;
  }
  function saveSettings() { try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) { /* private mode */ } }

  let S = loadSettings();
  let D = { wellness: [], activities: [], events: [], sport: [], loaded: false, loading: false, error: '', athlete: null };
  const UI = { view: 'today', detail: null, edit: null, weekOffset: 0, sending: false, syncingZones: false };

  const today = () => C.ymd(new Date());
  const isDemo = () => !S.apiKey;
  const athleteId = () => (S.athleteId || '0').trim() || '0';
  const demoStart = () => C.addDays(C.mondayOf(today()), -14);
  function settings() {
    return Object.assign({}, S, { planStart: isDemo() ? demoStart() : (S.planStart || C.mondayOf(today())) });
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  /* ---------------- network ---------------- */
  async function api(path, opts) {
    opts = opts || {};
    let res;
    try {
      res = await fetch(BASE + path, {
        method: opts.method || 'GET',
        headers: Object.assign({ Authorization: 'Basic ' + btoa('API_KEY:' + S.apiKey.trim()), Accept: 'application/json' },
          opts.body ? { 'Content-Type': 'application/json' } : {}),
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
    } catch (e) {
      throw new Error("Couldn't reach Intervals.icu. Check your connection and try again.");
    }
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) throw new Error('Intervals.icu rejected the API key or athlete ID (HTTP ' + res.status + ').');
      let t = ''; try { t = (await res.text()).slice(0, 140); } catch (e) { /* ignore */ }
      throw new Error('Intervals.icu error ' + res.status + (t ? ': ' + t : ''));
    }
    if (res.status === 204) return null;
    const ct = res.headers.get('content-type') || '';
    return ct.includes('json') ? res.json() : res.text();
  }

  function demoData() {
    const t = today(), wellness = [], activities = [];
    for (let i = 30; i >= 1; i--) {
      wellness.push({ id: C.addDays(t, -i), hrv: 49 + ((i * 7) % 6) - 2, restingHR: 54 + (i % 3 === 0 ? 1 : 0), sleepSecs: (7 + (i % 4) * 0.2) * 3600, ctl: 17 + (30 - i) * 0.05, atl: 19 + (i % 5) });
    }
    wellness.push({ id: t, hrv: 46, restingHR: 56, sleepSecs: 7.1 * 3600, ctl: 18.5, atl: 22.5 });
    const st = Object.assign({}, S, { planStart: demoStart() });
    const mon = C.mondayOf(t);
    for (let d = C.addDays(mon, -7); d < t; d = C.addDays(d, 1)) {
      const type = st.schedule[C.DAY_KEYS[C.dayIndex(d)]];
      const sport = C.SESSION_TYPES[type] && C.SESSION_TYPES[type].sport;
      if (sport) activities.push({ start_date_local: d + 'T07:00:00', type: sport });
    }
    return { wellness, activities, events: [], sport: [], loaded: true, loading: false, error: '', athlete: null };
  }

  async function loadAll(opts) {
    opts = opts || {};
    if (isDemo()) { D = demoData(); render(); return; }
    D.loading = true; D.error = ''; render();
    const t = today(), id = athleteId();
    const r = await Promise.allSettled([
      api('/athlete/' + id + '/wellness?oldest=' + C.addDays(t, -35) + '&newest=' + t),
      api('/athlete/' + id + '/activities?oldest=' + C.addDays(C.mondayOf(t), -7) + '&newest=' + C.addDays(t, 1)),
      api('/athlete/' + id + '/events?oldest=' + C.addDays(t, -7) + '&newest=' + C.addDays(t, 13) + '&category=WORKOUT'),
      api('/athlete/' + id + '/sport-settings'),
    ]);
    const val = (x, fb) => (x.status === 'fulfilled' && Array.isArray(x.value)) ? x.value : fb;
    D = { wellness: val(r[0], []), activities: val(r[1], []), events: val(r[2], []), sport: val(r[3], []),
      loaded: true, loading: false, athlete: D.athlete, error: '' };
    const failed = r.filter(x => x.status === 'rejected');
    if (failed.length === r.length) D.error = failed[0].reason.message;
    else if (failed.length) D.error = 'Some data did not load: ' + failed[0].reason.message;
    render();
    if (!D.error && S.autoSend && !opts.skipAuto && (S.lastSent || '').slice(0, 10) !== t) sendWeek({ quiet: true });
  }

  /* ---------------- plan helpers ---------------- */
  function ready() { return C.readiness(D.wellness, today()); }
  function plan(from, n) {
    return C.planDays(settings(), from, n, { today: today(), readiness: ready(), activities: D.loaded ? D.activities : null, overrides: S.overrides });
  }
  function sessionFor(date) { return plan(date, 1)[0]; }
  function sentEvent(date) { return (D.events || []).find(e => e.external_id === C.externalId(date)); }

  /* ---------------- actions ---------------- */
  async function sendWeek(o) {
    o = o || {};
    if (isDemo()) { toast('Add your Intervals.icu API key in Settings to send workouts.'); return; }
    if (UI.sending) return;
    UI.sending = true; render();
    try {
      const t = today(), id = athleteId();
      const days = plan(t, 7).filter(d => d.type !== 'rest' && d.sport);
      const events = days.map(C.toEvent);
      const existing = await api('/athlete/' + id + '/events?oldest=' + t + '&newest=' + C.addDays(t, 6) + '&category=WORKOUT') || [];
      const keep = new Set(events.map(e => e.external_id));
      const stale = existing.filter(e => e.external_id && e.external_id.indexOf('pace-') === 0 && !keep.has(e.external_id));
      for (const e of stale) await api('/athlete/' + id + '/events/' + e.id, { method: 'DELETE' });
      if (events.length) await api('/athlete/' + id + '/events/bulk?upsert=true', { method: 'POST', body: events });
      S.lastSent = new Date().toISOString(); saveSettings();
      toast((o.quiet ? 'Watch updated: ' : 'Sent ') + events.length + ' workouts for the next 7 days. Sync Garmin Connect to load them on your fenix.');
      UI.sending = false;
      await loadAll({ skipAuto: true });
    } catch (err) {
      toast(err.message, true);
    } finally {
      UI.sending = false; render();
    }
  }

  async function syncZones() {
    if (isDemo()) { toast('Add your Intervals.icu API key in Settings first.'); return; }
    const targets = (D.sport || []).filter(s => (s.types || []).some(t => t === 'Run' || t === 'Ride'));
    if (!targets.length) { toast('No Run or Ride sport settings found in Intervals.icu.', true); return; }
    UI.syncingZones = true; render();
    const max = C.maxHrFor(S), tops = C.zoneTops(max);
    try {
      for (const s of targets) {
        await api('/athlete/' + athleteId() + '/sport-settings/' + s.id, { method: 'PUT', body: { max_hr: max, hr_zones: tops, hr_zone_names: C.Z_NAMES } });
      }
      toast('Zones copied to Intervals.icu for ' + targets.map(s => s.types[0]).join(' and ') + '.');
      UI.syncingZones = false;
      await loadAll({ skipAuto: true });
    } catch (err) {
      toast(err.message + ' You can enter the zones by hand in Intervals.icu settings.', true);
    } finally { UI.syncingZones = false; render(); }
  }

  async function testConnection() {
    if (isDemo()) { toast('Paste your API key first.'); return; }
    try {
      const a = await api('/athlete/' + athleteId());
      D.athlete = a;
      toast('Connected' + (a && a.name ? ' as ' + a.name : '') + '.');
      await loadAll();
    } catch (err) { toast(err.message, true); }
  }

  /* ---------------- toast ---------------- */
  let toastTimer;
  function toast(msg, isErr) {
    const el = document.getElementById('toast');
    el.textContent = msg; el.className = 'toast show' + (isErr ? ' err' : '');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.className = 'toast'; }, isErr ? 7000 : 4500);
  }

  /* ---------------- icons ---------------- */
  const P = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
  const ICON = {
    Run: '<svg width="22" height="22" viewBox="0 0 24 24" ' + P + '><circle cx="14" cy="4" r="2"/><path d="M7 21l3-6 3 2 2 5"/><path d="M6 12l3-4 4 1 3 3 3 1"/></svg>',
    Ride: '<svg width="22" height="22" viewBox="0 0 24 24" ' + P + '><circle cx="6" cy="17" r="3.5"/><circle cx="18" cy="17" r="3.5"/><path d="M6 17l4-8h5l3 8"/><path d="M10 9l2 8"/><path d="M14 6h3"/></svg>',
    WeightTraining: '<svg width="22" height="22" viewBox="0 0 24 24" ' + P + '><path d="M6 7v10M3 9v6M18 7v10M21 9v6M6 12h12"/></svg>',
    rest: '<svg width="22" height="22" viewBox="0 0 24 24" ' + P + '><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>',
    sync: '<svg width="20" height="20" viewBox="0 0 24 24" ' + P + '><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/><path d="M3 21v-5h5"/></svg>',
    back: '<svg width="20" height="20" viewBox="0 0 24 24" ' + P + '><path d="M15 18l-6-6 6-6"/></svg>',
    watch: '<svg width="18" height="18" viewBox="0 0 24 24" ' + P + '><circle cx="12" cy="12" r="6"/><path d="M9 3h6M9 21h6M12 9v3l2 1"/></svg>',
    check: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
    info: '<svg width="18" height="18" viewBox="0 0 24 24" ' + P + '><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>',
    edit: '<svg width="18" height="18" viewBox="0 0 24 24" ' + P + '><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>',
    up: '<svg width="16" height="16" viewBox="0 0 24 24" ' + P + '><path d="M6 15l6-6 6 6"/></svg>',
    down: '<svg width="16" height="16" viewBox="0 0 24 24" ' + P + '><path d="M6 9l6 6 6-6"/></svg>',
    trash: '<svg width="16" height="16" viewBox="0 0 24 24" ' + P + '><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    plus: '<svg width="16" height="16" viewBox="0 0 24 24" ' + P + '><path d="M12 5v14M5 12h14"/></svg>',
    minus: '<svg width="16" height="16" viewBox="0 0 24 24" ' + P + '><path d="M5 12h14"/></svg>',
  };
  const iconFor = s => ICON[s.sport] || ICON.rest;

  /* ---------------- pieces ---------------- */
  const ZH = [25, 40, 60, 80, 100];
  function shapeBar(s, h) {
    const steps = C.flatSteps(s.blocks).filter(x => x.zone);
    if (!steps.length) return '';
    return '<div class="shape" style="height:' + h + 'px" role="img" aria-label="Workout intensity by step">' +
      steps.map(x => '<div style="flex:' + x.sec + ';height:' + ZH[x.zone[1] - 1] + '%;background:' + C.Z_COLORS[x.zone[1] - 1] + '"></div>').join('') + '</div>';
  }
  function banner() {
    if (isDemo()) return '<div class="banner"><strong>Demo mode.</strong> This is sample data. <button class="link" data-action="go" data-view="settings">Connect Intervals.icu</button></div>';
    if (D.error) return '<div class="banner err">' + esc(D.error) + '</div>';
    return '';
  }
  function header(title, sub, right) {
    return '<header class="top"><div><div class="sub">' + esc(sub) + '</div><h1>' + esc(title) + '</h1></div>' + (right || '') + '</header>';
  }
  function fmtDate(s, long) {
    return C.parseYmd(s).toLocaleDateString(undefined, long ? { weekday: 'long', month: 'short', day: 'numeric' } : { weekday: 'short', month: 'short', day: 'numeric' });
  }
  function sentLine(date) {
    if (isDemo()) return 'Demo: connect Intervals.icu to send this to your watch';
    if (sentEvent(date)) return 'On Intervals.icu · syncs to your fenix through Garmin Connect';
    return 'Not sent yet';
  }

  /* ---------------- views ---------------- */
  function viewToday() {
    const t = today();
    const r = ready();
    const s = sessionFor(t);
    const mon = C.mondayOf(t);
    const week = plan(mon, 7);
    const refresh = '<button class="icon-btn" data-action="refresh" aria-label="Refresh data">' + ICON.sync + '</button>';
    let h = header('Today', fmtDate(t, true), refresh) + banner();

    if (r) {
      const m = r.metrics;
      const pct = r.score;
      const ringColor = r.band === 'go' ? 'var(--lime)' : r.band === 'trim' ? 'var(--amber)' : 'var(--red)';
      const cell = (label, val, sub, warn) => '<div class="metric"><span class="ml">' + label + '</span><span class="mv">' + val + '</span><span class="ms' + (warn ? ' warn' : '') + '">' + sub + '</span></div>';
      h += '<section class="card ready"><div class="ring" style="background:conic-gradient(' + ringColor + ' ' + pct + '%, var(--line) 0)"><div><b>' + r.score + '</b><span>READY</span></div></div>' +
        '<div class="ready-body"><div class="ready-head">' + esc(r.headline) + '</div><div class="metrics">' +
        (m.hrv ? cell('HRV', m.hrv.value + ' ms', m.hrv.vs7 == null ? '—' : (m.hrv.vs7 >= 0 ? '+' : '−') + Math.abs(Math.round(m.hrv.vs7 * 100)) + '% vs 7d', m.hrv.vs7 != null && m.hrv.vs7 <= -0.05) : cell('HRV', '—', 'no data')) +
        (m.rhr ? cell('Rest HR', m.rhr.value, m.rhr.delta == null ? '—' : m.rhr.delta >= 3 ? '+' + Math.round(m.rhr.delta) + ' bpm' : 'normal', m.rhr.delta >= 3) : cell('Rest HR', '—', 'no data')) +
        (m.sleep ? cell('Sleep', Math.floor(m.sleep.value) + 'h ' + Math.round((m.sleep.value % 1) * 60) + 'm', m.sleep.value < 6 ? 'short' : 'normal', m.sleep.value < 6) : cell('Sleep', '—', 'no data')) +
        '</div></div></section>';
    } else if (D.loaded) {
      h += '<section class="card note-card">' + ICON.info + '<span>No readiness data for today yet. Wear your fenix overnight; HRV, resting HR and sleep flow from Garmin to Intervals.icu. Until then the plan runs as written.</span></section>';
    }

    h += '<section class="card"><div class="row-between"><span class="eyebrow">TODAY\'S WORKOUT</span>' + (s.edited ? '<span class="pill blue">Edited</span>' : s.adjusted ? '<span class="pill amber">Adjusted</span>' : '') + '</div>' +
      '<div class="sess"><div class="sess-icon">' + iconFor(s) + '</div><div><div class="sess-name">' + esc(s.name) + '</div><div class="muted">' + esc(s.summary) + '</div></div></div>' +
      shapeBar(s, 34) +
      (s.adjusted && s.notes[0] ? '<div class="why">' + ICON.info + '<span>' + esc(s.notes[0]) + '</span></div>' : '') +
      (s.type !== 'rest' ? '<button class="btn primary" data-action="open" data-date="' + t + '">' + ICON.watch + ' View steps</button>' : '') +
      (s.type !== 'rest' ? '<div class="tiny center">' + esc(sentLine(t)) + '</div>' : '') +
      '</section>';

    h += '<section><div class="row-between"><span class="eyebrow">THIS WEEK</span><button class="link" data-action="go" data-view="plan">See plan</button></div><div class="strip">' +
      week.map(d => {
        const isT = d.date === t;
        const dot = d.status === 'done' ? 'var(--lime)' : d.status === 'missed' ? 'var(--red)' : d.status === 'rest' ? 'transparent' : 'var(--line)';
        const short = d.type === 'rest' ? 'Rest' : d.sport === 'WeightTraining' ? 'Lift' : d.sport === 'Ride' ? 'Ride' : 'Run';
        return '<button class="day' + (isT ? ' on' : '') + '" data-action="open" data-date="' + d.date + '" aria-label="' + esc(fmtDate(d.date) + ': ' + d.name + ', ' + d.status) + '"><span class="dn">' + C.DAY_SHORT[C.dayIndex(d.date)] + '</span><span class="dt">' + short + '</span><span class="dot" style="background:' + dot + '"></span></button>';
      }).join('') + '</div></section>';

    h += '<button class="btn primary" data-action="send"' + (UI.sending ? ' disabled' : '') + '>' + (UI.sending ? 'Sending…' : 'Send next 7 days to watch') + '</button>' +
      '<div class="tiny center">' + (S.lastSent && !isDemo() ? 'Last sent ' + new Date(S.lastSent).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : 'Workouts go Pace → Intervals.icu → Garmin Connect → fenix 7') + '</div>';
    return h;
  }

  function viewPlan() {
    const t = today();
    const mon = C.addDays(C.mondayOf(t), UI.weekOffset * 7);
    const days = plan(mon, 7);
    const wi = days[0].week;
    let easy = 0, hard = 0;
    days.forEach(d => { const x = C.intensitySplit(d.blocks); easy += x.easy; hard += x.hard; });
    const tot = easy + hard, ep = tot ? Math.round(easy / tot * 100) : 100;
    const notes = C.planNotes(days, {});
    let h = header(UI.weekOffset ? 'Next week' : 'Your week', 'Week ' + wi.week + ' · ' + wi.phase + (wi.deload ? ' · recovery week' : '')) + banner();
    h += '<div class="seg" role="group" aria-label="Which week"><button aria-pressed="' + (UI.weekOffset === 0) + '" data-action="week" data-off="0">This week</button><button aria-pressed="' + (UI.weekOffset === 1) + '" data-action="week" data-off="1">Next week</button></div>';
    h += '<section class="card"><div class="row-between small"><b>Easy vs hard</b><span class="muted">target 80 / 20</span></div>' +
      '<div class="split" role="img" aria-label="' + ep + ' percent easy"><div style="flex:' + easy + ';background:var(--z2)"></div><div style="flex:' + hard + ';background:var(--z4)"></div></div>' +
      '<div class="row-between tiny"><span>' + ep + '% easy · ' + C.fmtDur(tot) + ' run + ride</span><span>' + (100 - ep) + '% hard</span></div></section>';
    h += '<div class="list">' + days.map(d => {
      const isT = d.date === t;
      const right = d.status === 'done' ? '<span class="ok" role="img" aria-label="Done">' + ICON.check + '</span>' :
        d.status === 'missed' ? '<span class="pill red">Missed</span>' : d.edited ? '<span class="pill blue">Edited</span>' : d.adjusted ? '<span class="pill amber">Adjusted</span>' : '';
      return '<button class="li' + (isT ? ' on' : '') + '" data-action="open" data-date="' + d.date + '"><span class="li-day">' + C.DAY_SHORT[C.dayIndex(d.date)].toUpperCase() + '</span><span class="li-main"><span class="li-name">' + esc(d.name) + '</span><span class="muted small">' + esc(d.summary) + '</span></span>' + right + '</button>';
    }).join('') + '</div>';
    if (notes.length) {
      h += '<section class="card"><span class="eyebrow">WHY THE PLAN LOOKS LIKE THIS</span>' + notes.map(n => '<div class="bullet ' + n.tone + '"><span>•</span><span>' + esc(n.text) + '</span></div>').join('') + '</section>';
    }
    return h;
  }

  function stepRow(st, max, start) {
    const col = st.zone ? C.Z_COLORS[st.zone[1] - 1] : 'var(--muted)';
    const sub = st.zone ? C.zoneLabel(st.zone) + ' · ' + C.zoneBpm(st.zone, max) : (st.kind === 'lift' ? st.sets + ' sets of ' + st.reps + ' · about ' + C.fmtDur(st.sec) + ' with rest' : 'No heart rate target');
    const title = st.kind === 'lift' ? st.move : st.label + ' · ' + C.fmtClock(st.sec);
    const when = start == null ? '' : '<span class="when">' + C.fmtClock(start) + '–' + C.fmtClock(start + st.sec) + '</span>';
    return '<div class="step"><span class="bar" style="background:' + col + '"></span><div class="grow"><div class="step-name">' + esc(title) + '</div><div class="muted small">' + esc(sub) + '</div></div>' + when + '</div>';
  }

  function zoneTable(s) {
    const zt = C.zoneTime(s.blocks), tot = zt.reduce((a, b) => a + b, 0);
    if (!tot) return '';
    return '<section class="card"><span class="eyebrow">TIME IN EACH ZONE</span>' + zt.map((sec, i) => !sec ? '' :
      '<div class="zt"><span class="zdot" style="background:' + C.Z_COLORS[i] + '"></span><span class="grow">Zone ' + (i + 1) + ' · ' + C.Z_NAMES[i] + '</span><span class="zt-bar"><span style="width:' + Math.round(sec / tot * 100) + '%;background:' + C.Z_COLORS[i] + '"></span></span><span class="zt-t">' + C.fmtDur(sec) + '</span></div>').join('') + '</section>';
  }

  function viewDetail() {
    const s = sessionFor(UI.detail);
    const max = C.maxHrFor(S);
    const canEdit = s.date >= today();
    let h = '<header class="top"><button class="icon-btn" data-action="back" aria-label="Back">' + ICON.back + '</button><div class="grow"><h1 class="h-sm">' + esc(s.name) + '</h1><div class="sub">' + esc(fmtDate(s.date) + ' · ' + (s.blocks.length ? C.fmtDur(C.totalSec(s.blocks)) : 'rest day')) + '</div></div>' +
      (canEdit ? '<button class="icon-btn" data-action="edit" aria-label="Edit workout">' + ICON.edit + '</button>' : '') + '</header>';
    if (s.type === 'rest') {
      h += '<section class="card note-card">' + ICON.rest + '<span>' + esc(s.notes[0] || 'Rest day. An easy walk or 10 minutes of mobility is plenty.') + '</span></section>';
      if (canEdit) h += '<button class="btn" data-action="edit">Add a workout this day</button>';
      if (s.edited) h += '<button class="btn ghost" data-action="reset">Reset to the plan</button>';
      return h;
    }
    if (s.notes.length) h += s.notes.map((n, i) => '<div class="why ' + (i === 0 && (s.adjusted || s.edited) ? '' : 'calm') + '">' + ICON.info + '<span>' + esc(n) + '</span></div>').join('');
    if (s.sport !== 'WeightTraining') h += '<section class="card">' + shapeBar(s, 64) + '<div class="row-between tiny"><span>0:00</span><span>' + C.fmtClock(C.totalSec(s.blocks)) + '</span></div></section>';
    h += '<span class="eyebrow">STEPS</span><div class="list">';
    let t = 0;
    s.blocks.forEach(b => {
      if (b.repeat) {
        const round = b.steps.reduce((a, x) => a + x.sec, 0);
        h += '<div class="card repeat"><div class="row-between"><span class="rep">REPEAT ' + b.repeat + '×</span><span class="when">' + C.fmtClock(t) + '–' + C.fmtClock(t + round * b.repeat) + '</span></div>' +
          b.steps.map(x => stepRow(x, max, null)).join('') +
          '<div class="tiny">Each round ' + C.fmtClock(round) + ' · ' + C.fmtDur(round * b.repeat) + ' in total</div></div>';
        t += round * b.repeat;
      } else {
        h += '<div class="card">' + stepRow(b, max, t) + '</div>';
        t += b.sec;
      }
    });
    h += '</div>';
    if (s.sport !== 'WeightTraining') h += zoneTable(s);
    if (canEdit) h += '<button class="btn" data-action="edit">' + ICON.edit + ' Edit this workout</button>';
    if (s.edited) h += '<button class="btn ghost" data-action="reset">Reset to the plan</button>';
    if (s.sport !== 'WeightTraining') {
      h += '<span class="eyebrow">ON YOUR WATCH</span><section class="card flat">' +
        '<div class="kv"><b>Step changes</b><span class="muted small">The fenix beeps, buzzes and shows the next step and its target.</span></div>' +
        '<div class="kv"><b>Out-of-zone alerts</b><span class="muted small">Alerts when your heart rate leaves the step\'s range, until you\'re back in it.</span></div>' +
        '<label class="toggle"><span><b>Easy-day ceiling</b><span class="muted small">Easy steps target Zone 1–2, so you only hear about it when you go too hard.</span></span><input type="checkbox" data-setting="easyCeiling"' + (S.easyCeiling !== false ? ' checked' : '') + '></label>' +
        '<div class="tiny">Beep vs vibrate is set on the watch in the run and bike activity settings.</div></section>';
    } else {
      h += '<section class="card note-card">' + ICON.watch + '<span>On the fenix this shows up as a strength workout with one timed step per exercise. Keep this screen handy for the moves and reps.</span></section>';
    }
    h += '<details class="card flat"><summary>Workout text sent to Intervals.icu</summary><pre>' + esc(C.icuText(s)) + '</pre></details>';
    h += '<button class="btn primary" data-action="send"' + (UI.sending ? ' disabled' : '') + '>' + (UI.sending ? 'Sending…' : 'Send next 7 days to watch') + '</button><div class="tiny center">' + esc(sentLine(s.date)) + '</div>';
    return h;
  }

  /* ---------------- editor ---------------- */
  function draftFrom(s) {
    return C.clone({ type: s.type, sport: s.sport, name: s.name, focus: s.focus || '', blocks: s.blocks || [] });
  }
  function startEdit(date) {
    let s = sessionFor(date);
    if (s.type === 'rest') s = C.buildSession('easyRun', date, settings());
    UI.edit = { date, draft: draftFrom(s) };
    UI.detail = null;
  }
  // path "3" -> blocks[3]; "3.1" -> blocks[3].steps[1]
  function locate(path) {
    const d = UI.edit.draft, p = String(path).split('.').map(Number);
    if (p.length === 1) return { arr: d.blocks, i: p[0], item: d.blocks[p[0]] };
    const parent = d.blocks[p[0]];
    return { arr: parent.steps, i: p[1], item: parent.steps[p[1]], parent };
  }
  const clampSec = x => Math.max(10, Math.min(4 * 3600, Math.round(x)));

  function durInputs(st, path) {
    const m = Math.floor(st.sec / 60), s = st.sec % 60;
    const secOpts = [0, 15, 30, 45].concat([0, 15, 30, 45].includes(s) ? [] : [s]).sort((a, b) => a - b);
    return '<span class="dur"><input type="number" inputmode="numeric" min="0" max="240" value="' + m + '" data-ef="min" data-p="' + path + '" aria-label="Minutes"><span class="tiny">min</span>' +
      '<select data-ef="sec" data-p="' + path + '" aria-label="Seconds">' + secOpts.map(v => '<option value="' + v + '"' + (v === s ? ' selected' : '') + '>' + String(v).padStart(2, '0') + '</option>').join('') + '</select><span class="tiny">sec</span></span>';
  }
  function zoneSelect(st, path) {
    const cur = st.zone ? st.zone.join('-') : '';
    return '<select data-ef="zone" data-p="' + path + '" aria-label="Heart rate zone">' +
      '<option value=""' + (cur ? '' : ' selected') + '>No target</option>' +
      ZONE_OPTIONS.map(z => {
        const v = z.join('-'), r = C.zoneRanges(C.maxHrFor(S));
        const bpm = z[0] === 1 ? '<' + r[z[1] - 1].hi : r[z[0] - 1].lo + '–' + r[z[1] - 1].hi;
        return '<option value="' + v + '"' + (v === cur ? ' selected' : '') + '>Z' + (z[0] === z[1] ? z[0] : z[0] + '–' + z[1]) + ' · ' + bpm + '</option>';
      }).join('') + '</select>';
  }
  function moveBtns(path, i, n) {
    return '<span class="ed-btns">' +
      '<button class="mini" data-action="ed-up" data-p="' + path + '" aria-label="Move up"' + (i === 0 ? ' disabled' : '') + '>' + ICON.up + '</button>' +
      '<button class="mini" data-action="ed-down" data-p="' + path + '" aria-label="Move down"' + (i === n - 1 ? ' disabled' : '') + '>' + ICON.down + '</button>' +
      '<button class="mini danger" data-action="ed-del" data-p="' + path + '" aria-label="Delete">' + ICON.trash + '</button></span>';
  }
  function edStep(st, path, i, n) {
    const col = st.zone ? C.Z_COLORS[st.zone[1] - 1] : 'var(--line)';
    return '<div class="ed-step" style="border-left-color:' + col + '">' +
      '<div class="ed-row"><input type="text" value="' + esc(st.label) + '" data-ef="label" data-p="' + path + '" aria-label="Step name" maxlength="40">' + moveBtns(path, i, n) + '</div>' +
      '<div class="ed-row wrap">' + durInputs(st, path) + zoneSelect(st, path) + '</div></div>';
  }
  function edLift(b, path, i, n) {
    const setOpts = [1, 2, 3, 4, 5, 6].map(v => '<option value="' + v + '"' + (v === b.sets ? ' selected' : '') + '>' + v + ' sets</option>').join('');
    return '<div class="ed-step" style="border-left-color:var(--muted)">' +
      '<div class="ed-row"><input type="text" value="' + esc(b.move) + '" data-ef="move" data-p="' + path + '" aria-label="Exercise" maxlength="40">' + moveBtns(path, i, n) + '</div>' +
      '<div class="ed-row wrap"><select data-ef="sets" data-p="' + path + '" aria-label="Sets">' + setOpts + '</select>' +
      '<label class="reps"><span class="tiny">reps</span><input type="text" value="' + esc(b.reps) + '" data-ef="reps" data-p="' + path + '" aria-label="Reps" maxlength="24"></label></div></div>';
  }

  function viewEdit() {
    const E = UI.edit, d = E.draft;
    const typeOpts = '<option value="">Keep current</option>' + Object.keys(C.SESSION_TYPES).map(k => '<option value="' + k + '">' + C.SESSION_TYPES[k].label + '</option>').join('');
    let h = '<header class="top"><button class="icon-btn" data-action="ed-cancel" aria-label="Cancel editing">' + ICON.back + '</button><div class="grow"><h1 class="h-sm">Edit workout</h1><div class="sub">' + esc(fmtDate(E.date, true)) + '</div></div></header>';
    h += '<section class="card"><label class="field"><span>Name</span><input type="text" value="' + esc(d.name) + '" data-ed="name" maxlength="60"></label>' +
      '<label class="field"><span>Start over from a plan workout</span><select data-ed="type">' + typeOpts + '</select></label></section>';

    if (!d.sport) {
      h += '<section class="card note-card">' + ICON.rest + '<span>This day is set to rest. Saving keeps it a rest day; pick a workout above to add one.</span></section>';
    } else if (d.sport === 'WeightTraining') {
      const warm = d.blocks.findIndex(b => b.kind !== 'lift');
      const lifts = d.blocks.map((b, i) => ({ b, i })).filter(x => x.b.kind === 'lift');
      if (warm >= 0) h += '<section class="card"><div class="ed-row"><b class="grow">Warm-up</b>' + durInputs(d.blocks[warm], warm) + '</div></section>';
      h += '<span class="eyebrow">EXERCISES</span><div class="list">' + lifts.map((x, k) => edLift(x.b, x.i, k, lifts.length)).join('') + '</div>' +
        '<button class="btn" data-action="ed-add-lift">' + ICON.plus + ' Add exercise</button>' +
        '<div class="tiny">Each exercise gets about 2 minutes per set, rest included, on the watch timer.</div>';
    } else {
      h += '<section class="card">' + shapeBar(d, 40) + '<div class="row-between tiny"><span>Total ' + C.fmtDur(C.totalSec(d.blocks)) + '</span><span>' + d.blocks.length + ' blocks</span></div></section>';
      h += '<span class="eyebrow">STEPS</span><div class="list">';
      d.blocks.forEach((b, i) => {
        if (b.repeat) {
          h += '<div class="card repeat ed-rep"><div class="ed-row"><input type="text" value="' + esc(b.label) + '" data-ef="replabel" data-p="' + i + '" aria-label="Repeat name" maxlength="30">' + moveBtns(i, i, d.blocks.length) + '</div>' +
            '<div class="ed-row"><span class="rep grow">REPEAT</span><button class="mini" data-action="ed-rep" data-d="-1" data-p="' + i + '" aria-label="One fewer round"' + (b.repeat <= 1 ? ' disabled' : '') + '>' + ICON.minus + '</button><b class="count">' + b.repeat + '×</b><button class="mini" data-action="ed-rep" data-d="1" data-p="' + i + '" aria-label="One more round"' + (b.repeat >= 30 ? ' disabled' : '') + '>' + ICON.plus + '</button></div>' +
            b.steps.map((st, j) => edStep(st, i + '.' + j, j, b.steps.length)).join('') +
            '<button class="btn small-btn" data-action="ed-add-step" data-p="' + i + '">' + ICON.plus + ' Step in this repeat</button></div>';
        } else {
          h += '<div class="card">' + edStep(b, String(i), i, d.blocks.length) + '</div>';
        }
      });
      h += '</div><div class="grid2"><button class="btn" data-action="ed-add-step">' + ICON.plus + ' Step</button><button class="btn" data-action="ed-add-rep">' + ICON.plus + ' Repeat block</button></div>';
    }
    h += '<button class="btn primary" data-action="ed-save">' + (isDemo() ? 'Save' : 'Save and send to watch') + '</button>' +
      '<button class="btn ghost" data-action="ed-cancel">Cancel</button>';
    return h;
  }

  function editAction(a, el) {
    const d = UI.edit.draft, p = el.dataset.p;
    if (a === 'ed-up' || a === 'ed-down') {
      const L = locate(p), j = L.i + (a === 'ed-up' ? -1 : 1);
      if (j < 0 || j >= L.arr.length) return;
      const tmp = L.arr[j]; L.arr[j] = L.arr[L.i]; L.arr[L.i] = tmp;
    } else if (a === 'ed-del') {
      const L = locate(p);
      L.arr.splice(L.i, 1);
      if (L.parent && !L.parent.steps.length) d.blocks.splice(Number(p.split('.')[0]), 1);
    } else if (a === 'ed-rep') {
      const b = d.blocks[Number(p)];
      b.repeat = Math.max(1, Math.min(30, b.repeat + Number(el.dataset.d)));
    } else if (a === 'ed-add-step') {
      const z = d.sport === 'Ride' || d.sport === 'Run' ? (S.easyCeiling !== false ? [1, 2] : [2, 2]) : null;
      const st = { label: 'Easy', sec: 300, zone: z, kind: 'easy' };
      if (p != null) d.blocks[Number(p)].steps.push(st); else d.blocks.push(st);
    } else if (a === 'ed-add-rep') {
      d.blocks.push({ repeat: 3, label: 'Intervals', steps: [
        { label: 'Work', sec: 180, zone: [4, 4], kind: 'work' },
        { label: 'Recover', sec: 120, zone: [1, 1], kind: 'rec' }] });
    } else if (a === 'ed-add-lift') {
      d.blocks.push({ label: '', sec: 360, zone: null, kind: 'lift', move: 'New exercise', sets: 3, reps: '10' });
      d.blocks[d.blocks.length - 1].label = C.liftLabel(d.blocks[d.blocks.length - 1]);
    } else if (a === 'ed-save') { saveEdit(); return; }
    else if (a === 'ed-cancel') { UI.detail = UI.edit.date; UI.edit = null; }
    render();
  }

  function editField(el) {
    const d = UI.edit.draft;
    if (el.dataset.ed === 'name') { d.name = el.value.trim() || d.name; return; }
    if (el.dataset.ed === 'type') {
      if (!el.value) return;
      const s = C.buildSession(el.value, UI.edit.date, settings());
      UI.edit.draft = draftFrom(s);
      render(); return;
    }
    const L = locate(el.dataset.p), it = L.item, f = el.dataset.ef;
    if (!it) return;
    if (f === 'label') it.label = el.value.trim() || it.label;
    else if (f === 'replabel') it.label = el.value.trim() || 'Intervals';
    else if (f === 'min') it.sec = clampSec((Math.max(0, Number(el.value) || 0)) * 60 + it.sec % 60);
    else if (f === 'sec') it.sec = clampSec(Math.floor(it.sec / 60) * 60 + Number(el.value));
    else if (f === 'zone') it.zone = el.value ? el.value.split('-').map(Number) : null;
    else if (f === 'move') it.move = el.value.trim() || it.move;
    else if (f === 'sets') { it.sets = Number(el.value); it.sec = it.sets * 120; }
    else if (f === 'reps') it.reps = el.value.trim() || it.reps;
    if (it.kind === 'lift') it.label = C.liftLabel(it);
    if (f === 'zone' && it.zone) it.kind = it.zone[1] >= 3 ? 'work' : (it.kind === 'work' ? 'easy' : it.kind);
    render();
  }

  function saveEdit() {
    const E = UI.edit, d = E.draft;
    if (d.sport && !d.blocks.length) { toast('Add at least one step, or pick Rest under "Start over".', true); return; }
    S.overrides[E.date] = { type: d.type, sport: d.sport, name: d.name, focus: d.focus, blocks: d.blocks, notes: [] };
    saveSettings();
    UI.detail = E.date; UI.edit = null; render();
    if (isDemo()) toast('Saved. Connect Intervals.icu in Settings to send it to your watch.');
    else if (C.daysBetween(today(), E.date) <= 6) sendWeek();
    else toast('Saved. It goes to your watch when it is within 7 days.');
  }

  function resetDay(date) {
    delete S.overrides[date]; saveSettings(); render();
    if (!isDemo() && C.daysBetween(today(), date) <= 6) sendWeek();
    else toast('Back to the planned workout.');
  }

  function viewZones() {
    const max = C.maxHrFor(S);
    const est = !(Number(S.maxHr) > 0);
    const ranges = C.zoneRanges(max);
    const r = ready();
    const runSet = (D.sport || []).find(s => (s.types || []).includes('Run'));
    let h = header('Heart rate zones', '% of max heart rate') + banner();
    h += '<div class="grid2"><label class="card stat"><span class="ml">Max heart rate (bpm)</span><input type="number" inputmode="numeric" min="120" max="230" placeholder="' + C.estMaxHr(S.age) + '" value="' + esc(S.maxHr) + '" data-setting="maxHr"><span class="ms' + (est ? ' warn' : '') + '">' + (est ? 'Estimated from age ' + esc(S.age) : 'Your measured max') + '</span></label>' +
      '<div class="card stat"><span class="ml">Resting heart rate</span><span class="big">' + (r && r.metrics.rhr ? r.metrics.rhr.value : '—') + ' <small>bpm</small></span><span class="ms">' + (r && r.metrics.rhr ? 'From your watch' : 'No data yet') + '</span></div></div>';
    h += '<div class="list">' + ranges.slice().reverse().map(z => '<div class="card zone"><span class="zbadge" style="background:' + C.Z_COLORS[z.zone - 1] + '">' + z.zone + '</span><div class="grow"><div class="step-name">' + C.Z_NAMES[z.zone - 1] + '</div><div class="muted small">' + C.Z_USES[z.zone - 1] + '</div></div><span class="zr">' + (z.zone === 1 ? '< ' + z.hi : z.lo + '–' + z.hi) + '</span></div>').join('') + '</div>';
    if (!isDemo() && D.loaded) {
      const icuTops = runSet && runSet.hr_zones ? runSet.hr_zones.slice(0, 5) : null;
      const match = icuTops && icuTops.join() === C.zoneTops(max).join() && runSet.max_hr === max;
      h += '<section class="card ' + (match ? '' : 'warn-card') + '"><b>' + (match ? 'Intervals.icu matches' : 'Intervals.icu zones differ') + '</b><span class="muted small">' +
        (runSet ? 'Intervals.icu Run: max ' + esc(runSet.max_hr || '—') + ', zone tops ' + esc(icuTops ? icuTops.join(' / ') : 'not set') + '. Workouts use Intervals.icu\'s zones, so keep them in step.' : 'Could not read your Intervals.icu sport settings.') +
        '</span>' + (match ? '' : '<button class="btn" data-action="syncZones"' + (UI.syncingZones ? ' disabled' : '') + '>' + (UI.syncingZones ? 'Copying…' : 'Copy these zones to Intervals.icu') + '</button>') + '</section>';
    }
    h += '<section class="card tip"><b>Make these yours</b><span class="small">Age formulas can be off by 10+ bpm. After a few hard efforts, use the highest heart rate you\'ve seen as your max. Set the same max in Garmin Connect\'s heart rate zones so the watch agrees.</span></section>';
    return h;
  }

  function viewSettings() {
    const opts = Object.keys(C.SESSION_TYPES).map(k => '<option value="' + k + '">' + C.SESSION_TYPES[k].label + '</option>');
    const sel = day => '<select data-schedule="' + day + '" aria-label="' + day + ' session">' + opts.map(o => o.replace('value="' + S.schedule[day] + '"', 'value="' + S.schedule[day] + '" selected')).join('') + '</select>';
    let h = header('Settings', 'Pace') + (D.error && !isDemo() ? '<div class="banner err">' + esc(D.error) + '</div>' : '');
    h += '<section class="card"><span class="eyebrow">INTERVALS.ICU</span>' +
      '<label class="field"><span>API key</span><input type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Paste from Intervals.icu → Settings → Developer" value="' + esc(S.apiKey) + '" data-setting="apiKey"></label>' +
      '<label class="field"><span>Athlete ID <small class="muted">(0 = you)</small></span><input type="text" autocapitalize="off" value="' + esc(S.athleteId) + '" data-setting="athleteId"></label>' +
      '<button class="btn" data-action="test">Test connection</button>' +
      '<ol class="steps-help small"><li>In Intervals.icu, connect Garmin and turn on <b>Upload planned workouts</b>.</li><li>Under Settings → Developer Settings, create an API key and paste it above.</li><li>The key stays on this phone only.</li></ol></section>';
    h += '<section class="card"><span class="eyebrow">YOU</span><div class="grid2">' +
      '<label class="field"><span>Age</span><input type="number" inputmode="numeric" value="' + esc(S.age) + '" data-setting="age"></label>' +
      '<label class="field"><span>Plan start</span><input type="date" value="' + esc(S.planStart || C.mondayOf(today())) + '" data-setting="planStart"></label></div></section>';
    h += '<section class="card"><span class="eyebrow">WEEKLY SCHEDULE</span>' + C.DAY_KEYS.map((d, i) => '<label class="sched"><span>' + C.DAY_SHORT[i] + '</span>' + sel(d) + '</label>').join('') +
      '<div class="tiny">Keep hard days apart: Run workout, Long run and Long ride work best with an easy day or rest between them.</div></section>';
    h += '<section class="card"><span class="eyebrow">BEHAVIOR</span>' +
      '<label class="toggle"><span><b>Update the watch when I open Pace</b><span class="muted small">Once a day, re-sends the next 7 days so today\'s readiness changes reach the fenix.</span></span><input type="checkbox" data-setting="autoSend"' + (S.autoSend ? ' checked' : '') + '></label>' +
      '<label class="toggle"><span><b>Easy-day ceiling</b><span class="muted small">Easy steps target Zone 1–2 instead of Zone 2 only.</span></span><input type="checkbox" data-setting="easyCeiling"' + (S.easyCeiling !== false ? ' checked' : '') + '></label></section>';
    return h;
  }

  /* ---------------- render ---------------- */
  function render() {
    const v = UI.edit ? viewEdit() : UI.detail ? viewDetail() : ({ today: viewToday, plan: viewPlan, zones: viewZones, settings: viewSettings }[UI.view])();
    document.getElementById('view').innerHTML = v;
    document.querySelectorAll('nav [data-view]').forEach(b => b.setAttribute('aria-current', !UI.detail && !UI.edit && b.dataset.view === UI.view ? 'page' : 'false'));
  }

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    if (a.indexOf('ed-') === 0) { if (UI.edit) editAction(a, el); return; }
    if (a === 'edit') { startEdit(UI.detail); render(); window.scrollTo(0, 0); return; }
    if (a === 'reset') { resetDay(UI.detail); return; }
    if (a === 'go') {
      if (UI.edit && !confirm('Leave without saving your changes?')) return;
      UI.view = el.dataset.view; UI.detail = null; UI.edit = null; render(); window.scrollTo(0, 0);
    }
    else if (a === 'open') { UI.detail = el.dataset.date; render(); window.scrollTo(0, 0); }
    else if (a === 'back') { UI.detail = null; render(); }
    else if (a === 'week') { UI.weekOffset = Number(el.dataset.off); render(); }
    else if (a === 'send') sendWeek();
    else if (a === 'refresh') loadAll({ skipAuto: true });
    else if (a === 'syncZones') syncZones();
    else if (a === 'test') testConnection();
  });

  document.addEventListener('change', e => {
    const el = e.target;
    if (UI.edit && (el.dataset.ed || el.dataset.ef)) { editField(el); return; }
    if (el.dataset.setting) {
      const k = el.dataset.setting;
      const was = S[k];
      S[k] = el.type === 'checkbox' ? el.checked : el.value.trim();
      if (k === 'age') S.age = Number(S.age) || 36;
      if (k === 'apiKey' && S.apiKey && !S.planStart) S.planStart = C.mondayOf(today());
      saveSettings();
      if ((k === 'apiKey' || k === 'athleteId') && was !== S[k]) { D.athlete = null; loadAll({ skipAuto: true }); return; }
      render();
    } else if (el.dataset.schedule) {
      S.schedule[el.dataset.schedule] = el.value; saveSettings(); render();
    }
  });

  window.addEventListener('pageshow', () => loadAll());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && D.loaded && !isDemo() && (S.lastSent || '').slice(0, 10) !== today()) loadAll();
  });
})();
