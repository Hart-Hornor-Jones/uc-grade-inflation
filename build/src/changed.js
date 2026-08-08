/* Tab 1 — What changed.  The staged opening triptych:
   A  how far grades moved, school by school
   B  that movement against an independent measure of the same students
   C  what the second panel cannot account for
   One population runs through all three: a school appears only if it clears the
   applicant threshold in BOTH windows and has the chosen anchor in both.  */
'use strict';

const $ = id => document.getElementById(id);

const DEF = {
  pool: HAS_UW ? -1 : 0, ser: 'app', anchor: 'census',
  p0a: 2016, p0b: 2019, p1a: 2023, p1b: 2025,
  gate: 30, wt: 'a', size: false, ref: 'fit', sel: null
};
const S = Object.assign({}, DEF);

/* red and blue mean above and below the reference — on this tab and nowhere else */
const ABOVE = '#FB0207', BELOW = '#0000FF';
const wOf = r => S.wt === 'a' ? r.w : 1;
const eraYears = (a, b) => yearsBetween(Math.min(a, b), Math.max(a, b));

/* ---- the panel every figure reads ------------------------------------- */
let D = null;
function computeAll() {
  const pre = eraYears(S.p0a, S.p0b), post = eraYears(S.p1a, S.p1b);
  const P = buildPanel({ ci: S.pool, pre, post, ruler: S.anchor, gate: S.gate,
                         ser: S.ser, betaMode: 'zero' });
  const rows = P.rows;
  const w = rows.map(wOf);
  const dG = rows.map(r => r.dG), dC = rows.map(r => r.dC);
  const out = { pre, post, rows, w, dG, dC, n: rows.length };
  if (rows.length >= 3) {
    out.b = wslope(dC, dG, w);
    out.a = wmean(dG, w) - out.b * wmean(dC, w);
    const sy = wsd(dG, w), sx = wsd(dC, w);
    out.s = (sx > 0) ? sy / sx : 0;
    out.mdG = wmean(dG, w); out.mdC = wmean(dC, w);
    out.seG = bootSE(dG, w);
    out.posG = 100 * wmean(dG.map(v => v > 0 ? 1 : 0), w);
    out.r = wcorr(dC, dG, w);
  }
  // the residual, under whichever reference panel B is showing
  out.res = rows.map((r, i) => S.ref === 'fit'
    ? r.dG - (out.a + out.b * r.dC)
    : r.dG - out.s * r.dC);
  if (rows.length >= 3) {
    out.mres = wmean(out.res, w);
    out.seres = bootSE(out.res, w);
    out.posres = 100 * wmean(out.res.map(v => v > 0 ? 1 : 0), w);
  }
  out.byId = new Map(rows.map((r, i) => [r.si, i]));
  return out;
}

/* ---- beeswarm layout ---------------------------------------------------- */
/* Values are laid out on x; where dots would overlap they are stacked outward
   from the center line.  The vertical position carries no meaning. */
function swarm(vals, radii, x, halfHeight) {
  const idx = vals.map((v, i) => i).filter(i => isFinite(vals[i]))
                  .sort((a, b) => vals[a] - vals[b]);
  const lastX = [], lastR = [];
  const out = new Array(vals.length).fill(null);
  for (const i of idx) {
    const px = x(vals[i]), r = radii[i];
    let lane = 0;
    for (let k = 0; ; k++) {
      const cand = k === 0 ? 0 : (k % 2 ? (k + 1) / 2 : -k / 2);
      const j = cand + 200;                       // lane arrays are center-offset
      if (lastX[j] === undefined || px - lastX[j] >= r + lastR[j]) { lane = cand; lastX[j] = px; lastR[j] = r; break; }
      if (k > 380) { lane = cand; lastX[j] = px; lastR[j] = r; break; }
    }
    out[i] = { px, lane, r };
  }
  // Stack outward from the center, then compress the stack so it always fits the
  // panel: at this many schools the deepest column is far taller than the figure,
  // and a swarm that overflows its own axes is worse than one that overlaps.
  const maxR = Math.max(...radii);
  let maxLane = 0;
  for (const o of out) if (o) maxLane = Math.max(maxLane, Math.abs(o.lane));
  let step = maxR * 2 + 0.6;
  const room = halfHeight - maxR;
  if (maxLane > 0 && maxLane * step > room) step = room / maxLane;
  for (const o of out) if (o) o.cy = o.lane * step;
  return out;
}
function radiiFor(rows) {
  const base = Math.max(1.9, Math.min(3.4, 2400 / Math.max(1, rows.length)));
  if (!S.size) return rows.map(() => base);
  const a = rows.map(r => r.w), lo = Math.min(...a), hi = Math.max(...a);
  return a.map(v => hi > lo ? base * .62 + base * 1.5 * Math.sqrt((v - lo) / (hi - lo)) : base);
}

