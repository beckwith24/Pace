/* Pace charts: small inline-SVG line, column, diverging and stacked charts
   with a crosshair / per-bar tooltip that works with touch and keyboard. */
const PaceCharts = (function () {
  const REG = {};
  let seq = 0;
  const W = 340, PL = 36, PR = 10, PT = 10, PB = 22;
  const GRID = '#262C36', AXIS = '#9AA4B2', SURF = '#171B22';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function nice(min, max, count) {
    if (!isFinite(min) || !isFinite(max)) { min = 0; max = 1; }
    if (min === max) { min -= 1; max += 1; }
    const step0 = (max - min) / count, mag = Math.pow(10, Math.floor(Math.log10(step0))), err = step0 / mag;
    const step = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * mag;
    const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step, ticks = [];
    for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toFixed(6));
    return { lo, hi, ticks };
  }
  function shortDate(d) {
    const [y, m, dd] = d.split('-').map(Number);
    return new Date(y, m - 1, dd).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  function tickFmt(v) { return Math.abs(v) >= 1000 ? (v / 1000).toFixed(v % 1000 ? 1 : 0) + 'K' : String(+v.toFixed(1)); }

  function frame(id, H, y, labels, xs, aria) {
    let g = '';
    y.ticks.forEach(t => {
      const yy = y.at(t);
      g += '<line x1="' + PL + '" x2="' + (W - PR) + '" y1="' + yy + '" y2="' + yy + '" stroke="' + GRID + '" stroke-width="1" vector-effect="non-scaling-stroke"/>' +
        '<text x="' + (PL - 6) + '" y="' + (yy + 3.5) + '" text-anchor="end" class="ax">' + esc((y.fmt || tickFmt)(t)) + '</text>';
    });
    const n = labels.length, picks = n <= 1 ? [0] : n <= 3 ? labels.map((_, i) => i) : [0, Math.round((n - 1) / 2), n - 1];
    picks.forEach((i, k) => {
      const anchor = picks.length > 1 && k === 0 ? 'start' : picks.length > 1 && k === picks.length - 1 ? 'end' : 'middle';
      g += '<text x="' + xs(i) + '" y="' + (H - 6) + '" text-anchor="' + anchor + '" class="ax">' + esc(labels[i]) + '</text>';
    });
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(aria) + '">' + g;
  }
  function yScale(min, max, H, count, fmt) {
    const t = nice(min, max, count || 3), top = PT, bot = H - PB;
    return { ticks: t.ticks, lo: t.lo, hi: t.hi, fmt, at: v => +(bot - (v - t.lo) / (t.hi - t.lo) * (bot - top)).toFixed(2) };
  }
  function legend(items, kind) {
    if (items.length < 2) return '';
    return '<div class="lg">' + items.map(s => '<span><i class="' + (kind || 'ln') + '" style="background:' + s.color + '"></i>' + esc(s.name) + '</span>').join('') + '</div>';
  }
  function wrap(id, inner, aria, extra) {
    return '<figure class="chart" data-chart="' + id + '" tabindex="0" aria-label="' + esc(aria) + ' Use arrow keys to read values.">' + (extra || '') + inner + '<div class="ctip" hidden></div></figure>';
  }
  const has = v => v != null && isFinite(v);

  /* line: {dates, series:[{name,color,values}], band?:{lo,hi,color,name}, fmt, unit, height, yMin, yMax, aria} */
  function line(cfg) {
    const id = 'c' + (++seq), H = cfg.height || 150, n = cfg.dates.length;
    const all = [];
    cfg.series.forEach(s => s.values.forEach(v => { if (has(v)) all.push(v); }));
    if (cfg.band) cfg.band.lo.concat(cfg.band.hi).forEach(v => { if (has(v)) all.push(v); });
    if (!all.length) return '<div class="chart-empty">No data in this range yet.</div>';
    let min = Math.min.apply(null, all), max = Math.max.apply(null, all);
    const pad = (max - min) * 0.1 || 1;
    min = cfg.yMin != null ? cfg.yMin : min - pad; max = cfg.yMax != null ? cfg.yMax : max + pad;
    const y = yScale(min, max, H, 3, cfg.tick);
    const step = n > 1 ? (W - PL - PR) / (n - 1) : 0, xs = i => +(PL + i * step).toFixed(2);
    let svg = frame(id, H, y, cfg.dates.map(shortDate), xs, cfg.aria);
    if (cfg.band) {
      let seg = [];
      const flush = () => {
        if (seg.length > 1) svg += '<path d="M' + seg.map(i => xs(i) + ',' + y.at(cfg.band.hi[i])).join('L') + 'L' + seg.slice().reverse().map(i => xs(i) + ',' + y.at(cfg.band.lo[i])).join('L') + 'Z" fill="' + cfg.band.color + '" fill-opacity="0.12"/>';
        seg = [];
      };
      for (let i = 0; i < n; i++) { if (has(cfg.band.lo[i]) && has(cfg.band.hi[i])) seg.push(i); else flush(); }
      flush();
    }
    cfg.series.forEach(s => {
      let d = '', pen = false, last = -1;
      s.values.forEach((v, i) => { if (has(v)) { d += (pen ? 'L' : 'M') + xs(i) + ',' + y.at(v); pen = true; last = i; } else pen = false; });
      svg += '<path d="' + d + '" fill="none" stroke="' + s.color + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>';
      s.values.forEach((v, i) => { if (has(v) && !has(s.values[i - 1]) && !has(s.values[i + 1])) svg += '<circle cx="' + xs(i) + '" cy="' + y.at(v) + '" r="2.5" fill="' + s.color + '"/>'; });
      if (last >= 0) svg += '<circle cx="' + xs(last) + '" cy="' + y.at(s.values[last]) + '" r="4" fill="' + s.color + '" stroke="' + SURF + '" stroke-width="2"/>';
    });
    svg += '<line class="xh" x1="0" x2="0" y1="' + PT + '" y2="' + (H - PB) + '" stroke="' + AXIS + '" stroke-width="1" vector-effect="non-scaling-stroke" visibility="hidden"/>';
    svg += '<g class="hdots"></g><rect class="hit" x="' + PL + '" y="0" width="' + (W - PL - PR) + '" height="' + (H - PB) + '" fill="transparent"/></svg>';
    REG[id] = { kind: 'line', n, xs, y, H, dates: cfg.dates, series: cfg.series, band: cfg.band, fmt: cfg.fmt };
    const items = cfg.series.map(s => ({ name: s.name, color: s.color }));
    if (cfg.band) items.push({ name: cfg.band.name, color: cfg.band.color, band: true });
    return wrap(id, svg, cfg.aria, cfg.series.length > 1 || cfg.band ? '<div class="lg">' + items.map(s => '<span><i class="' + (s.band ? 'bd' : 'ln') + '" style="background:' + s.color + '"></i>' + esc(s.name) + '</span>').join('') + '</div>' : '');
  }

  function barPath(x, y0, y1, w, r) {
    // column from baseline y0 to data end y1, rounded only at the data end
    const up = y1 < y0, h = Math.abs(y0 - y1);
    r = Math.min(r, w / 2, h);
    if (h < 0.5) return '';
    if (r < 1) return 'M' + x + ',' + y0 + 'h' + w + 'V' + y1 + 'h' + (-w) + 'Z';
    return up
      ? 'M' + x + ',' + y0 + 'V' + (y1 + r) + 'Q' + x + ',' + y1 + ' ' + (x + r) + ',' + y1 + 'H' + (x + w - r) + 'Q' + (x + w) + ',' + y1 + ' ' + (x + w) + ',' + (y1 + r) + 'V' + y0 + 'Z'
      : 'M' + x + ',' + y0 + 'V' + (y1 - r) + 'Q' + x + ',' + y1 + ' ' + (x + r) + ',' + y1 + 'H' + (x + w - r) + 'Q' + (x + w) + ',' + y1 + ' ' + (x + w) + ',' + (y1 - r) + 'V' + y0 + 'Z';
  }

  /* columns: {dates|labels, values, color | colorFn, fmt, height, diverging, aria, ref:{v,label}} */
  function columns(cfg) {
    const id = 'c' + (++seq), H = cfg.height || 130, labels = cfg.labels || cfg.dates.map(shortDate), n = labels.length;
    const vals = cfg.values.filter(has);
    if (!vals.length) return '<div class="chart-empty">No data in this range yet.</div>';
    let min = Math.min(0, Math.min.apply(null, vals)), max = Math.max(0, Math.max.apply(null, vals));
    if (cfg.ref) max = Math.max(max, cfg.ref.v);
    const y = yScale(min, max * 1.05 || 1, H, 3, cfg.tick);
    const band = (W - PL - PR) / n, bw = Math.max(1, Math.min(24, band - (band > 6 ? 2 : 1))), xs = i => +(PL + band * i + band / 2).toFixed(2);
    let svg = frame(id, H, y, labels, xs, cfg.aria);
    if (cfg.ref) svg += '<line x1="' + PL + '" x2="' + (W - PR) + '" y1="' + y.at(cfg.ref.v) + '" y2="' + y.at(cfg.ref.v) + '" stroke="' + AXIS + '" stroke-opacity=".6" stroke-width="1" vector-effect="non-scaling-stroke"/><text x="' + (W - PR) + '" y="' + (y.at(cfg.ref.v) - 4) + '" text-anchor="end" class="ax">' + esc(cfg.ref.label) + '</text>';
    const y0 = y.at(0);
    cfg.values.forEach((v, i) => {
      if (!has(v) || v === 0) return;
      const col = cfg.colorFn ? cfg.colorFn(v) : cfg.color;
      svg += '<path class="bar" data-i="' + i + '" d="' + barPath(+(xs(i) - bw / 2).toFixed(2), y0, y.at(v), bw, 4) + '" fill="' + col + '"/>';
    });
    if (min < 0) svg += '<line x1="' + PL + '" x2="' + (W - PR) + '" y1="' + y0 + '" y2="' + y0 + '" stroke="' + AXIS + '" stroke-width="1" vector-effect="non-scaling-stroke"/>';
    svg += '<rect class="hit" x="' + PL + '" y="0" width="' + (W - PL - PR) + '" height="' + (H - PB) + '" fill="transparent"/></svg>';
    REG[id] = { kind: 'bars', n, xs: i => xs(i), band, labels: cfg.dates || labels, values: cfg.values, fmt: cfg.fmt, name: cfg.name, colorFn: cfg.colorFn, color: cfg.color };
    return wrap(id, svg, cfg.aria, cfg.legend ? legend(cfg.legend, 'sq') : '');
  }

  /* stacked: {labels, keys:[{key,label,color}], rows:[{...}], fmt, tick, aria} */
  function stacked(cfg) {
    const id = 'c' + (++seq), H = cfg.height || 150, n = cfg.labels.length;
    const totals = cfg.rows.map(r => cfg.keys.reduce((a, k) => a + (r[k.key] || 0), 0));
    if (!totals.some(t => t > 0)) return '<div class="chart-empty">No activities in this range yet.</div>';
    const y = yScale(0, Math.max.apply(null, totals) * 1.05, H, 3, cfg.tick);
    const band = (W - PL - PR) / n, bw = Math.min(24, band - 2), xs = i => +(PL + band * i + band / 2).toFixed(2);
    let svg = frame(id, H, y, cfg.labels, xs, cfg.aria);
    cfg.rows.forEach((r, i) => {
      let base = 0;
      const segs = cfg.keys.filter(k => (r[k.key] || 0) > 0);
      segs.forEach((k, j) => {
        const v = r[k.key], top = j === segs.length - 1;
        const yb = y.at(base) - (j ? 1 : 0), yt = y.at(base + v) + (top ? 0 : 1); // 2px surface gap between segments
        if (yb - yt > 0.5) svg += '<path class="bar" data-i="' + i + '" d="' + (top ? barPath(+(xs(i) - bw / 2).toFixed(2), yb, yt, bw, 4) : 'M' + (xs(i) - bw / 2) + ',' + yb + 'h' + bw + 'V' + yt + 'h' + (-bw) + 'Z') + '" fill="' + k.color + '"/>';
        base += v;
      });
    });
    svg += '<rect class="hit" x="' + PL + '" y="0" width="' + (W - PL - PR) + '" height="' + (H - PB) + '" fill="transparent"/></svg>';
    REG[id] = { kind: 'stack', n, xs, labels: cfg.labels, rows: cfg.rows, keys: cfg.keys, fmt: cfg.fmt, totals };
    return wrap(id, svg, cfg.aria, legend(cfg.keys.map(k => ({ name: k.label, color: k.color })), 'sq'));
  }

  /* ---------- interaction ---------- */
  function row(color, value, name, kind) {
    const r = document.createElement('div'); r.className = 'tr';
    const k = document.createElement('i'); k.className = kind || 'ln'; k.style.background = color;
    const b = document.createElement('b'); b.textContent = value;
    const s = document.createElement('span'); s.textContent = name;
    r.append(k, b, s); return r;
  }
  function show(fig, i) {
    const c = REG[fig.dataset.chart]; if (!c) return;
    i = Math.max(0, Math.min(c.n - 1, i)); fig._i = i;
    const tip = fig.querySelector('.ctip'), svg = fig.querySelector('svg');
    tip.textContent = '';
    const h = document.createElement('div'); h.className = 'th';
    h.textContent = c.kind === 'stack' ? 'Week of ' + c.labels[i] : (c.dates ? new Date(c.dates[i] + 'T12:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : c.labels[i]);
    tip.appendChild(h);
    if (c.kind === 'line') {
      const xh = svg.querySelector('.xh'), x = c.xs(i);
      xh.setAttribute('x1', x); xh.setAttribute('x2', x); xh.setAttribute('visibility', 'visible');
      const dots = svg.querySelector('.hdots'); dots.innerHTML = '';
      c.series.forEach(s => {
        const v = s.values[i];
        tip.appendChild(row(s.color, has(v) ? c.fmt(v) : '—', s.name));
        if (has(v)) {
          const d = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          d.setAttribute('cx', x); d.setAttribute('cy', c.y.at(v)); d.setAttribute('r', 4); d.setAttribute('fill', s.color); d.setAttribute('stroke', SURF); d.setAttribute('stroke-width', 2);
          dots.appendChild(d);
        }
      });
      if (c.band && has(c.band.lo[i])) tip.appendChild(row(c.band.color, c.fmt(c.band.lo[i]) + '–' + c.fmt(c.band.hi[i]), c.band.name, 'bd'));
    } else if (c.kind === 'bars') {
      const v = c.values[i];
      tip.appendChild(row(has(v) ? (c.colorFn ? c.colorFn(v) : c.color) : AXIS, has(v) ? c.fmt(v) : '—', c.name || '', 'sq'));
    } else {
      c.keys.slice().reverse().forEach(k => { const v = c.rows[i][k.key] || 0; if (v) tip.appendChild(row(k.color, c.fmt(v), k.label, 'sq')); });
      tip.appendChild(row('transparent', c.fmt(c.totals[i]), 'Total', 'sq'));
    }
    svg.querySelectorAll('.bar').forEach(b => b.classList.toggle('dim', c.kind !== 'line' && +b.dataset.i !== i));
    tip.hidden = false;
    const rect = svg.getBoundingClientRect(), px = c.xs(i) * rect.width / W;
    const tw = tip.offsetWidth, fw = fig.clientWidth;
    let left = px + 12;
    if (left + tw > fw - 4) left = px - tw - 12;
    tip.style.left = Math.max(4, left) + 'px';
  }
  function hide(fig) {
    const tip = fig.querySelector('.ctip'), svg = fig.querySelector('svg');
    if (tip) tip.hidden = true;
    if (!svg) return;
    const xh = svg.querySelector('.xh'); if (xh) xh.setAttribute('visibility', 'hidden');
    const d = svg.querySelector('.hdots'); if (d) d.innerHTML = '';
    svg.querySelectorAll('.bar.dim').forEach(b => b.classList.remove('dim'));
  }
  function indexAt(fig, clientX) {
    const c = REG[fig.dataset.chart], svg = fig.querySelector('svg'), rect = svg.getBoundingClientRect();
    const x = (clientX - rect.left) * W / rect.width;
    if (c.kind === 'line') return Math.round((x - PL) / ((W - PL - PR) / Math.max(1, c.n - 1)));
    return Math.floor((x - PL) / ((W - PL - PR) / c.n));
  }
  function bind(root) {
    root.querySelectorAll('figure.chart').forEach(fig => {
      const svg = fig.querySelector('svg'); if (!svg) return;
      const move = e => show(fig, indexAt(fig, e.clientX));
      svg.addEventListener('pointermove', move);
      svg.addEventListener('pointerdown', move);
      svg.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hide(fig); });
      fig.addEventListener('keydown', e => {
        const c = REG[fig.dataset.chart]; if (!c) return;
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); show(fig, (fig._i == null ? c.n - 1 : fig._i + (e.key === 'ArrowRight' ? 1 : -1))); }
        if (e.key === 'Escape') hide(fig);
      });
      fig.addEventListener('blur', () => hide(fig));
    });
  }
  document.addEventListener('pointerdown', e => {
    document.querySelectorAll('figure.chart').forEach(f => { if (!f.contains(e.target)) hide(f); });
  });
  function reset() { Object.keys(REG).forEach(k => delete REG[k]); }
  return { line, columns, stacked, bind, reset, shortDate };
})();
