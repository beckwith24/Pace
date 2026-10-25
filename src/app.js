/* Pace UI: state, Intervals.icu sync, screens. Depends on PaceCore, PaceLibrary, PaceCharts. */
(function () {
  const C = PaceCore, LIB = PaceLibrary, CH = PaceCharts;
  const LS_KEY = 'pace.v1', DATA_KEY = 'pace.data.v1';
  const BASE = 'https://intervals.icu/api/v1';
  const VERSION = '2.0';
  const C1 = '#3987e5', C2 = '#d95926';

  const DEFAULTS = {
    apiKey: '', athleteId: '0', age: 36, maxHr: '', planStart: '',
    schedule: Object.assign({}, C.DEFAULT_SCHEDULE), easyCeiling: true, autoSend: true, lastSent: '',
    overrides: {}, units: 'imperial',
  };
  const ZONE_OPTIONS = [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [1, 2], [2, 3], [3, 4], [4, 5]];
  const PW_OPTIONS = [[45, 55], [56, 65], [65, 75], [76, 85], [88, 93], [95, 100], [100, 105], [106, 120], [120, 150]];
  const KIND_LABEL = { run: 'Run', treadmill: 'Treadmill', ride: 'Ride', zwift: 'Zwift', hike: 'Hike', strength: 'Strength', rest: 'Rest' };

  /* ---------------- settings ---------------- */
  function loadSettings() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch (e) { s = {}; }
    const out = Object.assign({}, DEFAULTS, s);
    out.schedule = Object.assign({}, C.DEFAULT_SCHEDULE, s.schedule || {});
    Object.keys(out.schedule).forEach(k => { if (!C.SESSION_TYPES[out.schedule[k]]) out.schedule[k] = 'rest'; });
    out.overrides = (s.overrides && typeof s.overrides === 'object') ? s.overrides : {};
    const cutoff = C.addDays(C.ymd(new Date()), -14);
    Object.keys(out.overrides).forEach(d => { if (d < cutoff) delete out.overrides[d]; });
    return out;
  }
  function saveSettings() { try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) { /* private mode */ } }

  let S = loadSettings();
  const EMPTY = () => ({ wellness: [], activities: [], events: [], sport: [], athlete: null, loaded: false, syncedAt: null, error: '' });
  let D = EMPTY();
  const SYNC = { loading: false, sending: false, zones: false, testing: false, label: '' };
  const UI = {
    view: 'today', detail: null, edit: null, sheet: null, sub: null, planWeek: 0,
    lib: { cat: 'all', q: '', open: null, date: null, pick: null },
    data: { tab: 'trends', range: 42, act: null, day: null },
  };

  const today = () => C.ymd(new Date());
  const isDemo = () => !S.apiKey;
  const athleteId = () => (S.athleteId || '0').trim() || '0';
  const demoStart = () => C.addDays(C.mondayOf(today()), -14);
  const busy = () => SYNC.loading || SYNC.sending || SYNC.zones || SYNC.testing;
  function settings() { return Object.assign({}, S, { planStart: isDemo() ? demoStart() : (S.planStart || C.mondayOf(today())) }); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  const pad = n => String(n).padStart(2, '0');

  /* ---------------- cached data (instant open, works offline) ---------------- */
  const cacheKey = () => athleteId() + ':' + (S.apiKey || '').slice(-6);
  function loadCache() {
    if (isDemo()) return;
    try {
      const c = JSON.parse(localStorage.getItem(DATA_KEY) || 'null');
      if (c && c.key === cacheKey()) D = Object.assign(EMPTY(), c, { loaded: true, error: '' });
    } catch (e) { /* ignore */ }
  }
  function saveCache() {
    if (isDemo()) return;
    const c = { key: cacheKey(), wellness: D.wellness, activities: D.activities, events: D.events, sport: D.sport, athlete: D.athlete, syncedAt: D.syncedAt };
    try { localStorage.setItem(DATA_KEY, JSON.stringify(c)); } catch (e) { try { localStorage.removeItem(DATA_KEY); } catch (_) { /* ignore */ } }
  }

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
      const err = new Error("Couldn't reach Intervals.icu. Check your connection and try again."); err.status = 0; throw err;
    }
    if (!res.ok) {
      let t = ''; try { t = (await res.text()).slice(0, 300); } catch (e) { /* ignore */ }
      const err = new Error(res.status === 401 || res.status === 403 ? 'Intervals.icu rejected the API key or athlete ID (HTTP ' + res.status + ').' : 'Intervals.icu error ' + res.status + (t ? ': ' + t.slice(0, 140) : ''));
      err.status = res.status; err.body = t; throw err;
    }
    if (res.status === 204) return null;
    const ct = res.headers.get('content-type') || '';
    return ct.includes('json') ? res.json() : res.text();
  }

  /* Demo data: a realistic three months so every screen has something to show. */
  function rng(seed) { return () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function demoData() {
    const t = today(), r = rng(11), wellness = [], activities = [];
    const st = Object.assign({}, S, { planStart: demoStart(), overrides: {}, schedule: C.DEFAULT_SCHEDULE });
    let ctl = 16, atl = 16, hrvBase = 50;
    for (let i = 119; i >= 0; i--) {
      const d = C.addDays(t, -i);
      let load = 0, hard = false;
      if (i > 0 && i <= 91) {
        const sess = C.buildSession(st.schedule[C.DAY_KEYS[C.dayIndex(d)]], d, Object.assign({}, st, { planStart: C.addDays(C.mondayOf(t), -91) }));
        if (sess.sport && r() < 0.87) {
          const sec = Math.round(C.totalSec(sess.blocks) * (0.92 + r() * 0.16));
          hard = sess.hard;
          const isLift = sess.sport === 'WeightTraining';
          const avgHr = Math.round(isLift ? 108 + r() * 10 : hard ? 146 + r() * 8 : 126 + r() * 8);
          const speed = { Run: 2.7, Ride: 7.1, VirtualRide: 8.2, Hike: 1.3 }[sess.sport] || 0;
          load = Math.round(sec / 60 * (hard ? 1.2 : isLift ? 0.45 : 0.75));
          const zt = isLift ? [sec * 0.6, sec * 0.35, sec * 0.05, 0, 0] : hard ? [sec * 0.2, sec * 0.35, sec * 0.15, sec * 0.27, sec * 0.03] : [sec * 0.25, sec * 0.68, sec * 0.07, 0, 0];
          activities.push({
            id: 'demo' + i, start_date_local: d + 'T0' + (6 + Math.floor(r() * 3)) + ':' + pad(Math.floor(r() * 59)) + ':00', type: sess.sport, name: sess.name,
            moving_time: sec, elapsed_time: Math.round(sec * 1.04), distance: Math.round(speed * sec), total_elevation_gain: speed ? Math.round(sec / 60 * (0.6 + r() * 1.4)) : 0,
            average_heartrate: avgHr, max_heartrate: avgHr + 14 + Math.round(r() * 10), average_speed: speed || null, average_cadence: sess.sport === 'Run' ? 82 + Math.round(r() * 5) : speed ? 86 + Math.round(r() * 6) : null,
            icu_training_load: load, icu_intensity: Math.round((hard ? 82 : 66) + r() * 6), trimp: Math.round(load * 1.1), calories: Math.round(sec / 60 * (isLift ? 6 : 11)),
            icu_hr_zone_times: zt.map(Math.round), icu_rpe: hard ? 7 : 4, feel: 2 + Math.round(r()), decoupling: speed ? +(r() * 6).toFixed(1) : null,
            icu_average_watts: sess.sport === 'VirtualRide' ? Math.round(150 + r() * 30) : null, source: 'GARMIN_CONNECT', device_name: 'fēnix 7',
          });
        }
      }
      ctl += (load - ctl) / 42; atl += (load - atl) / 7;
      hrvBase += (51 - hrvBase) * 0.1 + (r() - 0.5) * 1.5;
      wellness.push({
        id: d, hrv: Math.round(hrvBase + (r() - 0.5) * 8 - (hard ? 3 : 0)), restingHR: Math.round(54 + (r() - 0.5) * 3 + (hard ? 1 : 0)),
        sleepSecs: Math.round((6.7 + r() * 1.5) * 3600), sleepScore: Math.round(68 + r() * 22), avgSleepingHR: Math.round(52 + r() * 4),
        ctl: +ctl.toFixed(1), atl: +atl.toFixed(1), rampRate: +((r() - 0.3) * 3).toFixed(1), weight: +(82 + (r() - 0.5) * 1.2).toFixed(1), steps: Math.round(6000 + r() * 6000),
      });
    }
    const w = wellness[wellness.length - 1]; w.hrv = 45; w.restingHR = 56; w.sleepSecs = 7.1 * 3600;
    return {
      wellness, activities, events: [], athlete: { name: 'Demo athlete' }, loaded: true, error: '', syncedAt: new Date().toISOString(),
      sport: [{ id: 2, types: ['Run'], max_hr: 184, hr_zones: [110, 129, 147, 166, 184] }, { id: 1, types: ['Ride', 'VirtualRide'], max_hr: 184, hr_zones: [110, 129, 147, 166, 184], ftp: 215 }],
    };
  }

  async function loadAll(opts) {
    opts = opts || {};
    if (isDemo()) { D = demoData(); renderSoft(); return; }
    if (SYNC.loading) return;
    SYNC.loading = true; SYNC.label = 'Syncing…';
    if (!D.loaded) renderSoft(); else paintStatus();
    const t = today(), id = athleteId();
    const r = await Promise.allSettled([
      api('/athlete/' + id + '/wellness?oldest=' + C.addDays(t, -119) + '&newest=' + t),
      api('/athlete/' + id + '/activities?oldest=' + C.addDays(C.mondayOf(t), -98) + '&newest=' + C.addDays(t, 1)),
      api('/athlete/' + id + '/events?oldest=' + C.addDays(t, -14) + '&newest=' + C.addDays(t, 21) + '&category=WORKOUT'),
      api('/athlete/' + id + '/sport-settings'),
      api('/athlete/' + id),
    ]);
    const val = (x, fb) => (x.status === 'fulfilled' && x.value != null) ? x.value : fb;
    const failed = r.filter(x => x.status === 'rejected');
    if (failed.length === r.length) {
      D.error = failed[0].reason.message;
    } else {
      D = Object.assign(D, {
        wellness: Array.isArray(val(r[0])) ? r[0].value : D.wellness,
        activities: Array.isArray(val(r[1])) ? r[1].value : D.activities,
        events: Array.isArray(val(r[2])) ? r[2].value : D.events,
        sport: Array.isArray(val(r[3])) ? r[3].value : D.sport,
        athlete: val(r[4], D.athlete), loaded: true, syncedAt: new Date().toISOString(),
        error: failed.length ? 'Some data did not load: ' + failed[0].reason.message : '',
      });
      saveCache();
    }
    SYNC.loading = false; SYNC.label = '';
    renderSoft();
    if (!D.error && S.autoSend && !opts.skipAuto && (S.lastSent || '').slice(0, 10) !== t) sendWeek({ quiet: true });
  }

  /* ---------------- plan helpers ---------------- */
  function ready(date) { return C.readiness(D.wellness, date || today()); }
  function plan(from, n) {
    return C.planDays(settings(), from, n, { today: today(), readiness: ready(), activities: D.loaded ? D.activities : null, overrides: S.overrides });
  }
  function sessionFor(date) { return plan(date, 1)[0]; }
  function sentEvent(date) { return (D.events || []).find(e => e.external_id === C.externalId(date)); }
  const within7 = date => date >= today() && C.daysBetween(today(), date) <= 6;
  function ftp() { const s = (D.sport || []).find(x => (x.types || []).includes('VirtualRide') || (x.types || []).includes('Ride')); return s && s.ftp ? s.ftp : null; }
  function pickFields(s) {
    return C.clone({ type: s.type, sport: s.sport, treadmill: !!s.treadmill, indoor: !!s.indoor, name: s.name, focus: s.focus || '', blocks: s.blocks || [],
      notes: (s.notes || []).filter(n => n.indexOf('You changed') !== 0 && n.indexOf('You edited') !== 0) });
  }

  /* ---------------- actions that talk to Intervals.icu ---------------- */
  async function sendWeek(o) {
    o = o || {};
    if (isDemo()) { toast((o.prefix ? o.prefix + ' ' : '') + 'Connect Intervals.icu in Settings to send workouts.'); return; }
    if (SYNC.sending) { SYNC.resend = o; return; } // a change arrived mid-send: send again when this one finishes
    SYNC.sending = true; SYNC.resend = null;
    const step = label => { SYNC.label = label; paintStatus(); };
    try {
      const t = today(), id = athleteId();
      const days = plan(t, 7).filter(d => d.type !== 'rest' && d.sport);
      const events = days.map(C.toEvent);
      step('Checking your calendar…');
      const existing = await api('/athlete/' + id + '/events?oldest=' + t + '&newest=' + C.addDays(t, 6) + '&category=WORKOUT') || [];
      const keep = new Set(events.map(e => e.external_id));
      const stale = existing.filter(e => e.external_id && e.external_id.indexOf('pace-') === 0 && !keep.has(e.external_id));
      for (let i = 0; i < stale.length; i++) {
        step('Removing old workout ' + (i + 1) + ' of ' + stale.length + '…');
        await api('/athlete/' + id + '/events/' + stale[i].id, { method: 'DELETE' });
      }
      if (events.length) {
        step('Uploading ' + events.length + ' workouts…');
        try { await api('/athlete/' + id + '/events/bulk?upsert=true', { method: 'POST', body: events }); }
        catch (err) {
          if (err.status >= 400 && err.status < 500 && /indoor/i.test(err.body || '')) {
            events.forEach(e => delete e.indoor);
            await api('/athlete/' + id + '/events/bulk?upsert=true', { method: 'POST', body: events });
          } else throw err;
        }
      }
      S.lastSent = new Date().toISOString(); saveSettings();
      SYNC.sending = false;
      toast((o.prefix ? o.prefix + ' ' : '') + 'Sent ' + events.length + ' workouts for the next 7 days. Sync Garmin Connect to load them on your fenix.');
      await loadAll({ skipAuto: true });
    } catch (err) {
      toast(err.message, true);
    } finally {
      SYNC.sending = false; SYNC.label = ''; paintStatus();
      if (SYNC.resend) { const again = SYNC.resend; SYNC.resend = null; sendWeek(again); }
    }
  }

  async function syncZones() {
    if (isDemo()) { toast('Add your Intervals.icu API key in Settings first.'); return; }
    const targets = (D.sport || []).filter(s => (s.types || []).some(t => t === 'Run' || t === 'Ride'));
    if (!targets.length) { toast('No Run or Ride sport settings found in Intervals.icu.', true); return; }
    SYNC.zones = true; SYNC.label = 'Copying zones…'; paintStatus();
    const max = C.maxHrFor(S), tops = C.zoneTops(max);
    try {
      for (const s of targets) await api('/athlete/' + athleteId() + '/sport-settings/' + s.id, { method: 'PUT', body: { max_hr: max, hr_zones: tops, hr_zone_names: C.Z_NAMES } });
      SYNC.zones = false;
      toast('Zones copied to Intervals.icu for ' + targets.map(s => s.types[0]).join(' and ') + '.');
      await loadAll({ skipAuto: true });
    } catch (err) {
      toast(err.message + ' You can enter the zones by hand in Intervals.icu settings.', true);
    } finally { SYNC.zones = false; SYNC.label = ''; paintStatus(); }
  }

  async function testConnection() {
    if (isDemo()) { toast('Paste your API key first.'); return; }
    SYNC.testing = true; SYNC.label = 'Testing connection…'; paintStatus();
    try {
      const a = await api('/athlete/' + athleteId());
      D.athlete = a;
      SYNC.testing = false;
      toast('Connected' + (a && a.name ? ' as ' + a.name : '') + '.');
      await loadAll();
    } catch (err) { toast(err.message, true); }
    finally { SYNC.testing = false; SYNC.label = ''; paintStatus(); }
  }

  /* ---------------- exercise library (photos, how-to) ---------------- */
  let EXLIB = null, EXMAP = {}, exLoading = null;
  function loadExLib() {
    if (EXLIB || exLoading) return exLoading;
    exLoading = fetch('lib/exercises.json').then(r => r.ok ? r.json() : []).catch(() => []).then(j => {
      EXLIB = Array.isArray(j) ? j : [];
      EXLIB.forEach(e => { EXMAP[e.id] = e; });
      const el = UI.edit && UI.edit.picker && document.getElementById('pick-results');
      if (el) el.innerHTML = pickResults(); else render();
    });
    return exLoading;
  }
  const EQ_GROUPS = {
    dumbbell: { label: 'Dumbbell', eq: ['dumbbell'] },
    body: { label: 'Bodyweight', eq: ['body only', 'none'] },
    kettlebells: { label: 'Kettlebell', eq: ['kettlebells'] },
    other: { label: 'Bands & balls', eq: ['bands', 'exercise ball', 'medicine ball'] },
    all: { label: 'All', eq: null },
  };
  const cap = s => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);

  /* ---------------- toast & status ---------------- */
  let toastTimer;
  function toast(msg, isErr) {
    const el = document.getElementById('toast');
    el.textContent = msg; el.className = 'toast show' + (isErr ? ' err' : '');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.className = 'toast'; }, isErr ? 7000 : 4500);
  }
  function timeAgo(iso) {
    if (!iso) return '';
    const d = new Date(iso), mins = Math.round((Date.now() - d) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + ' min ago';
    if (C.ymd(d) === today()) return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  function chipInner() {
    if (busy()) return '<span class="spin" aria-hidden="true"></span><span>' + esc(SYNC.label || 'Updating…') + '</span>';
    if (isDemo()) return '<span class="dot demo" aria-hidden="true"></span><span>Demo data</span>';
    if (D.error && !D.loaded) return ICON.warn + '<span>Sync problem</span>';
    if (D.error) return ICON.warn + '<span>Partly updated</span>';
    if (D.syncedAt) return ICON.check + '<span>Updated ' + esc(timeAgo(D.syncedAt)) + '</span>';
    return '<span class="dot" aria-hidden="true"></span><span>Not synced</span>';
  }
  function syncChip() { return '<button class="sync-chip' + (busy() ? ' busy' : '') + '" data-action="refresh" aria-label="Refresh data from Intervals.icu" aria-live="polite">' + chipInner() + '</button>'; }
  function spinLabel(label) { return '<span class="spin" aria-hidden="true"></span>' + esc(label); }
  function sendBtnInner() { return SYNC.sending ? spinLabel(SYNC.label || 'Sending…') : ICON.watch + ' Send next 7 days to watch'; }
  function paintStatus() {
    const b = busy();
    document.body.classList.toggle('busy', b);
    document.getElementById('progress').hidden = !b;
    document.querySelectorAll('.sync-chip').forEach(el => { el.innerHTML = chipInner(); el.classList.toggle('busy', b); });
    document.querySelectorAll('[data-send-btn]').forEach(el => { el.innerHTML = sendBtnInner(); el.disabled = SYNC.sending; });
    document.querySelectorAll('[data-test-btn]').forEach(el => { el.innerHTML = SYNC.testing ? spinLabel('Testing…') : 'Test connection'; el.disabled = SYNC.testing; });
    document.querySelectorAll('[data-zones-btn]').forEach(el => { el.innerHTML = SYNC.zones ? spinLabel('Copying…') : 'Copy these zones to Intervals.icu'; el.disabled = SYNC.zones; });
  }

  /* ---------------- icons ---------------- */
  const P = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
  const svg = (d, s) => '<svg width="' + (s || 20) + '" height="' + (s || 20) + '" viewBox="0 0 24 24" ' + P + '>' + d + '</svg>';
  const ICON = {
    run: svg('<circle cx="14" cy="4" r="2"/><path d="M7 21l3-6 3 2 2 5"/><path d="M6 12l3-4 4 1 3 3 3 1"/>', 22),
    treadmill: svg('<circle cx="13" cy="3.5" r="1.8"/><path d="M8 14l2.5-4 3 1.5 1.5 3.5"/><path d="M8 9l2.5-2.5 3 .8 2 2.2"/><path d="M3 19h14l4-4"/><circle cx="5" cy="21" r=".6"/><circle cx="15" cy="21" r=".6"/>', 22),
    ride: svg('<circle cx="6" cy="17" r="3.5"/><circle cx="18" cy="17" r="3.5"/><path d="M6 17l4-8h5l3 8"/><path d="M10 9l2 8"/><path d="M14 6h3"/>', 22),
    zwift: svg('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>', 22),
    hike: svg('<path d="M3 20l6-10 4 6 2-3 6 7z"/><circle cx="16" cy="5" r="2"/>', 22),
    strength: svg('<path d="M6 7v10M3 9v6M18 7v10M21 9v6M6 12h12"/>', 22),
    rest: svg('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>', 22),
    back: svg('<path d="M15 18l-6-6 6-6"/>'),
    chev: svg('<path d="M9 6l6 6-6 6"/>', 18),
    watch: svg('<circle cx="12" cy="12" r="6"/><path d="M9 3h6M9 21h6M12 9v3l2 1"/>', 18),
    check: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
    info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>', 18),
    warn: svg('<path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17h.01"/>', 16),
    edit: svg('<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>', 18),
    swap: svg('<path d="M7 7h12l-3-3M17 17H5l3 3"/>', 18),
    up: svg('<path d="M6 15l6-6 6 6"/>', 16),
    down: svg('<path d="M6 9l6 6 6-6"/>', 16),
    trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>', 16),
    plus: svg('<path d="M12 5v14M5 12h14"/>', 16),
    minus: svg('<path d="M5 12h14"/>', 16),
    easier: svg('<path d="M4 18h16M7 14l3-3 3 2 4-5"/>', 20),
    indoor: svg('<path d="M3 11l9-7 9 7v9H3z"/><path d="M9 20v-6h6v6"/>', 20),
    outdoor: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>', 20),
    book: svg('<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/>', 20),
    download: svg('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>', 18),
  };
  const kindIcon = s => ICON[C.kindOf(s)] || ICON.run;
  const catIcon = cat => ({ run: ICON.run, ride: ICON.ride, strength: ICON.strength, other: ICON.hike })[cat];

  /* ---------------- small pieces ---------------- */
  function fmtDate(s, style) {
    const d = C.parseYmd(s);
    if (style === 'long') return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    if (style === 'day') return d.toLocaleDateString(undefined, { weekday: 'short' }) + ' ' + d.getDate();
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }
  function header(title, sub, opts) {
    opts = opts || {};
    return '<header class="top">' + (opts.back ? '<button class="icon-btn" data-action="' + opts.back + '" aria-label="Back">' + ICON.back + '</button>' : '') +
      '<div class="grow"><h1 class="' + (opts.small ? 'h-sm' : '') + '">' + esc(title) + '</h1>' + (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') + '</div>' +
      (opts.right || '') + (opts.noChip ? '' : syncChip()) + '</header>';
  }
  function banner() {
    if (isDemo()) return '<div class="banner"><span><b>Demo mode.</b> You\'re looking at sample data.</span><button class="link" data-action="go-sub" data-sub="connection">Connect Intervals.icu</button></div>';
    if (D.error) return '<div class="banner err">' + ICON.warn + '<span>' + esc(D.error) + (D.syncedAt ? ' Showing data from ' + esc(timeAgo(D.syncedAt)) + '.' : '') + '</span></div>';
    return '';
  }
  const ZH = [22, 40, 60, 80, 100];
  function stepColor(st) { const l = C.stepLevel(st); return l ? C.Z_COLORS[l - 1] : 'var(--line)'; }
  function shapeBar(s, h) {
    const steps = C.flatSteps(s.blocks).filter(x => C.stepLevel(x) || x.kind === 'work');
    if (!steps.length) return '';
    return '<div class="shape" style="height:' + h + 'px" role="img" aria-label="Workout intensity by step">' +
      steps.map(x => { const l = C.stepLevel(x) || 4; return '<div style="flex:' + x.sec + ';height:' + ZH[l - 1] + '%;background:' + (C.stepLevel(x) ? stepColor(x) : 'var(--muted)') + '"></div>'; }).join('') + '</div>';
  }
  function thumbs(s) {
    const ex = (s.blocks || []).filter(b => b.kind === 'lift' && b.ex).slice(0, 6);
    if (!ex.length) return '';
    return '<div class="thumbs">' + ex.map(b => '<img src="' + esc(C.exImage(b.ex, 0)) + '" alt="' + esc(b.move) + '" loading="lazy" onerror="this.remove()">').join('') + '</div>';
  }
  function pill(s) {
    if (s.status === 'done') return '<span class="pill good">' + ICON.check + 'Done</span>';
    if (s.status === 'missed') return '<span class="pill red">Missed</span>';
    if (s.edited) return '<span class="pill blue">Changed</span>';
    if (s.adjusted) return '<span class="pill amber">Adjusted</span>';
    return '';
  }
  function watchLine(s) {
    if (!s.sport) return '';
    if (isDemo()) return '<div class="watch-line">' + ICON.watch + '<span>Demo: connect Intervals.icu to send this to your watch</span></div>';
    const ev = sentEvent(s.date);
    if (ev) return '<div class="watch-line ok">' + ICON.check + '<span>On your Intervals.icu calendar · syncs to ' + (s.sport === 'VirtualRide' ? 'Zwift and your fenix' : 'your fenix') + '</span></div>';
    if (within7(s.date)) return '<div class="watch-line">' + ICON.watch + '<span>Not sent yet</span></div>';
    return '<div class="watch-line">' + ICON.watch + '<span>Sends automatically when it\'s within 7 days</span></div>';
  }
  function sendBlock() {
    return '<button class="btn primary" data-action="send" data-send-btn' + (SYNC.sending ? ' disabled' : '') + '>' + sendBtnInner() + '</button>' +
      '<div class="tiny center">' + (S.lastSent && !isDemo() ? 'Last sent ' + esc(timeAgo(S.lastSent)) + ' · ' : '') + 'Pace → Intervals.icu → Garmin Connect & Zwift</div>';
  }

  /* ---------------- Today ---------------- */
  function readinessCard(r) {
    if (!r) {
      if (!D.loaded) return SYNC.loading ? '<section class="card note-card loading-card"><span class="spin" aria-hidden="true"></span><span>Loading your readiness, activities and plan from Intervals.icu…</span></section>' : '';
      return '<section class="card note-card dimmable">' + ICON.info + '<span>No readiness data for today yet. Wear your fenix overnight; HRV, resting HR and sleep flow from Garmin to Intervals.icu each morning. Until then the plan runs as written.</span></section>';
    }
    const m = r.metrics;
    const ringColor = r.band === 'go' ? 'var(--lime)' : r.band === 'trim' ? 'var(--amber)' : 'var(--red)';
    const cell = (label, val, sub, tone) => '<div class="metric"><span class="ml">' + label + '</span><span class="mv">' + val + '</span><span class="ms ' + (tone || '') + '">' + sub + '</span></div>';
    const hrv = m.hrv ? cell('HRV', m.hrv.value + ' ms', m.hrv.vs7 == null ? 'building baseline' : (m.hrv.vs7 >= 0 ? '+' : '−') + Math.abs(Math.round(m.hrv.vs7 * 100)) + '% vs 7d', m.hrv.vs7 != null && m.hrv.vs7 <= -0.05 ? 'warn' : '') : cell('HRV', '—', 'no data');
    const rhr = m.rhr ? cell('Rest HR', m.rhr.value, m.rhr.delta == null ? '—' : (m.rhr.delta >= 0 ? '+' : '−') + Math.abs(m.rhr.delta).toFixed(0) + ' bpm', m.rhr.delta >= 3 ? 'warn' : '') : cell('Rest HR', '—', 'no data');
    const sl = m.sleep ? cell('Sleep', C.fmtHours(m.sleep.value), m.sleep.value < 6 ? 'short' : m.sleep.value < 7 ? 'a bit short' : 'good', m.sleep.value < 6 ? 'warn' : '') : cell('Sleep', '—', 'no data');
    const fm = m.form ? cell('Form', (m.form.value >= 0 ? '+' : '') + m.form.value, m.form.value >= 0 ? 'fresh' : m.form.value < -15 ? 'fatigued' : 'training', m.form.value < -15 ? 'warn' : '') : cell('Form', '—', 'no data');
    return '<section class="card ready dimmable"><div class="ready-top"><div class="ring" style="background:conic-gradient(' + ringColor + ' ' + r.score + '%, var(--line) 0)"><div><b>' + r.score + '</b><span>READY</span></div></div>' +
      '<div class="grow"><div class="ready-head">' + esc(r.headline) + '</div><button class="link" data-action="go-readiness">How this is calculated</button></div></div>' +
      '<div class="metrics">' + hrv + rhr + sl + fm + '</div></section>';
  }
  function workoutCard(s, eyebrow) {
    const isRest = !s.sport;
    return '<section class="card workout"><div class="row-between"><span class="eyebrow">' + esc(eyebrow) + ' · ' + esc(KIND_LABEL[C.kindOf(s)].toUpperCase()) + '</span>' + pill(s) + '</div>' +
      '<button class="sess" data-action="open" data-date="' + s.date + '"><span class="sess-icon k-' + C.kindOf(s) + '">' + kindIcon(s) + '</span><span class="grow"><span class="sess-name">' + esc(s.name) + '</span><span class="muted">' + esc(isRest ? 'Rest day · optional 10 min mobility' : s.summary) + '</span></span>' + ICON.chev + '</button>' +
      (isRest ? '' : (s.sport === 'WeightTraining' ? thumbs(s) : shapeBar(s, 34))) +
      ((s.adjusted || s.edited) && s.notes[0] ? '<div class="why">' + ICON.info + '<span>' + esc(s.notes[0]) + '</span></div>' : '') +
      '<div class="grid2"><button class="btn primary" data-action="open" data-date="' + s.date + '">' + (isRest ? 'View day' : 'View workout') + '</button><button class="btn" data-action="change" data-date="' + s.date + '">' + ICON.swap + ' Change</button></div>' +
      watchLine(s) + '</section>';
  }
  function weekStrip(week) {
    const t = today();
    return '<section><div class="row-between"><span class="eyebrow">THIS WEEK</span><button class="link" data-action="go" data-view="plan">Full plan</button></div><div class="strip">' +
      week.map(d => {
        const dot = d.status === 'done' ? 'var(--lime)' : d.status === 'missed' ? 'var(--red)' : d.status === 'rest' ? 'transparent' : 'var(--line)';
        return '<button class="day' + (d.date === t ? ' on' : '') + '" data-action="open" data-date="' + d.date + '" aria-label="' + esc(fmtDate(d.date) + ': ' + d.name + ', ' + d.status) + '"><span class="dn">' + C.DAY_SHORT[C.dayIndex(d.date)] + '</span><span class="di k-' + C.kindOf(d) + '">' + kindIcon(d) + '</span><span class="dot" style="background:' + dot + '"></span></button>';
      }).join('') + '</div></section>';
  }
  function viewToday() {
    const t = today(), r = ready(), s = sessionFor(t);
    return header('Today', fmtDate(t, 'long')) + banner() + readinessCard(r) + workoutCard(s, 'TODAY') + weekStrip(plan(C.mondayOf(t), 7)) + sendBlock();
  }

  /* ---------------- Plan ---------------- */
  function viewPlan() {
    const t = today(), mon = C.addDays(C.mondayOf(t), UI.planWeek * 7), days = plan(mon, 7), wi = days[0].week;
    const label = UI.planWeek === 0 ? 'This week' : UI.planWeek === 1 ? 'Next week' : UI.planWeek === -1 ? 'Last week' : fmtDate(mon) + ' – ' + fmtDate(C.addDays(mon, 6));
    const byCat = { run: 0, ride: 0, strength: 0, other: 0 };
    let easy = 0, hard = 0, total = 0;
    days.forEach(d => {
      if (!d.sport) return;
      const sec = C.totalSec(d.blocks); total += sec;
      byCat[C.catOf(d.sport)] += sec;
      const x = C.intensitySplit(d.blocks); easy += x.easy; hard += x.hard;
    });
    const planned = days.filter(d => d.sport && d.date < t).length, done = days.filter(d => d.status === 'done').length;
    const ep = easy + hard ? Math.round(easy / (easy + hard) * 100) : 100;
    let h = header('Plan', 'Week ' + wi.week + ' · ' + wi.phase + (wi.deload ? ' · recovery week' : '')) + banner();
    h += '<div class="weeknav"><button class="icon-btn" data-action="week" data-d="-1" aria-label="Previous week"' + (UI.planWeek <= -8 ? ' disabled' : '') + '>' + ICON.back + '</button><b>' + esc(label) + '</b><button class="icon-btn flip" data-action="week" data-d="1" aria-label="Next week"' + (UI.planWeek >= 6 ? ' disabled' : '') + '>' + ICON.back + '</button></div>';
    h += '<section class="card"><div class="row-between"><b>' + C.fmtMin(total) + ' planned</b><span class="muted small">' + (planned ? done + ' of ' + planned + ' done so far' : days.filter(d => d.sport).length + ' sessions') + '</span></div>' +
      '<div class="split" role="img" aria-label="Planned time by sport">' + Object.keys(byCat).filter(k => byCat[k]).map(k => '<div style="flex:' + byCat[k] + ';background:' + C.SPORT_CATS[k].color + '"></div>').join('') + '</div>' +
      '<div class="lg">' + Object.keys(byCat).filter(k => byCat[k]).map(k => '<span><i class="sq" style="background:' + C.SPORT_CATS[k].color + '"></i>' + C.SPORT_CATS[k].label + ' ' + C.fmtMin(byCat[k]) + '</span>').join('') + '</div>' +
      '<div class="row-between small"><span>Run, ride & hike intensity</span><span class="muted">' + ep + '% easy · target 80%</span></div>' +
      '<div class="split thin" role="img" aria-label="' + ep + ' percent easy"><div style="flex:' + easy + ';background:var(--z2)"></div><div style="flex:' + hard + ';background:var(--z4)"></div></div></section>';
    h += '<div class="list">' + days.map(d => '<button class="li' + (d.date === t ? ' on' : '') + '" data-action="open" data-date="' + d.date + '"><span class="li-day"><b>' + C.DAY_SHORT[C.dayIndex(d.date)] + '</b>' + C.parseYmd(d.date).getDate() + '</span><span class="li-icon k-' + C.kindOf(d) + '">' + kindIcon(d) + '</span><span class="li-main"><span class="li-name">' + esc(d.name) + '</span><span class="muted small">' + esc(d.sport ? d.summary : 'Rest day') + '</span></span>' + pill(d) + '</button>').join('') + '</div>';
    const notes = C.planNotes(days);
    if (notes.length) h += '<section class="card"><span class="eyebrow">WHY THE PLAN LOOKS LIKE THIS</span>' + notes.map(n => '<div class="bullet ' + n.tone + '"><span>•</span><span>' + esc(n.text) + '</span></div>').join('') + '</section>';
    h += '<button class="btn" data-action="go-sub" data-sub="schedule">Edit weekly schedule</button>';
    return h;
  }

  /* ---------------- shared workout body ---------------- */
  function stepRow(st, start) {
    const max = C.maxHrFor(S);
    const target = C.targetLabel(st, max, ftp());
    const sub = target || (st.kind === 'lift' ? st.sets + ' sets of ' + st.reps : 'No target, go by feel');
    const title = st.kind === 'lift' ? st.move : st.label + ' · ' + C.fmtClock(st.sec);
    const when = start == null ? '' : '<span class="when">' + C.fmtClock(start) + '–' + C.fmtClock(start + st.sec) + '</span>';
    return '<div class="step"><span class="bar" style="background:' + stepColor(st) + '"></span><div class="grow"><div class="step-name">' + esc(title) + '</div><div class="muted small">' + esc(sub) + '</div></div>' + when + '</div>';
  }
  function exPics(b) {
    if (!b.ex) return '';
    const a = esc(b.move);
    return '<div class="pics"><figure><img src="' + esc(C.exImage(b.ex, 0)) + '" alt="' + a + ', start position" loading="lazy" onerror="this.closest(\'.pics\').remove()"><figcaption>Start</figcaption></figure>' +
      '<figure><img src="' + esc(C.exImage(b.ex, 1)) + '" alt="' + a + ', finish position" loading="lazy" onerror="this.closest(\'.pics\').remove()"><figcaption>Finish</figcaption></figure></div>';
  }
  function liftCard(b, start) {
    const info = EXMAP[b.ex];
    return '<div class="card lift">' + exPics(b) +
      '<div class="row-between"><div class="grow"><div class="step-name">' + esc(b.move) + '</div><div class="muted small">' + b.sets + ' sets of ' + esc(b.reps) + ' · about ' + C.fmtDur(b.sec) + ' with rest</div></div><span class="when">' + C.fmtClock(start) + '</span></div>' +
      (info && info.mus && info.mus.length ? '<div class="tags">' + info.mus.map(m => '<span class="tag">' + esc(cap(m)) + '</span>').join('') + '</div>' : '') +
      (info && info.how && info.how.length ? '<details><summary>How to do it</summary><ol class="how">' + info.how.map(x => '<li>' + esc(x) + '</li>').join('') + '</ol></details>' : '') + '</div>';
  }
  function zoneTable(s) {
    const zt = C.zoneTime(s.blocks), tot = zt.reduce((a, b) => a + b, 0);
    if (!tot) return '';
    const power = C.usesPower(s);
    return '<section class="card"><span class="eyebrow">TIME IN EACH ' + (power ? 'POWER ' : 'HEART RATE ') + 'ZONE</span>' + zt.map((sec, i) => !sec ? '' :
      '<div class="zt"><span class="zdot" style="background:' + C.Z_COLORS[i] + '"></span><span class="grow">' + (power ? C.PZ_NAMES[i] + ' <span class="muted">' + C.PZ_RANGES[i] + '</span>' : 'Zone ' + (i + 1) + ' · ' + C.Z_NAMES[i]) + '</span><span class="zt-bar"><span style="width:' + Math.round(sec / tot * 100) + '%;background:' + C.Z_COLORS[i] + '"></span></span><span class="zt-t">' + C.fmtDur(sec) + '</span></div>').join('') + '</section>';
  }
  function deviceHelp(s) {
    const k = C.kindOf(s);
    const card = (title, body, warn) => '<section class="card flat' + (warn ? ' warn-card' : '') + '"><span class="eyebrow">' + title + '</span>' + body + '</section>';
    const kv = (t, d) => '<div class="kv"><b>' + t + '</b><span class="muted small">' + d + '</span></div>';
    if (k === 'zwift') {
      const ev = sentEvent(s.date);
      const warn = ev && ev.indoor !== true;
      return card('IN ZWIFT', kv('Where to find it', 'Today\'s workout shows on the Zwift home screen. Upcoming ones are under Workouts → Custom → Intervals.icu.') +
        kv('How to ride it', 'Use ERG mode on a smart trainer. Power targets are % of your Zwift FTP' + (ftp() ? ' (Intervals.icu has ' + ftp() + ' W)' : '') + '.') +
        kv('Heart rate', 'Wear a strap, or turn on Broadcast Heart Rate on your fenix so Zwift can see it.') +
        (warn ? '<div class="why">' + ICON.warn + '<span>Intervals.icu didn\'t mark this as Indoor, which Zwift needs. Open it in Intervals.icu and tick Indoor.</span></div>' : ''), warn);
    }
    if (k === 'strength') return card('ON YOUR WATCH', kv('Strength workout', 'The fenix shows one timed step per exercise. Keep Pace open for the moves, reps and photos.'));
    const start = { run: 'Run', treadmill: 'Treadmill', ride: 'Bike', hike: 'Hike' }[k] || 'Run';
    return card('ON YOUR WATCH', kv('Start it', 'Press START, choose ' + start + ', and accept today\'s workout when the watch offers it.') +
      kv('Alerts', 'Beeps and buzzes at each step change, and when your heart rate leaves the step\'s zone.') +
      (k === 'hike' ? kv('Heads up', 'If Garmin doesn\'t offer this hiking workout on the watch, start Hike anyway and use the zone guide above.') : '') +
      (k === 'treadmill' ? kv('Treadmill', 'Change speed or incline at each step. Calibrate distance at the end of the run when the watch asks.') : ''));
  }
  function sessionBody(s) {
    let h = '';
    const chips = [KIND_LABEL[C.kindOf(s)]];
    if (s.indoor) chips.push('Indoor · ERG');
    if (s.level) chips.push(s.level);
    h += '<div class="chips static">' + chips.map(c => '<span class="chip">' + esc(c) + '</span>').join('') + '</div>';
    if (!s.sport) return h + '<section class="card note-card">' + ICON.rest + '<span>' + esc((s.notes || [])[0] || 'Rest day. An easy walk or 10 minutes of mobility is plenty.') + '</span></section>';
    (s.notes || []).forEach((n, i) => { h += '<div class="why ' + (i === 0 && (s.adjusted || s.edited) ? '' : 'calm') + '">' + ICON.info + '<span>' + esc(n) + '</span></div>'; });
    const isLift = s.sport === 'WeightTraining';
    if (!isLift) h += '<section class="card">' + shapeBar(s, 64) + '<div class="row-between tiny"><span>0:00</span><span>' + C.fmtClock(C.totalSec(s.blocks)) + '</span></div></section>';
    h += '<span class="eyebrow">' + (isLift ? 'EXERCISES' : 'STEPS') + '</span><div class="list">';
    let t = 0;
    s.blocks.forEach(b => {
      if (b.repeat) {
        const round = b.steps.reduce((a, x) => a + x.sec, 0);
        h += '<div class="card repeat"><div class="row-between"><span class="rep">' + esc(b.label || 'Repeat').toUpperCase() + ' · ' + b.repeat + '×</span><span class="when">' + C.fmtClock(t) + '–' + C.fmtClock(t + round * b.repeat) + '</span></div>' +
          b.steps.map(x => stepRow(x, null)).join('') + '<div class="tiny">Each round ' + C.fmtClock(round) + ' · ' + C.fmtDur(round * b.repeat) + ' in total</div></div>';
        t += round * b.repeat;
      } else if (b.kind === 'lift') { h += liftCard(b, t); t += b.sec; }
      else { h += '<div class="card">' + stepRow(b, t) + '</div>'; t += b.sec; }
    });
    h += '</div>';
    if (isLift) loadExLib(); else h += zoneTable(s);
    h += deviceHelp(s);
    h += '<details class="card flat"><summary>Workout text sent to Intervals.icu</summary><pre>' + esc(C.icuText(s)) + '</pre></details>';
    return h;
  }

  /* ---------------- Day detail ---------------- */
  function viewDay() {
    const s = sessionFor(UI.detail);
    const canChange = s.date >= today();
    let h = header(s.name, fmtDate(s.date, 'long') + (s.sport ? ' · ' + C.fmtMin(C.totalSec(s.blocks)) : ''), { back: 'back', small: true, noChip: true,
      right: canChange && s.sport ? '<button class="icon-btn" data-action="edit" aria-label="Edit steps">' + ICON.edit + '</button>' : '' });
    h += sessionBody(s);
    if (s.done) {
      const act = (D.activities || []).find(a => (a.start_date_local || '').slice(0, 10) === s.date && C.catOf(a.type) === C.catOf(s.sport));
      if (act) h += '<button class="btn" data-action="open-act" data-id="' + esc(act.id) + '">See what you did: ' + esc(act.name || act.type) + '</button>';
    }
    if (canChange) h += '<div class="grid2"><button class="btn" data-action="change" data-date="' + s.date + '">' + ICON.swap + ' Change</button>' + (s.sport ? '<button class="btn" data-action="edit">' + ICON.edit + ' Edit steps</button>' : '<button class="btn" data-action="ch-library" data-date="' + s.date + '">' + ICON.plus + ' Add workout</button>') + '</div>';
    if (s.edited && canChange) h += '<button class="btn ghost" data-action="reset" data-date="' + s.date + '">Reset to the plan</button>';
    h += watchLine(s);
    if (canChange && s.sport) h += sendBlock();
    return h;
  }

  /* ---------------- Change sheet ---------------- */
  function sheetOptions(s) {
    const o = [];
    if (s.sport) {
      o.push({ a: 'ch-easier', i: ICON.easier, t: 'Make it easier', d: s.hard ? 'Swap the hard work for an easy session' : 'About 20% shorter, or one less set' });
      const ind = C.toIndoor(s);
      if (ind) o.push({ a: 'ch-indoor', i: ICON.indoor, t: s.sport === 'Ride' ? 'Move to Zwift' : 'Move to the treadmill', d: s.sport === 'Ride' ? 'Heart rate zones become power targets for ERG' : 'Same workout, started from Treadmill on the watch' });
      if (s.treadmill || s.sport === 'VirtualRide') o.push({ a: 'ch-outdoor', i: ICON.outdoor, t: 'Move outside', d: s.sport === 'VirtualRide' ? 'Power targets become heart rate zones' : 'Same workout on the road' });
    }
    o.push({ a: 'ch-library', i: ICON.book, t: s.sport ? 'Swap for a library workout' : 'Add a workout from the library', d: 'Pick from 46 runs, rides, Zwift, hikes and lifts' });
    if (s.sport) o.push({ a: 'ch-edit', i: ICON.edit, t: 'Edit steps', d: 'Change durations, targets, repeats or exercises' });
    if (s.sport) o.push({ a: 'ch-rest', i: ICON.rest, t: 'Make it a rest day', d: 'Removes it from your watch' });
    if (s.edited) o.push({ a: 'reset', i: ICON.swap, t: 'Reset to the plan', d: 'Undo your changes for this day' });
    return o;
  }
  function renderSheet() {
    const el = document.getElementById('sheet');
    if (!UI.sheet) { el.hidden = true; el.innerHTML = ''; document.body.classList.remove('sheet-open'); return; }
    const s = sessionFor(UI.sheet.date);
    el.innerHTML = '<div class="sheet-backdrop" data-action="sheet-close"></div><div class="sheet-panel" role="dialog" aria-modal="true" aria-labelledby="sheet-title"><div class="grab"></div>' +
      '<h2 id="sheet-title">' + esc(s.name) + '</h2><div class="sub">' + esc(fmtDate(s.date, 'long')) + '</div><div class="sheet-list">' +
      sheetOptions(s).map(o => '<button class="sheet-opt" data-action="' + o.a + '" data-date="' + s.date + '"><span class="so-icon">' + o.i + '</span><span class="grow"><b>' + esc(o.t) + '</b><span class="muted small">' + esc(o.d) + '</span></span></button>').join('') +
      '</div><button class="btn ghost" data-action="sheet-close">Cancel</button></div>';
    el.hidden = false; document.body.classList.add('sheet-open');
    const first = el.querySelector('.sheet-opt'); if (first) first.focus();
  }
  function applyOverride(date, sess, msg) {
    S.overrides[date] = sess ? pickFields(sess) : { type: 'rest', sport: null, name: 'Rest', blocks: [], notes: [] };
    saveSettings();
    UI.sheet = null; renderSheet(); render();
    afterChange(date, msg);
  }
  function afterChange(date, msg) {
    if (isDemo()) toast(msg + ' Connect Intervals.icu to send it to your watch.');
    else if (within7(date)) sendWeek({ prefix: msg });
    else toast(msg + ' It goes to your watch when it\'s within 7 days.');
  }
  function resetDay(date) {
    delete S.overrides[date]; saveSettings(); UI.sheet = null; renderSheet(); render();
    afterChange(date, 'Back to the planned workout.');
  }

  /* ---------------- Library ---------------- */
  function libCard(t) {
    const s = t;
    return '<button class="tpl" data-action="open-tpl" data-id="' + t.id + '"><span class="li-icon k-' + C.kindOf(s) + '">' + kindIcon(s) + '</span><span class="grow"><span class="row-between"><span class="li-name">' + esc(t.name) + '</span><span class="lvl lvl-' + t.level.toLowerCase() + '">' + t.level + '</span></span>' +
      '<span class="muted small">' + esc(t.summary) + '</span><span class="tpl-desc">' + esc(t.desc) + '</span>' + (t.sport === 'WeightTraining' ? thumbs(t) : shapeBar(t, 18)) + '</span></button>';
  }
  function libResults() {
    const q = UI.lib.q.trim().toLowerCase(), words = q.split(/\s+/).filter(Boolean);
    const hits = LIB.TEMPLATES.filter(t => (UI.lib.cat === 'all' || t.cat === UI.lib.cat) &&
      words.every(w => (t.name + ' ' + t.desc + ' ' + t.cat + ' ' + t.level).toLowerCase().includes(w)));
    if (!hits.length) return '<div class="tiny center">No workouts match. Try another word or category.</div>';
    if (UI.lib.cat !== 'all' || q) return hits.map(libCard).join('');
    return LIB.CATS.map(c => { const xs = hits.filter(t => t.cat === c.key); return xs.length ? '<span class="eyebrow">' + c.label.toUpperCase() + ' · ' + xs.length + '</span>' + xs.map(libCard).join('') : ''; }).join('');
  }
  function viewLibrary(editPick) {
    const pickDate = editPick ? UI.edit.date : UI.lib.pick ? UI.lib.pick.date : null;
    let h = pickDate ? header('Choose a workout', 'For ' + fmtDate(pickDate, 'long'), { back: editPick ? 'ed-lib-close' : 'lib-cancel', small: true, noChip: true })
      : header('Library', LIB.TEMPLATES.length + ' ready-made workouts');
    h += '<input class="search" type="search" placeholder="Search: tempo, hills, zwift, legs…" value="' + esc(UI.lib.q) + '" data-lib-q="1" aria-label="Search workouts" autocomplete="off">';
    h += '<div class="chips" role="group" aria-label="Category"><button aria-pressed="' + (UI.lib.cat === 'all') + '" data-action="lib-cat" data-cat="all">All</button>' +
      LIB.CATS.map(c => '<button aria-pressed="' + (UI.lib.cat === c.key) + '" data-action="lib-cat" data-cat="' + c.key + '">' + c.label + '</button>').join('') + '</div>';
    h += '<div class="list" id="lib-results">' + libResults() + '</div>';
    return h;
  }
  function viewTemplate() {
    const t = LIB.get(UI.lib.open);
    const date = UI.lib.pick ? UI.lib.pick.date : (UI.lib.date || today());
    const s = Object.assign(LIB.toSession(t, date), { level: t.level });
    let h = header(t.name, KIND_LABEL[C.kindOf(s)] + ' · ' + C.fmtMin(C.totalSec(s.blocks)), { back: 'tpl-back', small: true, noChip: true });
    h += '<p class="lead">' + esc(t.desc) + '</p>';
    if (UI.lib.pick) {
      h += '<button class="btn primary" data-action="tpl-use">Use for ' + esc(fmtDate(date)) + '</button>';
    } else {
      const days = plan(today(), 14);
      h += '<span class="eyebrow">SCHEDULE IT</span><div class="datechips" role="group" aria-label="Pick a day">' + days.map(d => '<button aria-pressed="' + (d.date === date) + '" data-action="tpl-date" data-date="' + d.date + '"><b>' + esc(fmtDate(d.date, 'day')) + '</b><span>' + esc(d.sport ? d.name : 'Rest') + '</span></button>').join('') + '</div>' +
        '<div class="grid2"><button class="btn primary" data-action="tpl-schedule">Schedule ' + esc(fmtDate(date, 'day')) + '</button><button class="btn" data-action="tpl-customize">' + ICON.edit + ' Customize</button></div>' +
        '<div class="tiny">Replaces what\'s planned that day. Reset the day any time to go back to the plan.</div>';
    }
    h += sessionBody(s);
    return h;
  }

  /* ---------------- Data ---------------- */
  const sdArr = a => { const m = C.mean(a); return a.length > 1 ? Math.sqrt(a.reduce((t, x) => t + (x - m) * (x - m), 0) / (a.length - 1)) : 0; };
  const has = v => v != null && isFinite(v);
  function dataSeries() {
    const t = today(), all = C.dateRange(C.addDays(t, -119), t), W = {};
    (D.wellness || []).forEach(r => { if (r && r.id) W[r.id] = r; });
    const pick = (k, f) => all.map(d => { const v = W[d] && W[d][k]; return v != null && v > 0 ? (f ? f(v) : v) : null; });
    const hrv = pick('hrv'), rhr = pick('restingHR'), sleep = pick('sleepSecs', v => v / 3600);
    const ctl = all.map(d => W[d] && W[d].ctl != null ? W[d].ctl : null), atl = all.map(d => W[d] && W[d].atl != null ? W[d].atl : null);
    const form = all.map((_, i) => has(ctl[i]) && has(atl[i]) ? ctl[i] - atl[i] : null);
    const lo = [], hi = [];
    hrv.forEach((_, i) => {
      const prior = hrv.slice(Math.max(0, i - 28), i).filter(has);
      if (prior.length >= 5) { const m = C.mean(prior), s = Math.max(sdArr(prior), m * 0.08); lo.push(+(m - s).toFixed(1)); hi.push(+(m + s).toFixed(1)); } else { lo.push(null); hi.push(null); }
    });
    const n = UI.data.range, cut = a => a.slice(all.length - n);
    const dates = cut(all);
    return { all, W, dates, hrv: cut(hrv), hrv7: cut(C.rolling(hrv, 7)), lo: cut(lo), hi: cut(hi), rhr: cut(rhr), sleep: cut(sleep), ctl: cut(ctl), atl: cut(atl), form: cut(form),
      ready: C.readinessSeries(D.wellness, dates), full: { hrv, rhr, sleep, ctl } };
  }
  function avgLast(arr, n, skip) { const xs = arr.slice(arr.length - n - (skip || 0), arr.length - (skip || 0)).filter(has); return xs.length ? C.mean(xs) : null; }
  function deltaHtml(delta, goodUp, unit, vs) {
    if (!has(delta) || Math.abs(delta) < 0.05) return has(delta) ? '<span class="delta neutral">Same as ' + vs + '</span>' : '';
    const tone = goodUp == null ? 'neutral' : (goodUp ? delta > 0 : delta < 0) ? 'up' : 'down';
    return '<span class="delta ' + tone + '">' + (delta > 0 ? '▲' : '▼') + ' ' + Math.abs(delta).toFixed(Math.abs(delta) < 10 ? 1 : 0) + (unit || '') + ' vs ' + vs + '</span>';
  }
  function statTile(label, val, extra) {
    return '<div class="card stat-tile dimmable"><span class="ml">' + label + '</span><span class="sv">' + val + '</span>' + (extra || '') + '</div>';
  }
  function chartCard(title, explain, chart) { return '<section class="card chart-card dimmable"><div class="cc-head"><b>' + esc(title) + '</b><span class="muted small">' + esc(explain) + '</span></div>' + chart + '</section>'; }
  function breakdown(r, title) {
    if (!r) return '<section class="card note-card dimmable">' + ICON.info + '<span>No readiness score for this day: it needs HRV, resting HR or sleep from that morning.</span></section>';
    const fmtPts = p => (p > 0 ? '+' : p < 0 ? '−' : '') + Math.abs(p).toFixed(Math.abs(p) % 1 ? 1 : 0);
    return '<section class="card dimmable" id="readiness"><div class="row-between"><b>' + esc(title) + '</b><span class="score-badge b-' + r.band + '">' + r.score + '</span></div>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Input</th><th>Value</th><th>Baseline</th><th class="num">Effect</th></tr></thead><tbody>' +
      '<tr><td>Starting point</td><td></td><td></td><td class="num">70</td></tr>' +
      r.comps.map(c => '<tr><td>' + esc(c.label) + '<div class="tnote">' + esc(c.note) + '</div></td><td>' + esc(c.value) + '</td><td>' + esc(c.base) + '</td><td class="num">' + fmtPts(c.pts) + '</td></tr>').join('') +
      '</tbody><tfoot><tr><td colspan="3">Score' + (r.raw > 100 || r.raw < 5 ? ' (kept within 5–100)' : '') + '</td><td class="num">' + r.score + '</td></tr></tfoot></table></div>' +
      '<div class="tiny">65+ runs the plan as written · 55–64 trims hard work · 40–54 swaps to easy · under 40 makes it recovery or rest.</div></section>';
  }
  function viewData() {
    let h = header('Data', D.athlete && D.athlete.name ? 'From Intervals.icu · ' + D.athlete.name : 'From Intervals.icu') + banner();
    h += '<div class="seg" role="tablist">' + [['trends', 'Trends'], ['activities', 'Activities'], ['log', 'Daily log']].map(([k, l]) => '<button role="tab" aria-selected="' + (UI.data.tab === k) + '" data-action="data-tab" data-tab="' + k + '">' + l + '</button>').join('') + '</div>';
    h += '<div class="chips" role="group" aria-label="Date range">' + [[14, '2 weeks'], [42, '6 weeks'], [90, '3 months']].map(([n, l]) => '<button aria-pressed="' + (UI.data.range === n) + '" data-action="data-range" data-n="' + n + '">' + l + '</button>').join('') + '</div>';
    if (!D.loaded) return h + '<section class="card note-card">' + ICON.info + '<span>No data yet. Connect Intervals.icu in Settings.</span></section>';
    if (UI.data.tab === 'trends') h += dataTrends();
    else if (UI.data.tab === 'activities') h += dataActivities();
    else h += dataLog();
    h += dataSources();
    return h;
  }
  function dataTrends() {
    const X = dataSeries(), f = X.full, t = today();
    const r = ready();
    let h = breakdown(r, 'Today\'s readiness');
    const hrv7 = avgLast(f.hrv, 7), hrv28 = avgLast(f.hrv, 28, 7), rhr7 = avgLast(f.rhr, 7), rhr28 = avgLast(f.rhr, 28, 7), sl7 = avgLast(f.sleep, 7), sl28 = avgLast(f.sleep, 28, 7);
    const ctlNow = f.ctl.filter(has).slice(-1)[0], ctlWk = f.ctl.slice(-8, -7)[0];
    h += '<div class="grid2">' +
      statTile('HRV · 7-day avg', has(hrv7) ? Math.round(hrv7) + ' ms' : '—', deltaHtml(has(hrv7) && has(hrv28) ? hrv7 - hrv28 : null, true, ' ms', 'prior 4 wk')) +
      statTile('Resting HR · 7-day avg', has(rhr7) ? Math.round(rhr7) + ' bpm' : '—', deltaHtml(has(rhr7) && has(rhr28) ? rhr7 - rhr28 : null, false, ' bpm', 'prior 4 wk')) +
      statTile('Sleep · 7-day avg', has(sl7) ? C.fmtHours(sl7) : '—', deltaHtml(has(sl7) && has(sl28) ? sl7 - sl28 : null, true, ' h', 'prior 4 wk')) +
      statTile('Fitness (CTL)', has(ctlNow) ? Math.round(ctlNow) : '—', deltaHtml(has(ctlNow) && has(ctlWk) ? ctlNow - ctlWk : null, null, '', '7 days ago')) + '</div>';
    const n = X.dates.length;
    h += chartCard('Readiness score', 'Pace\'s daily score. 65+ means train as planned.', CH.line({ dates: X.dates, series: [{ name: 'Readiness', color: C1, values: X.ready }], fmt: v => Math.round(v), yMin: 0, yMax: 100, aria: 'Readiness score over the last ' + n + ' days' }));
    h += chartCard('HRV', 'Overnight heart rate variability. Higher than your normal range usually means well recovered.', CH.line({ dates: X.dates, series: [{ name: 'Nightly', color: C1, values: X.hrv }, { name: '7-day average', color: C2, values: X.hrv7 }], band: { lo: X.lo, hi: X.hi, color: C1, name: 'Normal range (28 days)' }, fmt: v => Math.round(v) + ' ms', aria: 'HRV nightly and 7-day average' }));
    h += chartCard('Resting heart rate', 'Creeping up for several days can mean fatigue, illness or poor sleep.', CH.line({ dates: X.dates, series: [{ name: 'Resting HR', color: C1, values: X.rhr }], fmt: v => Math.round(v) + ' bpm', aria: 'Resting heart rate' }));
    h += chartCard('Sleep', 'Hours asleep each night.', CH.columns({ dates: X.dates, values: X.sleep, color: C1, name: 'Sleep', fmt: v => C.fmtHours(v), ref: { v: 7, label: '7 h' }, aria: 'Hours of sleep per night' }));
    h += chartCard('Fitness & fatigue', 'Fitness (CTL) is your 6-week training load; fatigue (ATL) is the last week.', CH.line({ dates: X.dates, series: [{ name: 'Fitness (CTL)', color: C1, values: X.ctl }, { name: 'Fatigue (ATL)', color: C2, values: X.atl }], fmt: v => v.toFixed(1), aria: 'Fitness and fatigue' }));
    h += chartCard('Form', 'Fitness minus fatigue. Below −20 for long means you\'re digging a hole.', CH.columns({ dates: X.dates, values: X.form, colorFn: v => v >= 0 ? C1 : C2, name: 'Form', fmt: v => (v >= 0 ? '+' : '') + v.toFixed(1), legend: [{ name: 'Fresh (positive)', color: C1 }, { name: 'Fatigued (negative)', color: C2 }], aria: 'Form, fitness minus fatigue' }));
    const weeks = Math.max(2, Math.ceil(n / 7)), mondays = [];
    for (let i = weeks - 1; i >= 0; i--) mondays.push(C.addDays(C.mondayOf(t), -7 * i));
    const vol = C.weeklyVolume(D.activities, mondays), keys = Object.keys(C.SPORT_CATS).map(k => ({ key: k, label: C.SPORT_CATS[k].label, color: C.SPORT_CATS[k].color }));
    const hrsRows = vol.map(v => { const o = {}; keys.forEach(k => { o[k.key] = v[k.key] / 3600; }); return o; });
    h += chartCard('Training time per week', 'From your recorded activities, by sport.', CH.stacked({ labels: mondays.map(CH.shortDate), keys, rows: hrsRows, fmt: v => C.fmtHours(v), tick: v => v + ' h', aria: 'Hours of training per week by sport' }) +
      '<details><summary>Show as a table</summary><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Week of</th>' + keys.map(k => '<th class="num">' + k.label + '</th>').join('') + '<th class="num">Total</th></tr></thead><tbody>' +
      vol.slice().reverse().map(v => '<tr><td>' + esc(CH.shortDate(v.monday)) + '</td>' + keys.map(k => '<td class="num">' + (v[k.key] ? C.fmtHours(v[k.key] / 3600) : '–') + '</td>').join('') + '<td class="num">' + C.fmtHours(keys.reduce((a, k) => a + v[k.key], 0) / 3600) + '</td></tr>').join('') + '</tbody></table></div></details>');
    return h;
  }
  const IMP = () => S.units !== 'metric';
  function fmtDist(m) { if (!(m > 0)) return null; return IMP() ? (m / 1609.344).toFixed(2) + ' mi' : (m / 1000).toFixed(2) + ' km'; }
  function fmtElev(m) { if (!(m > 0)) return null; return IMP() ? Math.round(m * 3.28084) + ' ft' : Math.round(m) + ' m'; }
  function fmtPace(mps) { if (!(mps > 0)) return null; const s = Math.round((IMP() ? 1609.344 : 1000) / mps); return Math.floor(s / 60) + ':' + pad(s % 60) + (IMP() ? ' /mi' : ' /km'); }
  function fmtSpeed(mps) { if (!(mps > 0)) return null; return IMP() ? (mps * 2.23694).toFixed(1) + ' mph' : (mps * 3.6).toFixed(1) + ' km/h'; }
  function actsInRange() {
    const from = C.addDays(today(), -(UI.data.range - 1));
    return (D.activities || []).filter(a => (a.start_date_local || '').slice(0, 10) >= from).sort((a, b) => (b.start_date_local || '').localeCompare(a.start_date_local || ''));
  }
  function dataActivities() {
    const acts = actsInRange();
    if (!acts.length) return '<section class="card note-card">' + ICON.info + '<span>No activities in this range. Activities flow from your fenix to Garmin Connect to Intervals.icu.</span></section>';
    const tot = acts.reduce((a, x) => a + (x.moving_time || 0), 0), load = acts.reduce((a, x) => a + (x.icu_training_load || 0), 0);
    let h = '<div class="grid3">' + [['Activities', acts.length], ['Time', C.fmtHours(tot / 3600)], ['Load', Math.round(load)]].map(([l, v]) => '<div class="card stat-tile dimmable"><span class="ml">' + l + '</span><span class="sv">' + v + '</span></div>').join('') + '</div>';
    let lastDay = '';
    h += '<div class="list dimmable">';
    acts.forEach(a => {
      const d = (a.start_date_local || '').slice(0, 10);
      if (d !== lastDay) { h += '<span class="eyebrow">' + esc(fmtDate(d, 'long').toUpperCase()) + '</span>'; lastDay = d; }
      const bits = [a.moving_time ? C.fmtDur(a.moving_time) : null, fmtDist(a.distance), a.average_heartrate ? Math.round(a.average_heartrate) + ' bpm' : null, a.icu_training_load ? 'load ' + Math.round(a.icu_training_load) : null].filter(Boolean);
      const cat = C.catOf(a.type);
      h += '<button class="li" data-action="open-act" data-id="' + esc(a.id) + '"><span class="li-icon" style="color:' + C.SPORT_CATS[cat].color + '">' + catIcon(cat) + '</span><span class="li-main"><span class="li-name">' + esc(a.name || a.type) + '</span><span class="muted small">' + esc(bits.join(' · ')) + '</span></span>' + ICON.chev + '</button>';
    });
    return h + '</div>';
  }
  function rawTable(obj) {
    const keys = Object.keys(obj || {}).sort();
    let hidden = 0;
    const rows = keys.map(k => {
      let v = obj[k];
      if (v == null || v === '' || (Array.isArray(v) && !v.length)) { hidden++; return ''; }
      if (Array.isArray(v)) v = (v.length > 12 ? v.slice(0, 12).map(x => typeof x === 'object' ? JSON.stringify(x) : x).join(', ') + ' … (' + v.length + ' values)' : v.map(x => typeof x === 'object' ? JSON.stringify(x) : x).join(', '));
      else if (typeof v === 'object') v = JSON.stringify(v);
      else if (typeof v === 'number' && v % 1) v = +v.toFixed(3);
      v = String(v); if (v.length > 240) v = v.slice(0, 240) + '…';
      return '<tr><td class="mono">' + esc(k) + '</td><td>' + esc(v) + '</td></tr>';
    }).join('');
    return '<details class="card flat"><summary>All fields from Intervals.icu (' + (keys.length - hidden) + ')</summary><div class="tbl-wrap"><table class="tbl raw"><tbody>' + rows + '</tbody></table></div>' + (hidden ? '<div class="tiny">' + hidden + ' empty fields hidden.</div>' : '') + '</details>';
  }
  function viewActivity() {
    const a = (D.activities || []).find(x => String(x.id) === String(UI.data.act));
    if (!a) { UI.data.act = null; return viewData(); }
    const d = (a.start_date_local || '').slice(0, 10), cat = C.catOf(a.type), isRide = cat === 'ride';
    const time = a.start_date_local ? new Date(a.start_date_local).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';
    let h = header(a.name || a.type, fmtDate(d, 'long') + (time ? ' · ' + time : '') + ' · ' + a.type, { back: 'act-back', small: true, noChip: true });
    const stats = [
      ['Moving time', a.moving_time ? C.fmtClock(a.moving_time) : null], ['Elapsed', a.elapsed_time ? C.fmtClock(a.elapsed_time) : null],
      ['Distance', fmtDist(a.distance)], ['Elevation gain', fmtElev(a.total_elevation_gain)],
      [isRide ? 'Avg speed' : 'Avg pace', isRide ? fmtSpeed(a.average_speed) : (cat === 'run' || a.type === 'Hike' || a.type === 'Walk' ? fmtPace(a.average_speed) : null)],
      ['Avg heart rate', a.average_heartrate ? Math.round(a.average_heartrate) + ' bpm' : null], ['Max heart rate', a.max_heartrate ? Math.round(a.max_heartrate) + ' bpm' : null],
      ['Training load', a.icu_training_load != null ? Math.round(a.icu_training_load) : null], ['Intensity', a.icu_intensity ? Math.round(a.icu_intensity) + '%' : null],
      ['TRIMP', a.trimp ? Math.round(a.trimp) : null], ['Avg power', a.icu_average_watts ? Math.round(a.icu_average_watts) + ' W' : null], ['Weighted power', a.icu_weighted_avg_watts ? Math.round(a.icu_weighted_avg_watts) + ' W' : null],
      ['Cadence', a.average_cadence ? Math.round(a.average_cadence) + (cat === 'run' ? ' spm' : ' rpm') : null], ['Calories', a.calories ? Math.round(a.calories) : null],
      ['HR drift (decoupling)', a.decoupling != null ? (+a.decoupling).toFixed(1) + '%' : null], ['Efficiency factor', a.icu_efficiency_factor ? (+a.icu_efficiency_factor).toFixed(2) : null],
      ['Effort (RPE)', a.icu_rpe ? a.icu_rpe + ' / 10' : null], ['Feel', a.feel ? ['', 'Strong', 'Good', 'Normal', 'Poor', 'Weak'][a.feel] || a.feel : null],
    ].filter(x => x[1] != null);
    h += '<div class="grid2 stats">' + stats.map(([l, v]) => '<div class="card stat-tile"><span class="ml">' + l + '</span><span class="sv">' + esc(v) + '</span></div>').join('') + '</div>';
    const zt = Array.isArray(a.icu_hr_zone_times) ? a.icu_hr_zone_times.map(Number) : null;
    if (zt && zt.some(x => x > 0)) {
      const tot = zt.reduce((x, y) => x + y, 0);
      h += '<section class="card"><span class="eyebrow">TIME IN HEART RATE ZONES</span>' + zt.map((sec, i) => '<div class="zt"><span class="zdot" style="background:' + C.Z_COLORS[Math.min(i, 4)] + '"></span><span class="grow">Zone ' + (i + 1) + (C.Z_NAMES[i] ? ' · ' + C.Z_NAMES[i] : '') + '</span><span class="zt-bar"><span style="width:' + Math.round(sec / tot * 100) + '%;background:' + C.Z_COLORS[Math.min(i, 4)] + '"></span></span><span class="zt-t">' + C.fmtDur(sec) + '</span></div>').join('') + '</section>';
    }
    const planned = plan(d, 1)[0];
    if (planned.sport && C.catOf(planned.sport) === cat) {
      const p = C.totalSec(planned.blocks), act = a.moving_time || 0, diff = p ? Math.round((act - p) / p * 100) : 0;
      h += '<section class="card"><span class="eyebrow">PLANNED VS DONE</span><div class="row-between"><span>' + esc(planned.name) + '</span><button class="link" data-action="open" data-date="' + d + '">Open plan</button></div>' +
        '<div class="grid2"><div><span class="ml">Planned</span><div class="sv sm">' + C.fmtMin(p) + '</div></div><div><span class="ml">Done</span><div class="sv sm">' + C.fmtMin(act) + ' <span class="muted small">(' + (diff >= 0 ? '+' : '') + diff + '%)</span></div></div></div></section>';
    }
    h += rawTable(a);
    return h;
  }
  function dataLog() {
    const X = dataSeries(), rows = X.dates.slice().reverse();
    let h = '<section class="card flat dimmable"><div class="tbl-wrap"><table class="tbl log"><thead><tr><th>Date</th><th class="num">Ready</th><th class="num">HRV</th><th class="num">RHR</th><th class="num">Sleep</th><th class="num">Sleep score</th><th class="num">CTL</th><th class="num">ATL</th><th class="num">Form</th></tr></thead><tbody>';
    rows.forEach((d, k) => {
      const w = X.W[d] || {}, i = X.dates.length - 1 - k, fv = X.form[i];
      const cell = v => '<td class="num">' + (v == null || v === '' ? '–' : esc(v)) + '</td>';
      h += '<tr data-action="open-day" data-date="' + d + '" tabindex="0"><td>' + esc(fmtDate(d)) + '</td>' + cell(X.ready[i]) + cell(w.hrv ? Math.round(w.hrv) : null) + cell(w.restingHR || null) + cell(w.sleepSecs ? C.fmtHours(w.sleepSecs / 3600) : null) + cell(w.sleepScore || null) +
        cell(w.ctl != null ? (+w.ctl).toFixed(1) : null) + cell(w.atl != null ? (+w.atl).toFixed(1) : null) + cell(has(fv) ? (fv >= 0 ? '+' : '') + fv.toFixed(1) : null) + '</tr>';
    });
    h += '</tbody></table></div><div class="tiny">Tap a day to see every field and how its readiness score was calculated.</div></section>';
    return h;
  }
  function viewWellnessDay() {
    const d = UI.data.day, w = (D.wellness || []).find(r => r.id === d) || { id: d };
    let h = header(fmtDate(d, 'long'), 'Wellness from Intervals.icu', { back: 'day-back', small: true, noChip: true });
    h += breakdown(C.readiness(D.wellness, d), 'Readiness that morning');
    h += rawTable(w);
    return h;
  }
  function dataSources() {
    const ws = (D.wellness || []).map(r => r.id).filter(Boolean).sort();
    return '<section class="card flat sources"><span class="eyebrow">DATA SOURCE</span>' +
      '<div class="kv"><b>' + (isDemo() ? 'Sample data (demo mode)' : 'Intervals.icu' + (D.athlete && D.athlete.name ? ' · ' + esc(D.athlete.name) : '')) + '</b><span class="muted small">Last updated ' + esc(D.syncedAt ? new Date(D.syncedAt).toLocaleString() : 'never') + '</span></div>' +
      '<div class="muted small">' + ws.length + ' days of wellness' + (ws.length ? ' (' + esc(fmtDate(ws[0])) + ' – ' + esc(fmtDate(ws[ws.length - 1])) + ')' : '') + ' · ' + (D.activities || []).length + ' activities · ' + (D.events || []).length + ' planned workouts</div>' +
      '<button class="btn" data-action="export">' + ICON.download + ' Export daily log (CSV)</button></section>';
  }
  function exportCsv() {
    const rows = (D.wellness || []).slice().sort((a, b) => a.id < b.id ? -1 : 1);
    if (!rows.length) { toast('No wellness data to export yet.', true); return; }
    const keys = Array.from(rows.reduce((s, r) => { Object.keys(r).forEach(k => { if (r[k] == null || typeof r[k] !== 'object') s.add(k); }); return s; }, new Set(['id'])));
    keys.splice(keys.indexOf('id'), 1); keys.unshift('id');
    const q = v => v == null ? '' : /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
    const csv = [keys.join(',')].concat(rows.map(r => keys.map(k => q(r[k])).join(','))).join('\n');
    const name = 'pace-wellness-' + today() + '.csv', blob = new Blob([csv], { type: 'text/csv' });
    try {
      const file = new File([blob], name, { type: 'text/csv' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: name }).catch(() => {}); return; }
    } catch (e) { /* fall back to a download */ }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  /* ---------------- Settings ---------------- */
  function srow(sub, title, detail, icon) {
    return '<button class="srow" data-action="go-sub" data-sub="' + sub + '">' + (icon ? '<span class="so-icon">' + icon + '</span>' : '') + '<span class="grow"><b>' + esc(title) + '</b><span class="muted small">' + esc(detail) + '</span></span>' + ICON.chev + '</button>';
  }
  function viewSettings() {
    const sched = C.DAY_KEYS.filter(k => S.schedule[k] !== 'rest').length;
    let h = header('Settings', 'Pace ' + VERSION);
    h += '<span class="eyebrow">CONNECTION</span><div class="sgroup">' + srow('connection', 'Intervals.icu', isDemo() ? 'Not connected · demo mode' : 'Connected' + (D.athlete && D.athlete.name ? ' as ' + D.athlete.name : '') + (D.syncedAt ? ' · updated ' + timeAgo(D.syncedAt) : ''), ICON.watch) + srow('indoor', 'Zwift & treadmill', 'How indoor workouts reach Zwift and your watch', ICON.zwift) + '</div>';
    h += '<span class="eyebrow">TRAINING</span><div class="sgroup">' + srow('schedule', 'Weekly schedule', sched + ' training days · plan started ' + fmtDate(settings().planStart), ICON.book) +
      srow('zones', 'Heart rate & power zones', 'Max HR ' + C.maxHrFor(S) + (Number(S.maxHr) > 0 ? '' : ' (estimated)') + (ftp() ? ' · FTP ' + ftp() + ' W' : ''), ICON.run) +
      srow('watch', 'Watch, alerts & units', (S.autoSend ? 'Auto-send on' : 'Auto-send off') + ' · ' + (IMP() ? 'miles' : 'kilometers'), ICON.strength) + '</div>';
    h += '<span class="eyebrow">ABOUT</span><div class="sgroup">' + srow('about', 'About Pace', 'Credits, your data, reset', ICON.info) + '</div>';
    return h;
  }
  function viewSettingsSub() {
    const back = { back: 'sub-back', small: true, noChip: true };
    if (UI.sub === 'connection') {
      return header('Intervals.icu', 'Connection', back) +
        '<section class="card"><label class="field"><span>API key</span><input type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Paste from Intervals.icu → Settings → Developer" value="' + esc(S.apiKey) + '" data-setting="apiKey"></label>' +
        '<label class="field"><span>Athlete ID <small class="muted">(0 = you)</small></span><input type="text" autocapitalize="off" value="' + esc(S.athleteId) + '" data-setting="athleteId"></label>' +
        '<button class="btn" data-action="test" data-test-btn' + (SYNC.testing ? ' disabled' : '') + '>' + (SYNC.testing ? spinLabel('Testing…') : 'Test connection') + '</button>' +
        (D.athlete && !isDemo() ? '<div class="watch-line ok">' + ICON.check + '<span>Connected' + (D.athlete.name ? ' as ' + esc(D.athlete.name) : '') + '</span></div>' : '') + '</section>' +
        '<section class="card flat"><span class="eyebrow">SET UP</span><ol class="steps-help small"><li>In Intervals.icu, connect Garmin. Tick <b>Upload planned workouts</b> and <b>Download wellness data</b>.</li><li>Under Settings → Developer Settings, create an API key and paste it above.</li><li>Optional: connect Zwift in Intervals.icu to get indoor rides there too.</li><li>The key stays on this phone only.</li></ol></section>';
    }
    if (UI.sub === 'indoor') {
      return header('Zwift & treadmill', 'Indoor training', back) +
        '<section class="card flat"><span class="eyebrow">ZWIFT</span><ol class="steps-help small"><li>In Intervals.icu settings, find the Zwift box and tap <b>Connect</b>.</li><li>Plan Zwift workouts in Pace (schedule, library, or Change → Move to Zwift). Pace marks them Indoor, which Zwift requires.</li><li>Intervals.icu uploads the next 7 days. Today\'s ride shows on the Zwift home screen; others are under Workouts → Custom → Intervals.icu.</li><li>Ride in ERG mode. Targets are % of FTP, so keep FTP the same in Zwift and Intervals.icu.</li><li>Heart rate targets don\'t work in Zwift, which is why Zwift workouts use power.</li></ol>' +
        '<div class="tiny">Zwift rides also reach your fenix as power workouts. If you don\'t want that, filter VirtualRide out of Garmin uploads in Intervals.icu.</div></section>' +
        '<section class="card flat"><span class="eyebrow">TREADMILL</span><ol class="steps-help small"><li>Treadmill workouts are regular run workouts with heart rate targets.</li><li>On the fenix, start the <b>Treadmill</b> activity and accept the workout.</li><li>Change speed or incline when each step starts. The watch beeps at each change.</li><li>At the end, calibrate distance when the watch asks so future treadmill runs are accurate.</li></ol></section>';
    }
    if (UI.sub === 'schedule') {
      const opts = C.TYPE_GROUPS.map(g => '<optgroup label="' + g + '">' + Object.keys(C.SESSION_TYPES).filter(k => C.SESSION_TYPES[k].group === g).map(k => '<option value="' + k + '">' + esc(C.SESSION_TYPES[k].label) + '</option>').join('') + '</optgroup>').join('');
      const sel = day => '<select data-schedule="' + day + '" aria-label="' + day + ' session">' + opts.replace('value="' + S.schedule[day] + '"', 'value="' + S.schedule[day] + '" selected') + '</select>';
      return header('Weekly schedule', 'What each day of the week trains', back) +
        '<section class="card"><label class="field"><span>Plan start (week 1 Monday)</span><input type="date" value="' + esc(S.planStart || C.mondayOf(today())) + '" data-setting="planStart"></label></section>' +
        '<section class="card">' + C.DAY_KEYS.map((d, i) => '<label class="sched"><span>' + C.DAY_SHORT[i] + '</span>' + sel(d) + '</label>').join('') +
        '<div class="tiny">Workouts marked "workout" get harder each week, then back off every 4th week. Keep hard days apart, with an easy day or rest between them.</div></section>';
    }
    if (UI.sub === 'zones') {
      const max = C.maxHrFor(S), est = !(Number(S.maxHr) > 0), r = ready();
      const runSet = (D.sport || []).find(s => (s.types || []).includes('Run'));
      let h = header('Zones', 'Heart rate (% of max) and power', back);
      h += '<div class="grid2"><label class="card stat"><span class="ml">Max heart rate (bpm)</span><input type="number" inputmode="numeric" min="120" max="230" placeholder="' + C.estMaxHr(S.age) + '" value="' + esc(S.maxHr) + '" data-setting="maxHr"><span class="ms' + (est ? ' warn' : '') + '">' + (est ? 'Estimated from age' : 'Your measured max') + '</span></label>' +
        '<label class="card stat"><span class="ml">Age</span><input type="number" inputmode="numeric" min="10" max="99" value="' + esc(S.age) + '" data-setting="age"><span class="ms">Resting HR ' + (r && r.metrics.rhr ? r.metrics.rhr.value + ' bpm' : '—') + '</span></label></div>';
      h += '<div class="list">' + C.zoneRanges(max).slice().reverse().map(z => '<div class="card zone"><span class="zbadge" style="background:' + C.Z_COLORS[z.zone - 1] + '">' + z.zone + '</span><div class="grow"><div class="step-name">' + C.Z_NAMES[z.zone - 1] + '</div><div class="muted small">' + C.Z_USES[z.zone - 1] + '</div></div><span class="zr">' + (z.zone === 1 ? '< ' + z.hi : z.lo + '–' + z.hi) + '</span></div>').join('') + '</div>';
      if (!isDemo() && D.loaded) {
        const icuTops = runSet && runSet.hr_zones ? runSet.hr_zones.slice(0, 5) : null;
        const match = icuTops && icuTops.join() === C.zoneTops(max).join() && runSet.max_hr === max;
        h += '<section class="card ' + (match ? '' : 'warn-card') + '"><b>' + (match ? 'Intervals.icu matches' : 'Intervals.icu zones differ') + '</b><span class="muted small">' +
          (runSet ? 'Intervals.icu Run: max ' + esc(runSet.max_hr || '—') + ', zone tops ' + esc(icuTops ? icuTops.join(' / ') : 'not set') + '. Workouts use Intervals.icu\'s zones, so keep them in step.' : 'Could not read your Intervals.icu sport settings.') + '</span>' +
          (match ? '' : '<button class="btn" data-action="syncZones" data-zones-btn' + (SYNC.zones ? ' disabled' : '') + '>' + (SYNC.zones ? spinLabel('Copying…') : 'Copy these zones to Intervals.icu') + '</button>') + '</section>';
      }
      h += '<section class="card"><span class="eyebrow">POWER ZONES (ZWIFT)</span>' + C.PZ_NAMES.map((n, i) => '<div class="zt"><span class="zdot" style="background:' + C.Z_COLORS[i] + '"></span><span class="grow">' + n + '</span><span class="muted small">' + C.PZ_RANGES[i] + (ftp() ? ' · ' + ['< ' + Math.round(ftp() * .55), Math.round(ftp() * .56) + '–' + Math.round(ftp() * .75), Math.round(ftp() * .76) + '–' + Math.round(ftp() * .9), Math.round(ftp() * .91) + '–' + Math.round(ftp() * 1.05), '> ' + Math.round(ftp() * 1.05)][i] + ' W' : '') + '</span></div>').join('') +
        '<div class="tiny">' + (ftp() ? 'FTP ' + ftp() + ' W from Intervals.icu.' : 'No FTP in Intervals.icu yet. Zwift\'s Ramp Test sets one in Zwift; copy it into Intervals.icu too.') + '</div></section>';
      h += '<section class="card tipcard"><b>Make these yours</b><span class="small">Age formulas can be off by 10+ bpm. After a few hard efforts, use the highest heart rate you\'ve seen as your max. Set the same max in Garmin Connect\'s heart rate zones so the watch agrees.</span></section>';
      return h;
    }
    if (UI.sub === 'watch') {
      const tg = (key, title, d) => '<label class="toggle"><span><b>' + title + '</b><span class="muted small">' + d + '</span></span><input type="checkbox" data-setting="' + key + '"' + (S[key] !== false ? ' checked' : '') + '></label>';
      return header('Watch, alerts & units', '', back) +
        '<section class="card">' + tg('autoSend', 'Update the watch when I open Pace', 'Once a day, re-sends the next 7 days so readiness changes reach the fenix.') +
        tg('easyCeiling', 'Easy-day ceiling', 'Easy steps target Zone 1–2, so the watch only alerts when you go too hard.') + '</section>' +
        '<section class="card"><span class="eyebrow">UNITS</span><div class="seg" role="group" aria-label="Units"><button aria-pressed="' + IMP() + '" data-action="units" data-u="imperial">Miles · feet</button><button aria-pressed="' + !IMP() + '" data-action="units" data-u="metric">Kilometers · meters</button></div></section>' +
        '<section class="card flat"><span class="eyebrow">HOW ALERTS WORK</span><div class="kv"><b>Step changes</b><span class="muted small">The fenix beeps, buzzes and shows the next step with its target.</span></div><div class="kv"><b>Out-of-zone alerts</b><span class="muted small">Every run, ride and hike step carries a heart rate zone, so the watch alerts when you leave it.</span></div><div class="kv"><b>Beep or vibrate</b><span class="muted small">Set on the watch: hold MENU → Activities & Apps → Run (or Bike) → Settings → Alerts / Tones.</span></div></section>';
    }
    if (UI.sub === 'about') {
      return header('About Pace', 'Version ' + VERSION, back) +
        '<section class="card flat small"><p>Pace plans runs, rides, hikes and dumbbell workouts, adjusts them to your readiness each morning, and sends them to your fenix and Zwift through Intervals.icu.</p><p class="muted">Exercise photos and instructions: Free Exercise DB (public domain). Your API key, plan and edits are stored only on this phone.</p></section>' +
        '<button class="btn danger" data-action="reset-all">Reset Pace on this phone</button>';
    }
    UI.sub = null; return viewSettings();
  }

  /* ---------------- Editor ---------------- */
  function draftFrom(s) { return C.clone({ type: s.type, sport: s.sport, treadmill: !!s.treadmill, indoor: !!s.indoor, name: s.name, focus: s.focus || '', blocks: s.blocks || [] }); }
  function startEdit(date, fromSession) {
    let s = fromSession || sessionFor(date);
    if (!s.sport) s = C.buildSession('easyRun', date, settings());
    UI.edit = { date, draft: draftFrom(s) };
    UI.detail = null; UI.sheet = null; renderSheet();
  }
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
      '<select data-ef="sec" data-p="' + path + '" aria-label="Seconds">' + secOpts.map(v => '<option value="' + v + '"' + (v === s ? ' selected' : '') + '>' + pad(v) + '</option>').join('') + '</select><span class="tiny">sec</span></span>';
  }
  function targetSelect(st, path) {
    if (UI.edit.draft.sport === 'VirtualRide') {
      const cur = st.pw ? st.pw.join('-') : '';
      const opts = PW_OPTIONS.slice();
      if (st.pw && !opts.some(o => o.join('-') === cur)) opts.push(st.pw);
      return '<select data-ef="pw" data-p="' + path + '" aria-label="Power target">' + '<option value=""' + (cur ? '' : ' selected') + '>No target</option>' +
        opts.map(o => { const v = o.join('-'); return '<option value="' + v + '"' + (v === cur ? ' selected' : '') + '>' + (st.ramp && v === cur ? 'Ramp ' : '') + (o[0] === o[1] ? o[0] : o[0] + '–' + o[1]) + '% FTP</option>'; }).join('') + '</select>';
    }
    const cur = st.zone ? st.zone.join('-') : '', r = C.zoneRanges(C.maxHrFor(S));
    return '<select data-ef="zone" data-p="' + path + '" aria-label="Heart rate zone"><option value=""' + (cur ? '' : ' selected') + '>No target</option>' +
      ZONE_OPTIONS.map(z => { const v = z.join('-'), bpm = z[0] === 1 ? '<' + r[z[1] - 1].hi : r[z[0] - 1].lo + '–' + r[z[1] - 1].hi; return '<option value="' + v + '"' + (v === cur ? ' selected' : '') + '>Z' + (z[0] === z[1] ? z[0] : z[0] + '–' + z[1]) + ' · ' + bpm + '</option>'; }).join('') + '</select>';
  }
  function moveBtns(path, i, n) {
    return '<span class="ed-btns"><button class="mini" data-action="ed-up" data-p="' + path + '" aria-label="Move up"' + (i === 0 ? ' disabled' : '') + '>' + ICON.up + '</button>' +
      '<button class="mini" data-action="ed-down" data-p="' + path + '" aria-label="Move down"' + (i === n - 1 ? ' disabled' : '') + '>' + ICON.down + '</button>' +
      '<button class="mini danger" data-action="ed-del" data-p="' + path + '" aria-label="Delete">' + ICON.trash + '</button></span>';
  }
  function edStep(st, path, i, n) {
    return '<div class="ed-step" style="border-left-color:' + stepColor(st) + '"><div class="ed-row"><input type="text" value="' + esc(st.label) + '" data-ef="label" data-p="' + path + '" aria-label="Step name" maxlength="40">' + moveBtns(path, i, n) + '</div>' +
      '<div class="ed-row wrap">' + durInputs(st, path) + targetSelect(st, path) + '</div></div>';
  }
  function edLift(b, path, i, n) {
    const setOpts = [1, 2, 3, 4, 5, 6].map(v => '<option value="' + v + '"' + (v === b.sets ? ' selected' : '') + '>' + v + ' sets</option>').join('');
    const thumb = b.ex ? '<img class="ed-thumb" src="' + esc(C.exImage(b.ex, 0)) + '" alt="" loading="lazy" onerror="this.remove()">' : '';
    return '<div class="ed-step" style="border-left-color:var(--muted)"><div class="ed-row">' + thumb + '<input type="text" value="' + esc(b.move) + '" data-ef="move" data-p="' + path + '" aria-label="Exercise" maxlength="40">' + moveBtns(path, i, n) + '</div>' +
      '<button class="link pick-link" data-action="ed-pick" data-p="' + path + '">' + (b.ex ? 'Swap exercise' : 'Choose from library to add pictures') + '</button>' +
      '<div class="ed-row"><select data-ef="sets" data-p="' + path + '" aria-label="Sets">' + setOpts + '</select><label class="reps"><span class="tiny">reps</span><input type="text" value="' + esc(b.reps) + '" data-ef="reps" data-p="' + path + '" aria-label="Reps" maxlength="24"></label></div></div>';
  }
  function pickResults() {
    const Pk = UI.edit.picker;
    if (!EXLIB) { loadExLib(); return '<div class="tiny center"><span class="spin" aria-hidden="true"></span> Loading exercises…</div>'; }
    const q = Pk.q.trim().toLowerCase(), eqs = EQ_GROUPS[Pk.eq].eq, words = q.split(/\s+/).filter(Boolean);
    const hits = EXLIB.filter(e => (!eqs || eqs.includes(e.eq)) && words.every(w => (e.name + ' ' + e.mus.join(' ')).toLowerCase().includes(w)));
    let h = '';
    if (q) h += '<button class="pick custom" data-action="ed-pick-custom"><span class="pick-ph">' + ICON.plus + '</span><span class="grow"><span class="step-name">Use “' + esc(Pk.q.trim()) + '”</span><span class="muted small">Custom exercise, no pictures</span></span></button>';
    h += hits.slice(0, 40).map(e => '<button class="pick" data-action="ed-pick-choose" data-id="' + esc(e.id) + '"><img src="' + esc(C.exImage(e.id, 0)) + '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'"><span class="grow"><span class="step-name">' + esc(e.name) + '</span><span class="muted small">' + esc(cap(e.eq === 'none' ? 'bodyweight' : e.eq) + (e.mus.length ? ' · ' + e.mus.join(', ') : '')) + '</span></span></button>').join('');
    if (!hits.length) h += '<div class="tiny center">No matches. Try another word, or "All".</div>';
    else if (hits.length > 40) h += '<div class="tiny center">Showing 40 of ' + hits.length + '. Type more to narrow it down.</div>';
    return h;
  }
  function viewPicker() {
    const Pk = UI.edit.picker;
    return header(Pk.path == null ? 'Add exercise' : 'Swap exercise', 'Free Exercise DB · public domain photos', { back: 'ed-pick-close', small: true, noChip: true }) +
      '<input class="search" type="search" placeholder="Search: squat, row, glutes…" value="' + esc(Pk.q) + '" data-pick-q="1" aria-label="Search exercises" autocomplete="off">' +
      '<div class="chips" role="group" aria-label="Equipment">' + Object.keys(EQ_GROUPS).map(k => '<button aria-pressed="' + (Pk.eq === k) + '" data-action="ed-pick-eq" data-eq="' + k + '">' + EQ_GROUPS[k].label + '</button>').join('') + '</div>' +
      '<div class="list" id="pick-results">' + pickResults() + '</div>';
  }
  function viewEdit() {
    const E = UI.edit, d = E.draft;
    let h = header('Edit workout', fmtDate(E.date, 'long'), { back: 'ed-cancel', small: true, noChip: true });
    h += '<section class="card"><label class="field"><span>Name</span><input type="text" value="' + esc(d.name) + '" data-ed="name" maxlength="60"></label>' +
      '<div class="chips static"><span class="chip">' + esc(KIND_LABEL[C.kindOf(d)]) + '</span>' + (d.indoor ? '<span class="chip">Indoor · ERG</span>' : '') + '</div>' +
      '<button class="btn" data-action="ed-lib">' + ICON.book + ' Start from a library workout</button></section>';
    if (d.sport === 'WeightTraining') {
      const warm = d.blocks.findIndex(b => b.kind !== 'lift');
      const lifts = d.blocks.map((b, i) => ({ b, i })).filter(x => x.b.kind === 'lift');
      if (warm >= 0) h += '<section class="card"><div class="ed-row"><b class="grow">Warm-up</b>' + durInputs(d.blocks[warm], warm) + '</div></section>';
      h += '<span class="eyebrow">EXERCISES</span><div class="list">' + lifts.map((x, k) => edLift(x.b, x.i, k, lifts.length)).join('') + '</div>' +
        '<button class="btn" data-action="ed-add-lift">' + ICON.plus + ' Add exercise</button><div class="tiny">Each exercise gets about 2 minutes per set, rest included, on the watch timer.</div>';
    } else {
      h += '<section class="card">' + shapeBar(d, 40) + '<div class="row-between tiny"><span>Total ' + C.fmtDur(C.totalSec(d.blocks)) + '</span><span>' + d.blocks.length + (d.blocks.length === 1 ? ' block' : ' blocks') + '</span></div></section>';
      h += '<span class="eyebrow">STEPS</span><div class="list">';
      d.blocks.forEach((b, i) => {
        if (b.repeat) {
          h += '<div class="card repeat ed-rep"><div class="ed-row"><input type="text" value="' + esc(b.label) + '" data-ef="replabel" data-p="' + i + '" aria-label="Repeat name" maxlength="30">' + moveBtns(i, i, d.blocks.length) + '</div>' +
            '<div class="ed-row"><span class="rep grow">REPEAT</span><button class="mini" data-action="ed-rep" data-d="-1" data-p="' + i + '" aria-label="One fewer round"' + (b.repeat <= 1 ? ' disabled' : '') + '>' + ICON.minus + '</button><b class="count">' + b.repeat + '×</b><button class="mini" data-action="ed-rep" data-d="1" data-p="' + i + '" aria-label="One more round"' + (b.repeat >= 30 ? ' disabled' : '') + '>' + ICON.plus + '</button></div>' +
            b.steps.map((st, j) => edStep(st, i + '.' + j, j, b.steps.length)).join('') +
            '<button class="btn small-btn" data-action="ed-add-step" data-p="' + i + '">' + ICON.plus + ' Step in this repeat</button></div>';
        } else h += '<div class="card">' + edStep(b, String(i), i, d.blocks.length) + '</div>';
      });
      h += '</div><div class="grid2"><button class="btn" data-action="ed-add-step">' + ICON.plus + ' Step</button><button class="btn" data-action="ed-add-rep">' + ICON.plus + ' Repeat block</button></div>';
    }
    h += '<button class="btn primary" data-action="ed-save">' + (isDemo() ? 'Save' : 'Save and send to watch') + '</button><button class="btn ghost" data-action="ed-cancel">Cancel</button>';
    return h;
  }
  function newStep(d) {
    if (d.sport === 'VirtualRide') return C.pw('Steady', 300, 65, 75);
    return { label: 'Easy', sec: 300, zone: d.sport ? (S.easyCeiling !== false ? [1, 2] : [2, 2]) : null, kind: 'easy' };
  }
  function editAction(a, el) {
    const d = UI.edit.draft, p = el.dataset.p;
    if (a === 'ed-up' || a === 'ed-down') {
      const L = locate(p), j = L.i + (a === 'ed-up' ? -1 : 1);
      if (j < 0 || j >= L.arr.length) return;
      const tmp = L.arr[j]; L.arr[j] = L.arr[L.i]; L.arr[L.i] = tmp;
    } else if (a === 'ed-del') {
      const L = locate(p); L.arr.splice(L.i, 1);
      if (L.parent && !L.parent.steps.length) d.blocks.splice(Number(p.split('.')[0]), 1);
    } else if (a === 'ed-rep') {
      const b = d.blocks[Number(p)]; b.repeat = Math.max(1, Math.min(30, b.repeat + Number(el.dataset.d)));
    } else if (a === 'ed-add-step') {
      const st = newStep(d);
      if (p != null) d.blocks[Number(p)].steps.push(st); else d.blocks.push(st);
    } else if (a === 'ed-add-rep') {
      d.blocks.push(d.sport === 'VirtualRide'
        ? { repeat: 3, label: 'Intervals', steps: [Object.assign(C.pw('Work', 300, 88, 93), { kind: 'work' }), Object.assign(C.pw('Recover', 180, 50, 55), { kind: 'rec' })] }
        : { repeat: 3, label: 'Intervals', steps: [{ label: 'Work', sec: 180, zone: [4, 4], kind: 'work' }, { label: 'Recover', sec: 120, zone: [1, 1], kind: 'rec' }] });
    } else if (a === 'ed-add-lift' || a === 'ed-pick') {
      UI.edit.picker = { path: a === 'ed-pick' ? p : null, q: '', eq: 'dumbbell' }; loadExLib(); render(); window.scrollTo(0, 0); return;
    } else if (a === 'ed-pick-close') UI.edit.picker = null;
    else if (a === 'ed-pick-eq') UI.edit.picker.eq = el.dataset.eq;
    else if (a === 'ed-pick-choose' || a === 'ed-pick-custom') {
      const Pk = UI.edit.picker, e = a === 'ed-pick-choose' ? EXMAP[el.dataset.id] : null;
      const move = e ? e.name : Pk.q.trim().slice(0, 40);
      if (!move) return;
      if (Pk.path == null) { const b = { label: '', sec: 360, zone: null, kind: 'lift', move, sets: 3, reps: '10', ex: e ? e.id : null, perSet: 120 }; b.label = C.liftLabel(b); d.blocks.push(b); }
      else { const L = locate(Pk.path); L.item.move = move; L.item.ex = e ? e.id : null; L.item.label = C.liftLabel(L.item); }
      UI.edit.picker = null;
    } else if (a === 'ed-lib') { UI.edit.lib = true; render(); window.scrollTo(0, 0); return; }
    else if (a === 'ed-lib-close') UI.edit.lib = false;
    else if (a === 'ed-save') { saveEdit(); return; }
    else if (a === 'ed-cancel') { UI.detail = UI.edit.date; UI.edit = null; }
    render();
  }
  function editField(el) {
    const d = UI.edit.draft;
    if (el.dataset.ed === 'name') { d.name = el.value.trim() || d.name; return; }
    const L = locate(el.dataset.p), it = L.item, f = el.dataset.ef;
    if (!it) return;
    if (f === 'label') it.label = el.value.trim() || it.label;
    else if (f === 'replabel') it.label = el.value.trim() || 'Intervals';
    else if (f === 'min') it.sec = clampSec(Math.max(0, Number(el.value) || 0) * 60 + it.sec % 60);
    else if (f === 'sec') it.sec = clampSec(Math.floor(it.sec / 60) * 60 + Number(el.value));
    else if (f === 'zone') it.zone = el.value ? el.value.split('-').map(Number) : null;
    else if (f === 'pw') { if (el.value) it.pw = el.value.split('-').map(Number); else delete it.pw; delete it.ramp; }
    else if (f === 'move') it.move = el.value.trim() || it.move;
    else if (f === 'sets') { it.sets = Number(el.value); it.sec = it.sets * (it.perSet || 120); }
    else if (f === 'reps') it.reps = el.value.trim() || it.reps;
    if (it.kind === 'lift') it.label = C.liftLabel(it);
    if ((f === 'zone' || f === 'pw') && it.kind !== 'warm' && it.kind !== 'cool') it.kind = C.stepLevel(it) >= 3 ? 'work' : (it.kind === 'work' ? 'easy' : it.kind);
    render();
  }
  function saveEdit() {
    const E = UI.edit, d = E.draft;
    if (d.sport && !d.blocks.length) { toast('Add at least one step, or use Change → Make it a rest day.', true); return; }
    S.overrides[E.date] = pickFields(Object.assign({}, d, { notes: [] }));
    saveSettings();
    UI.detail = E.date; UI.edit = null; render();
    afterChange(E.date, 'Saved.');
  }

  /* ---------------- render ---------------- */
  let pendingRender = false;
  function currentView() {
    if (UI.edit) return UI.edit.picker ? viewPicker() : UI.edit.lib ? viewLibrary(true) : viewEdit();
    if (UI.detail) return viewDay();
    if (UI.view === 'today') return viewToday();
    if (UI.view === 'plan') return viewPlan();
    if (UI.view === 'library') return UI.lib.open ? viewTemplate() : viewLibrary(false);
    if (UI.view === 'data') return UI.data.act ? viewActivity() : UI.data.day ? viewWellnessDay() : viewData();
    return UI.sub ? viewSettingsSub() : viewSettings();
  }
  function render() {
    pendingRender = false;
    CH.reset();
    const view = document.getElementById('view');
    view.innerHTML = currentView();
    CH.bind(view);
    const top = !UI.edit && !UI.detail && !UI.lib.open && !UI.data.act && !UI.data.day && !UI.sub;
    document.querySelectorAll('nav [data-view]').forEach(b => b.setAttribute('aria-current', b.dataset.view === UI.view ? (top ? 'page' : 'true') : 'false'));
    paintStatus();
  }
  // Background updates wait while you're typing in a field, so focus isn't lost.
  function renderSoft() {
    const ae = document.activeElement;
    if (ae && ae.closest && ae.closest('#view') && /INPUT|SELECT|TEXTAREA/.test(ae.tagName) && ae.type !== 'checkbox') { pendingRender = true; paintStatus(); return; }
    if (UI.edit) { paintStatus(); return; }
    render();
  }
  document.addEventListener('focusout', () => setTimeout(() => { if (pendingRender && !(document.activeElement && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName))) render(); }, 0));
  const goTop = () => window.scrollTo(0, 0);

  /* ---------------- events ---------------- */
  const ACTIONS = {
    go: el => {
      if (UI.edit && !confirm('Leave without saving your changes?')) return;
      const v = el.dataset.view;
      if (v === UI.view && !UI.edit && !UI.detail) { UI.lib.open = null; UI.lib.pick = null; UI.data.act = null; UI.data.day = null; UI.sub = null; }
      if (v !== 'library' && UI.lib.pick) { UI.lib.pick = null; UI.lib.open = null; }
      UI.view = v; UI.detail = null; UI.edit = null; render(); goTop();
    },
    'go-sub': el => { UI.view = 'settings'; UI.sub = el.dataset.sub; UI.detail = null; render(); goTop(); },
    'sub-back': () => { UI.sub = null; render(); },
    'go-readiness': () => { UI.view = 'data'; UI.data.tab = 'trends'; UI.data.act = null; UI.data.day = null; render(); const r = document.getElementById('readiness'); if (r) r.scrollIntoView(); },
    open: el => { UI.detail = el.dataset.date; UI.sheet = null; renderSheet(); render(); goTop(); },
    back: () => { UI.detail = null; render(); },
    edit: () => { startEdit(UI.detail); render(); goTop(); },
    change: el => { UI.sheet = { date: el.dataset.date }; renderSheet(); },
    'sheet-close': () => { UI.sheet = null; renderSheet(); },
    reset: el => resetDay(el.dataset.date || UI.detail),
    'ch-easier': el => {
      const s = sessionFor(el.dataset.date);
      const out = C.adapt(Object.assign(C.clone(s), { adjusted: false, notes: [] }), { band: 'easy', score: 0, reasons: ['You asked for an easier day'] }, settings());
      applyOverride(s.date, out, 'Made it easier.');
    },
    'ch-indoor': el => { const s = sessionFor(el.dataset.date); applyOverride(s.date, C.toIndoor(s), s.sport === 'Ride' ? 'Moved to Zwift.' : 'Moved to the treadmill.'); },
    'ch-outdoor': el => { const s = sessionFor(el.dataset.date); applyOverride(s.date, C.toOutdoor(s, settings()), 'Moved outside.'); },
    'ch-rest': el => applyOverride(el.dataset.date, null, 'Made it a rest day.'),
    'ch-edit': el => { startEdit(el.dataset.date); render(); goTop(); },
    'ch-library': el => { UI.sheet = null; renderSheet(); UI.lib.pick = { date: el.dataset.date }; UI.lib.open = null; UI.view = 'library'; UI.detail = null; render(); goTop(); },
    'lib-cancel': () => { const d = UI.lib.pick && UI.lib.pick.date; UI.lib.pick = null; UI.detail = d; render(); },
    'lib-cat': el => { UI.lib.cat = el.dataset.cat; render(); },
    'open-tpl': el => {
      if (UI.edit && UI.edit.lib) { const t = LIB.get(el.dataset.id); UI.edit.draft = draftFrom(LIB.toSession(t, UI.edit.date)); UI.edit.lib = false; render(); goTop(); return; }
      UI.lib.open = el.dataset.id; render(); goTop();
    },
    'tpl-back': () => { UI.lib.open = null; render(); },
    'tpl-date': el => { UI.lib.date = el.dataset.date; render(); },
    'tpl-schedule': () => { const t = LIB.get(UI.lib.open), date = UI.lib.date || today(); S.overrides[date] = pickFields(LIB.toSession(t, date)); saveSettings(); UI.lib.open = null; UI.detail = date; render(); goTop(); afterChange(date, 'Scheduled ' + t.name + ' on ' + fmtDate(date) + '.'); },
    'tpl-use': () => { const t = LIB.get(UI.lib.open), date = UI.lib.pick.date; S.overrides[date] = pickFields(LIB.toSession(t, date)); saveSettings(); UI.lib.open = null; UI.lib.pick = null; UI.view = 'today'; UI.detail = date; render(); goTop(); afterChange(date, 'Swapped in ' + t.name + '.'); },
    'tpl-customize': () => { const t = LIB.get(UI.lib.open), date = UI.lib.date || today(); UI.lib.open = null; startEdit(date, LIB.toSession(t, date)); render(); goTop(); },
    week: el => { UI.planWeek = Math.max(-8, Math.min(6, UI.planWeek + Number(el.dataset.d))); render(); },
    send: () => sendWeek(),
    refresh: () => { if (!busy()) loadAll({ skipAuto: true }); },
    syncZones: () => syncZones(),
    test: () => testConnection(),
    'data-tab': el => { UI.data.tab = el.dataset.tab; render(); },
    'data-range': el => { UI.data.range = Number(el.dataset.n); render(); },
    'open-act': el => { UI.view = 'data'; UI.data.tab = 'activities'; UI.data.act = el.dataset.id; UI.detail = null; render(); goTop(); },
    'act-back': () => { UI.data.act = null; render(); },
    'open-day': el => { UI.data.day = el.dataset.date; render(); goTop(); },
    'day-back': () => { UI.data.day = null; render(); },
    export: () => exportCsv(),
    units: el => { S.units = el.dataset.u; saveSettings(); render(); },
    'reset-all': () => {
      if (!confirm('Remove your API key, schedule, edits and cached data from this phone?')) return;
      try { localStorage.removeItem(LS_KEY); localStorage.removeItem(DATA_KEY); } catch (e) { /* ignore */ }
      S = loadSettings(); D = EMPTY(); UI.sub = null; UI.view = 'today'; loadAll();
    },
  };
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const a = el.dataset.action;
    if (a.indexOf('ed-') === 0) { if (UI.edit) editAction(a, el); return; }
    if (ACTIONS[a]) ACTIONS[a](el, e);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && UI.sheet) { UI.sheet = null; renderSheet(); return; }
    const el = e.target.closest && e.target.closest('tr[data-action]');
    if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); ACTIONS[el.dataset.action](el); }
  });
  document.addEventListener('change', e => {
    const el = e.target;
    if (UI.edit && (el.dataset.ed || el.dataset.ef)) { editField(el); return; }
    if (el.dataset.setting) {
      const k = el.dataset.setting, was = S[k];
      S[k] = el.type === 'checkbox' ? el.checked : el.value.trim();
      if (k === 'age') S.age = Number(S.age) || 36;
      if (k === 'apiKey' && S.apiKey && !S.planStart) S.planStart = C.mondayOf(today());
      saveSettings();
      if ((k === 'apiKey' || k === 'athleteId') && was !== S[k]) { D = EMPTY(); loadCache(); render(); loadAll({ skipAuto: true }); return; }
      render();
    } else if (el.dataset.schedule) { S.schedule[el.dataset.schedule] = el.value; saveSettings(); render(); }
  });
  document.addEventListener('input', e => {
    const el = e.target;
    if (el.dataset.pickQ && UI.edit && UI.edit.picker) { UI.edit.picker.q = el.value; const r = document.getElementById('pick-results'); if (r) r.innerHTML = pickResults(); }
    if (el.dataset.libQ) { UI.lib.q = el.value; const r = document.getElementById('lib-results'); if (r) r.innerHTML = libResults(); }
  });

  /* ---------------- start ---------------- */
  loadCache();
  render();
  window.addEventListener('pageshow', () => loadAll());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || isDemo()) return;
    const stale = !D.syncedAt || Date.now() - new Date(D.syncedAt) > 15 * 60000;
    if (stale || (S.lastSent || '').slice(0, 10) !== today()) loadAll();
  });
})();