/* ---- shared chrome ------------------------------------------------------ */
function schoolTip(i, extra) {
  const r = D.rows[i], s = SCH[r.si];
  return `<b>${s[1]}</b><br><span class="muted">${s[2]}, ${s[3]} County</span>`
    + `<br>grade change <b>${sgn(r.dG, 3)}</b>`
    + `<br>anchor change <b>${sgn(r.dC, anchorDp())}</b> ${anchorUnit()}`
    + (extra || '')
    + `<br><span class="muted">${Math.round(r.Ap).toLocaleString()} then ${Math.round(r.Aq).toLocaleString()} applicants</span>`
    + `<br><span class="muted">click to hold this school; click again to open its own page</span>`;
}
/* how a CHANGE in each anchor reads in prose (RULERS[].unit describes a level) */
const UNITPHRASE = {
  census: 'percentage points at or above the bar',
  censusz: 'standard deviations of school position',
  zsat: 'standard deviations of school position',
  act: 'percentage points of testers at 21 or better',
  appass: 'percentage points of exams at 3 or better',
  apge3: 'passes per senior'
};
const anchorUnit = () => UNITPHRASE[S.anchor] || RULERS[S.anchor].unit;
const anchorDp = () => (S.anchor === 'censusz' || S.anchor === 'zsat') ? 2 : 1;

function pick(si) {
  if (S.sel === si) { openSchool(si); return; }
  S.sel = si; render();
}
function openSchool(si) {
  if (window.__card && window.__card.load) window.__card.load(si);
  location.hash = '#school';
  if (window.__tabs && window.__tabs.show) window.__tabs.show();   // hashchange is async
}

/* ---- panel A ------------------------------------------------------------ */
function figA() {
  const svg = $('fig1'); clear(svg);
  const W = 900, H = 300, mL = 24, mR = 24, mT = 22, mB = 46;
  if (D.n < 3) { el('text', { x: 300, y: 120, class: 'axlab' }, svg).textContent = 'no schools clear these settings'; return; }
  const lo = Math.min(...D.dG), hi = Math.max(...D.dG), pad = (hi - lo) * .04 + 1e-4;
  const x = scale(lo - pad, hi + pad, mL, W - mR);
  const mid = (mT + H - mB) / 2;
  const g = el('g', {}, svg), ax = el('g', { class: 'ax' }, g);
  baseLine(g, mL, W - mR, H - mB);
  for (const t of niceTicks(x.dom[0], x.dom[1], 7)) {
    tickX(g, x(t), H - mB);
    el('text', { x: x(t), y: H - mB + 20, 'text-anchor': 'middle' }, ax).textContent = sgn(t, 2);
  }
  el('text', { x: (mL + W - mR) / 2, y: H - 6, 'text-anchor': 'middle', class: 'axlab' }, g)
    .textContent = 'change in the pool grade point average, measured inside the school';
  // zero and the weighted mean
  el('line', { x1: x(0), x2: x(0), y1: mT, y2: H - mB, stroke: '#000', 'stroke-width': 2.6 }, g);
  el('text', { x: x(0), y: mT - 7, 'text-anchor': 'middle', class: 'axlab' }, g).textContent = 'no change';
  const R = radiiFor(D.rows), sw = swarm(D.dG, R, x, (H - mB - mT) / 2);
  const col = poolColor(S.pool), edge = poolEdge(S.pool);
  const dots = el('g', {}, g);
  D.rows.forEach((r, i) => {
    const p = sw[i]; if (!p) return;
    const on = S.sel === r.si;
    const c = el('circle', {
      cx: p.px, cy: mid + p.cy, r: on ? Math.max(p.r, 5.5) : p.r,
      fill: col, stroke: on ? '#000' : edge, 'stroke-width': on ? 2.4 : (S.size ? .8 : 0),
      opacity: on ? 1 : .42, style: 'cursor:pointer'
    }, dots);
    c.addEventListener('mousemove', e => TIP.show(schoolTip(i), e.clientX, e.clientY));
    c.addEventListener('mouseleave', () => TIP.hide());
    c.addEventListener('click', () => pick(r.si));
  });
  const mx = x(D.mdG);
  el('line', { x1: mx, x2: mx, y1: mT, y2: H - mB, stroke: '#000', 'stroke-width': 2.2, 'stroke-dasharray': '7 5' }, g);
  el('text', { x: mx + 7, y: mT - 7, class: 'axlab' }, g).textContent = `average ${sgn(D.mdG, 3)}`;
}

/* ---- panel B ------------------------------------------------------------ */
function figB() {
  const svg = $('fig2'); clear(svg);
  const W = 900, H = 420, mL = 68, mR = 26, mT = 20, mB = 48;
  if (D.n < 3) { el('text', { x: 300, y: 200, class: 'axlab' }, svg).textContent = 'no schools clear these settings'; return; }
  const xlo = Math.min(0, Math.min(...D.dC)), xhi = Math.max(0, Math.max(...D.dC));
  const ylo = Math.min(0, Math.min(...D.dG)), yhi = Math.max(0, Math.max(...D.dG));
  const xp = (xhi - xlo) * .04 + 1e-6, yp = (yhi - ylo) * .04 + 1e-6;
  const x = scale(xlo - xp, xhi + xp, mL, W - mR), y = scale(ylo - yp, yhi + yp, H - mB, mT);
  const g = el('g', {}, svg), ax = el('g', { class: 'ax' }, g);
  spine(g, mL, mT, mL, H - mB);
  baseLine(g, mL, W - mR, H - mB);
  for (const t of niceTicks(y.dom[0], y.dom[1], 6)) {
    tickY(g, mL, y(t));
    el('text', { x: mL - 12, y: y(t) + 4, 'text-anchor': 'end' }, ax).textContent = sgn(t, 2);
  }
  for (const t of niceTicks(x.dom[0], x.dom[1], 7)) {
    tickX(g, x(t), H - mB);
    el('text', { x: x(t), y: H - mB + 20, 'text-anchor': 'middle' }, ax).textContent = sgn(t, anchorDp());
  }
  el('text', { x: (mL + W - mR) / 2, y: H - 6, 'text-anchor': 'middle', class: 'axlab' }, g)
    .textContent = `change in ${RULERS[S.anchor].label}${anchorUnit() ? ' (' + anchorUnit() + ')' : ''}`;
  el('text', { x: 15, y: (mT + H - mB) / 2, class: 'axlab', 'text-anchor': 'middle', transform: `rotate(-90 15 ${(mT + H - mB) / 2})` }, g)
    .textContent = 'change in the pool grade point average';
  // zero lines
  if (x.dom[0] <= 0 && x.dom[1] >= 0) el('line', { x1: x(0), x2: x(0), y1: mT, y2: H - mB, stroke: '#000', 'stroke-width': 2.6, opacity: .35 }, g);
  if (y.dom[0] <= 0 && y.dom[1] >= 0) baseLine(g, mL, W - mR, y(0));
  const dots = el('g', {}, g);
  const col = poolColor(S.pool), edge = poolEdge(S.pool);
  const R = radiiFor(D.rows);
  D.rows.forEach((r, i) => {
    const on = S.sel === r.si;
    const c = el('circle', {
      cx: x(r.dC), cy: y(r.dG), r: on ? Math.max(R[i], 6.5) : R[i],
      fill: col, stroke: on ? '#000' : edge, 'stroke-width': on ? 2.4 : (S.size ? .8 : 0),
      opacity: on ? 1 : .34, style: 'cursor:pointer'
    }, dots);
    c.addEventListener('mousemove', e => TIP.show(schoolTip(i, `<br>distance from the reference <b>${sgn(D.res[i], 3)}</b>`), e.clientX, e.clientY));
    c.addEventListener('mouseleave', () => TIP.hide());
    c.addEventListener('click', () => pick(r.si));
  });
  if (S.sel !== null && D.byId.has(S.sel)) {
    const i = D.byId.get(S.sel), r = D.rows[i];
    el('text', { x: x(r.dC), y: y(r.dG) - 14, 'text-anchor': 'middle', class: 'axlab' }, g).textContent = SCH[r.si][1];
  }
  // the two references
  const drawLine = (f, dash, cls) => {
    const x0 = x.dom[0], x1 = x.dom[1];
    el('line', { x1: x(x0), y1: y(f(x0)), x2: x(x1), y2: y(f(x1)), stroke: '#000',
                 'stroke-width': 2.4, 'stroke-dasharray': dash, class: cls }, g);
  };
  if (S.ref === 'fit') drawLine(v => D.a + D.b * v, '7 5', 'refline');
  else drawLine(v => D.s * v, '2 5', 'refline');
  const note = S.ref === 'fit'
    ? `empirical relationship · slope ${fmt(D.b, 3)} · correlation ${fmt(D.r, 2)} · at no anchor movement, ${sgn(D.a, 3)}`
    : `equal standardized movement · slope ${fmt(D.s, 3)} = ${fmt(wsd(D.dG, D.w), 3)} over ${fmt(wsd(D.dC, D.w), anchorDp() + 1)}`;
  el('text', { x: W - mR - 6, y: mT + 12, 'text-anchor': 'end', class: 'axlab' }, g).textContent = note;
}

/* ---- panel C ------------------------------------------------------------ */
function figC() {
  const svg = $('fig3'); clear(svg);
  const W = 900, H = 300, mL = 24, mR = 24, mT = 22, mB = 46;
  if (D.n < 3) { el('text', { x: 300, y: 120, class: 'axlab' }, svg).textContent = 'no schools clear these settings'; return; }
  const lo = Math.min(...D.res), hi = Math.max(...D.res), pad = (hi - lo) * .04 + 1e-4;
  const x = scale(lo - pad, hi + pad, mL, W - mR);
  const mid = (mT + H - mB) / 2;
  const g = el('g', {}, svg), ax = el('g', { class: 'ax' }, g);
  baseLine(g, mL, W - mR, H - mB);
  for (const t of niceTicks(x.dom[0], x.dom[1], 7)) {
    tickX(g, x(t), H - mB);
    el('text', { x: x(t), y: H - mB + 20, 'text-anchor': 'middle' }, ax).textContent = sgn(t, 2);
  }
  el('text', { x: (mL + W - mR) / 2, y: H - 6, 'text-anchor': 'middle', class: 'axlab' }, g)
    .textContent = 'grade change not accounted for by the anchor, in grade points';
  el('line', { x1: x(0), x2: x(0), y1: mT, y2: H - mB, stroke: '#000', 'stroke-width': 2.6 }, g);
  const mx0 = x(0), mxm = x(D.mres), together = Math.abs(mxm - mx0) < 78;
  el('text', { x: mx0, y: mT - 7, 'text-anchor': 'middle', class: 'axlab' }, g).textContent =
    together ? `on the reference · average ${sgn(D.mres, 3)}` : 'on the reference';
  const R = radiiFor(D.rows), sw = swarm(D.res, R, x, (H - mB - mT) / 2);
  const dots = el('g', {}, g);
  D.rows.forEach((r, i) => {
    const p = sw[i]; if (!p) return;
    const on = S.sel === r.si;
    const c = el('circle', {
      cx: p.px, cy: mid + p.cy, r: on ? Math.max(p.r, 5.5) : p.r,
      fill: D.res[i] > 0 ? ABOVE : BELOW, stroke: on ? '#000' : 'none', 'stroke-width': on ? 2.4 : 0,
      opacity: on ? 1 : .42, style: 'cursor:pointer', class: 'resdot'
    }, dots);
    c.addEventListener('mousemove', e => TIP.show(schoolTip(i, `<br>distance from the reference <b>${sgn(D.res[i], 3)}</b>`), e.clientX, e.clientY));
    c.addEventListener('mouseleave', () => TIP.hide());
    c.addEventListener('click', () => pick(r.si));
  });
  el('line', { x1: mxm, x2: mxm, y1: mT, y2: H - mB, stroke: '#000', 'stroke-width': 2.2, 'stroke-dasharray': '7 5', class: 'meanline' }, g);
  if (!together) el('text', { x: mxm + 7, y: mT - 7, class: 'axlab' }, g).textContent = `average ${sgn(D.mres, 3)}`;
}

/* ---- table -------------------------------------------------------------- */
let sortKey = 'res', sortDir = -1;
function table() {
  const th = $('tbl').querySelector('thead'), tb = $('tbl').querySelector('tbody');
  clear(th); clear(tb);
  if (!D.n) return;
  const cols = [['name', 'high school'], ['county', 'county'], ['dG', 'grade change'],
                ['dC', 'anchor change'], ['res', 'not accounted for'], ['w', 'applicants']];
  const hr = document.createElement('tr');
  for (const [k, t] of cols) {
    const h = document.createElement('th');
    h.textContent = t + (sortKey === k ? (sortDir > 0 ? ' ↑' : ' ↓') : '');
    h.addEventListener('click', () => { if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = -1; } table(); });
    hr.appendChild(h);
  }
  th.appendChild(hr);
  const rows = D.rows.map((r, i) => ({
    si: r.si, name: SCH[r.si][1], county: SCH[r.si][3],
    dG: r.dG, dC: r.dC, res: D.res[i], w: Math.round(r.w)
  }));
  rows.sort((a, b) => {
    const v1 = a[sortKey], v2 = b[sortKey];
    return typeof v1 === 'string' ? sortDir * v2.localeCompare(v1) : sortDir * (v1 - v2);
  });
  for (const r of rows.slice(0, 400)) {
    const tr = document.createElement('tr');
    if (S.sel === r.si) tr.setAttribute('aria-selected', 'true');
    for (const [k] of cols) {
      const td = document.createElement('td');
      td.textContent = (k === 'name' || k === 'county') ? r[k]
        : k === 'w' ? r[k].toLocaleString()
        : k === 'dC' ? sgn(r[k], anchorDp()) : sgn(r[k], 3);
      tr.appendChild(td);
    }
    tr.addEventListener('click', () => pick(r.si));
    tb.appendChild(tr);
  }
  if (rows.length > 400) {
    const tr = document.createElement('tr'), td = document.createElement('td');
    td.colSpan = cols.length; td.style.textAlign = 'left';
    td.textContent = `showing the first 400 of ${rows.length.toLocaleString()} schools in this sort order`;
    tr.appendChild(td); tb.appendChild(tr);
  }
}

/* ---- readout, flags, selected school ------------------------------------ */
function readout() {
  const ro = $('ro'); ro.innerHTML = '';
  if (D.n < 3) {
    ro.innerHTML = '<div><div class="k">no schools</div><div class="v">&mdash;</div>'
      + '<div class="n">lower the applicant threshold, widen a window, or choose another anchor</div></div>';
    return;
  }
  const cells = [
    ['schools', D.n.toLocaleString(), `clearing ${S.gate} applicants in both windows, with the anchor in both`],
    ['grade change', sgn(D.mdG, 3), `±${fmt(D.seG, 3)} · ${fmt(D.posG, 1)}% of schools rose`],
    ['anchor change', sgn(D.mdC, anchorDp()), anchorUnit() || 'over the same classes'],
    [S.ref === 'fit' ? 'at no anchor movement' : 'reference slope',
     S.ref === 'fit' ? sgn(D.a, 3) : fmt(D.s, 3),
     S.ref === 'fit' ? 'grade change where the anchor did not move' : 'grade points per unit of anchor, spreads matched'],
    S.ref === 'fit'
      ? ['spread of what is left', '±' + fmt(wsd(D.res, D.w), 3),
         'the fit is centered by construction; this is how far schools sit from it']
      : ['not accounted for', sgn(D.mres, 3), `${fmt(D.posres, 1)}% of schools above the reference`]
  ];
  for (const [k, v, n] of cells) {
    const d = document.createElement('div');
    d.innerHTML = `<div class="k">${k}</div><div class="v">${v}</div><div class="n">${n}</div>`;
    ro.appendChild(d);
  }
}
function flags() {
  const box = $('flags'); box.innerHTML = '';
  const add = (t, h) => {
    const d = document.createElement('div'); d.className = 'flag';
    d.innerHTML = `<b>${t}</b> &middot; ${h}`; box.appendChild(d);
  };
  const ip = instruments(D.pre), iq = instruments(D.post);
  const all = [...new Set(ip.concat(iq))];
  if (S.anchor === 'census' || S.anchor === 'censusz') {
    if (all.length > 1) {
      add('two different tests', 'The two windows do not rest on the same instrument &mdash; '
        + all.map(s => M.srcname[s]).join(' and ')
        + '. A change measured across that seam is a change of ruler as well as a change of schools.');
    } else if (all.length === 1) {
      $('anote').textContent = 'Both windows rest on ' + M.srcname[all[0]] + '.';
    }
  } else {
    $('anote').textContent = 'College-bound measure: it covers only the students who chose to sit the test.';
  }
  if (D.n && D.n < 120) add('few schools', `Only ${D.n} schools clear these settings; the averages are unsteady.`);
}
function selBox() {
  const box = $('pick'); box.innerHTML = '';
  if (S.sel === null || !D.byId.has(S.sel)) return;
  const i = D.byId.get(S.sel), r = D.rows[i], s = SCH[r.si];
  const d = document.createElement('div');
  d.className = 'flag';
  d.innerHTML = `<b>held</b> &middot; <b>${s[1]}</b>, ${s[2]} &mdash; grades ${sgn(r.dG, 3)}, `
    + `anchor ${sgn(r.dC, anchorDp())} ${anchorUnit()}, not accounted for ${sgn(D.res[i], 3)}. `;
  const a = document.createElement('a');
  a.href = '#school'; a.className = 'openschool'; a.textContent = 'Open this school on its own page →';
  a.addEventListener('click', e => { e.preventDefault(); openSchool(r.si); });
  d.appendChild(a);
  const b = document.createElement('button');
  b.className = 'act'; b.textContent = 'release'; b.style.marginLeft = '10px';
  b.addEventListener('click', () => { S.sel = null; render(); });
  d.appendChild(b);
  box.appendChild(d);
}

/* ---- controls ----------------------------------------------------------- */
function opts(sel, list, val) {
  clear(sel);
  for (const [v, t] of list) { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); }
  sel.value = String(val);
}
function serChips() {
  const box = $('serchips'); box.innerHTML = '';
  for (const [k, lab] of [['app', 'applicants'], ['adm', 'admitted'], ['enr', 'enrolled']]) {
    const b = document.createElement('button');
    b.className = 'chip'; b.textContent = lab;
    b.setAttribute('aria-pressed', String(S.ser === k));
    b.addEventListener('click', () => { S.ser = k; S.sel = null; serChips(); render(); });
    box.appendChild(b);
  }
}
function refChips() {
  $('ref_fit').setAttribute('aria-pressed', String(S.ref === 'fit'));
  $('ref_eq').setAttribute('aria-pressed', String(S.ref === 'eq'));
  $('sz').setAttribute('aria-pressed', String(S.size));
}
function initControls() {
  const yrs = yearsBetween(Y0, Y1).map(y => [y, String(y)]);
  opts($('p0a'), yrs, S.p0a); opts($('p0b'), yrs, S.p0b);
  opts($('p1a'), yrs, S.p1a); opts($('p1b'), yrs, S.p1b);
  opts($('pool'), POOLS.map(p => [p, poolLabel(p)]), S.pool);
  opts($('anchor'), Object.keys(RULERS).filter(k => k !== 'none').map(k => [k, RULERS[k].label]), S.anchor);
  $('gate').value = S.gate; $('gatev').textContent = S.gate; $('wt').value = S.wt;
  const bind = (id, key, num) => $(id).addEventListener('change', () => {
    S[key] = num ? +$(id).value : $(id).value; S.sel = null; render();
  });
  bind('pool', 'pool', 1); bind('anchor', 'anchor'); bind('wt', 'wt');
  bind('p0a', 'p0a', 1); bind('p0b', 'p0b', 1); bind('p1a', 'p1a', 1); bind('p1b', 'p1b', 1);
  $('gate').addEventListener('input', () => { $('gatev').textContent = $('gate').value; });
  $('gate').addEventListener('change', () => { S.gate = +$('gate').value; S.sel = null; render(); });
  $('sz').addEventListener('click', () => { S.size = !S.size; refChips(); render(); });
  $('ref_fit').addEventListener('click', () => { S.ref = 'fit'; refChips(); render(); });
  $('ref_eq').addEventListener('click', () => { S.ref = 'eq'; refChips(); render(); });
  $('reset').addEventListener('click', () => {
    Object.assign(S, DEF);
    initControls(); serChips(); refChips(); render();
  });
  ROOT.querySelectorAll('.q').forEach(q => {
    q.addEventListener('mouseenter', e => TIP.show(q.dataset.help, e.clientX, e.clientY));
    q.addEventListener('mouseleave', () => TIP.hide());
  });
}

/* ---- render ------------------------------------------------------------- */
function render() {
  D = computeAll();
  const py = a => a.length === 1 ? `the class of ${a[0]}` : `the classes of ${a[0]}–${a[a.length - 1]}`;
  $('s1').textContent = `Grade point average of ${SERIES[S.ser].label} in the ${poolLabel(S.pool)} pool, `
    + `${py(D.pre)} against ${py(D.post)}. Each dot is one high school measured against itself; `
    + `${D.n.toLocaleString()} schools send at least ${S.gate} applicants in both windows and have the anchor in both.`;
  $('s2').textContent = D.n >= 3
    ? `The same ${D.n.toLocaleString()} schools. The two references answer different questions: the empirical relationship `
      + `describes how these schools actually moved together, and the height of that line where the anchor did not move is `
      + `the part of the grade movement it leaves standing; equal standardized movement instead asserts what grades would `
      + `have done had they tracked the anchor step for step, and is not fitted to the data.`
    : '';
  $('s3').textContent = D.n >= 3
    ? (S.ref === 'fit'
        ? `Distance from the fitted line. Because that line is fitted to these schools it passes through their weighted center, `
          + `so the average distance is zero by construction and the informative thing here is the spread: `
          + `${fmt(D.posres, 1)} percent of schools sit above the line.`
        : `Distance from the equal-standardized-movement line. That line is a claim made in advance rather than one read off `
          + `these schools, so its average distance is a quantity in its own right: ${sgn(D.mres, 3)} of a grade point, `
          + `with ${fmt(D.posres, 1)} percent of schools above it.`)
    : '';
  readout(); flags(); selBox(); figA(); figB(); figC(); table();
  $('foot').innerHTML = `Built from the University of California&rsquo;s published applicant, admitted and enrolled grade point `
    + `averages by high school and campus, classes ${Y0}&ndash;${Y1}, together with the Universitywide aggregate; campus labels `
    + `as repaired on 30 July 2026. Achievement measures from California Department of Education school files. Data prepared `
    + `${M.built}. <a href="methods.html">Methods and sources</a>.`;
}

/* test hook: lets the headless suite read this tab's numbers without redrawing them */
window.__changed = {
  S, DEF,
  state: () => ({ n: D.n, mdG: D.mdG, posG: D.posG, mdC: D.mdC, a: D.a, b: D.b, s: D.s,
                  r: D.r, mres: D.mres, posres: D.posres, ref: S.ref, pool: S.pool,
                  poolLabel: poolLabel(S.pool), anchor: S.anchor, ser: S.ser, gate: S.gate, wt: S.wt }),
  set: (k, v) => {
    S[k] = v; S.sel = null;
    const c = $(k); if (c) c.value = String(v);
    if (k === 'gate') $('gatev').textContent = String(v);
    serChips(); refChips(); render();
  },
  select: si => pick(si),
  render
};

initControls(); serChips(); refChips(); render();
