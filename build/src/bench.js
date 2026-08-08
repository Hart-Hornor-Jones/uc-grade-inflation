/* Tool 3 — The yardstick bench. */
'use strict';
const $ = id => document.getElementById(id);
const DEF = { p0a: 2016, p0b: 2019, p1a: 2023, p1b: 2025, campus: 0, ser: 'app', ruler: 'census', beta: 'pre', betaman: 50, county: '', upp: '', ach: '', gate: 30, wt: 'a', pinned: null };
const S = Object.assign({}, DEF);

const UPPCUT = tercile(TRAIT.map(t => t.upp)), ACHCUT = tercile(TRAIT.map(t => t.cenz));
function band(v, cut) { if (v === null || !isFinite(v)) return null; return v < cut[0] ? 0 : (v < cut[1] ? 1 : 2); }
function schoolFilter() {
  const c = S.county, u = S.upp === '' ? null : +S.upp, a = S.ach === '' ? null : +S.ach;
  if (!c && u === null && a === null) return null;
  return si => {
    const t = TRAIT[si];
    return (!c || t.county === c) && (u === null || band(t.upp, UPPCUT) === u) && (a === null || band(t.cenz, ACHCUT) === a);
  };
}
const RSCALE = { census: [0, .02], censusz: [0, 1], zsat: [0, 1], act: [0, .02], appass: [0, .02], apge3: [0, 1] };
function betaManual() { const r = RSCALE[S.ruler] || [0, 1]; return r[0] + (S.betaman / 100) * r[1]; }

/* ---- computation ------------------------------------------------------- */
let D = null;
function compute() {
  const pre = yearsBetween(Math.min(S.p0a, S.p0b), Math.max(S.p0a, S.p0b));
  const post = yearsBetween(Math.min(S.p1a, S.p1b), Math.max(S.p1a, S.p1b));
  const filt = schoolFilter();
  const P = buildPanel({ ci: S.campus, pre, post, ruler: S.ruler, gate: S.gate, ser: S.ser, betaMode: S.beta, betaManual: betaManual(), filter: filt });
  const rows = P.rows, w = rows.map(r => S.wt === 'a' ? r.w : 1);

  // the pooled, unbalanced total anyone would quote
  const totPre = pooledGPA(S.campus, pre, S.ser, filt), totPost = pooledGPA(S.campus, post, S.ser, filt);
  const total = totPost - totPre;
  const within = rows.length ? wmean(rows.map(r => r.dG), w) : NaN;

  // pool depth, where the A-G completer count exists in both periods
  const dp = [], dq = [], dw = [], dg = [];
  for (const r of rows) {
    let ap = 0, aq = 0, gp = 0, gq = 0;
    for (const y of pre) { const f = fun(r.si, S.campus, y), g = rul(r.si, y); if (f && f.A) ap += f.A; if (g && g.agm) gp += g.agm; }
    for (const y of post) { const f = fun(r.si, S.campus, y), g = rul(r.si, y); if (f && f.A) aq += f.A; if (g && g.agm) gq += g.agm; }
    if (gp > 0 && gq > 0) { dp.push(100 * ap / gp); dq.push(100 * aq / gq); dw.push(S.wt === 'a' ? r.w : 1); dg.push(r.Gp); }
  }
  let depthTerm = null, depthSlope = null, dDepth = null;
  if (dp.length > 30) {
    depthSlope = wslope(dp, dg, dw);                 // cross-sectional: pool average per applicant-per-100
    dDepth = wmean(dq.map((v, i) => v - dp[i]), dw);
    depthTerm = depthSlope * dDepth;
  }
  const achTerm = rows.length && P.field ? P.beta * wmean(rows.map(r => r.dC), w) : 0;
  const index = rows.length ? wmean(rows.map(r => r.I), w) : NaN;
  D = {
    pre, post, rows, w, beta: P.beta, field: P.field, filt,
    total, within, composition: total - within, depthTerm, depthSlope, dDepth,
    achTerm, index, indexAfterDepth: index - (depthTerm || 0),
    n: rows.length,
    se: rows.length ? bootSE(rows.map(r => r.I), w) : NaN,
    pos: rows.length ? 100 * wmean(rows.map(r => r.I > 0 ? 1 : 0), w) : NaN,
    dC: rows.length && P.field ? wmean(rows.map(r => r.dC), w) : null,
    p10: rows.length ? wquant(rows.map(r => r.I), w, .1) : NaN,
    p50: rows.length ? wquant(rows.map(r => r.I), w, .5) : NaN,
    p90: rows.length ? wquant(rows.map(r => r.I), w, .9) : NaN,
    instPre: instruments(pre), instPost: instruments(post)
  };
  return D;
}

/* ---- flags -------------------------------------------------------------- */
const INAME = { 1: 'the high-school exit examination', 2: 'the eleventh-grade standards test', 3: 'the current state assessment' };
function flags() {
  const f = $('flags'); f.innerHTML = '';
  const add = h => { const d = document.createElement('div'); d.className = 'flag'; d.innerHTML = h; f.appendChild(d); };
  if (!D.n) { add('<b>No schools clear these settings.</b> Widen the periods, lower the applicant threshold, or loosen the school filters.'); return; }
  if (S.ruler === 'census' || S.ruler === 'censusz') {
    const a = D.instPre, b = D.instPost;
    const same = a.length === 1 && b.length === 1 && a[0] === b[0];
    if (!same && a.length && b.length) {
      add(`<b>The two chosen periods rest on different census instruments</b> &mdash; ${a.map(i => INAME[i]).join(' and ')} earlier, ${b.map(i => INAME[i]).join(' and ')} later. `
        + (S.ruler === 'census'
          ? 'Their raw scales are not comparable, so the subtraction below is not meaningful. Switch the anchor to the standardized version, or move the periods inside one instrument.'
          : 'The standardized version compares each school&rsquo;s position within its own class and instrument, which survives the change; levels do not.'));
    }
  }
  if (S.ruler === 'zsat' || S.ruler === 'act' || S.ruler === 'appass' || S.ruler === 'apge3') {
    if (Math.max(...D.post) > 2020) add('<b>The state stopped publishing school test files after the class of 2020.</b> Later classes carry no college-bound anchor, so the later period is truncated to the classes that do.');
  }
  if (D.depthTerm === null) add('<b>Pool depth is not measurable for these periods.</b> Counts of A&ndash;G course completers exist only from the class of 2015 on, so the depth step is skipped.');
}

/* ---- figure 1: successive subtractions ---------------------------------- */
function fig1() {
  const svg = $('fig1'); clear(svg);
  const W = 900, H = 330, mL = 34, mR = 24, mT = 26, mB = 78;
  const steps = [];
  steps.push({ kind: 'level', label: 'everyone pooled', v: D.total, note: 'every applicant in the state, later minus earlier' });
  steps.push({ kind: 'delta', label: 'the mix of schools', v: -(D.composition), note: `the changing mix of schools contributed ${sgn(D.composition, 4)}, so removing it moves the figure ${sgn(-D.composition, 4)}` });
  steps.push({ kind: 'level', label: 'the same schools', v: D.within, note: 'average change inside schools present in both periods' });
  if (D.depthTerm !== null) {
    steps.push({ kind: 'delta', label: 'the depth of the pool', v: -D.depthTerm, note: `pool depth moved ${sgn(D.dDepth, 1)} applicants per 100 A–G completers, worth ${sgn(D.depthTerm, 4)}` });
    steps.push({ kind: 'level', label: 'at constant depth', v: D.within - D.depthTerm, note: 'holding the reach of the applicant pool fixed' });
  }
  if (D.field) {
    steps.push({ kind: 'delta', label: 'measured achievement', v: -D.achTerm, note: `the anchor moved ${sgn(D.dC, 2)} and is worth ${fmt(D.beta, 4)} grade points per unit, so it accounts for ${sgn(D.achTerm, 4)}` });
  }
  steps.push({ kind: 'final', label: 'what is left', v: D.index - (D.depthTerm || 0), note: 'the estimate' });

  const vals = []; let run = 0;
  for (const s of steps) { if (s.kind === 'delta') { vals.push(run, run + s.v); run += s.v; } else { vals.push(0, s.v); run = s.v; } }
  const lo = Math.min(0, ...vals) - .01, hi = Math.max(0, ...vals) + .01;
  const y = scale(lo, hi, H - mB, mT);
  const bw = (W - mL - mR) / steps.length;
  const g = el('g', {}, svg), ax = el('g', { class: 'ax' }, g);
  spine(g, mL, mT, mL, H - mB);
  for (const t of niceTicks(lo, hi, 5)) {
    tickY(g, mL, y(t));
    if (Math.abs(t) < 1e-9) baseLine(g, mL, W - mR, y(t));
    el('text', { x: mL - 12, y: y(t) + 4, 'text-anchor': 'end' }, ax).textContent = sgn(t, 2);
  }
  run = 0;
  steps.forEach((s, i) => {
    const x0 = mL + i * bw + bw * .16, wdt = bw * .68;
    let a, b, col;
    if (s.kind === 'delta') { a = run; b = run + s.v; run = b; col = s.v < 0 ? '#FF8C00' : '#009192'; }
    else { a = 0; b = s.v; run = s.v; col = s.kind === 'final' ? '#0000FF' : '#555555'; }
    const r = el('rect', { x: x0, y: y(Math.max(a, b)), width: wdt, height: Math.max(1.5, Math.abs(y(a) - y(b))), fill: col, stroke: '#000', 'stroke-width': 2.4, class: 'step', style: 'cursor:pointer' }, g);
    el('text', { x: x0 + wdt / 2, y: y(Math.max(a, b)) - 6, 'text-anchor': 'middle', class: 'axlab', fill: '#16191d' }, g)
      .textContent = (s.kind === 'delta' ? sgn(s.v, 3) : sgn(s.v, 3));
    const lab = el('text', { x: x0 + wdt / 2, y: H - mB + 16, 'text-anchor': 'middle', class: 'axlab' }, g);
    const words = s.label.split(' '); let line = '', dy = 0;
    for (const wd of words) {
      if ((line + ' ' + wd).length > 15) { el('tspan', { x: x0 + wdt / 2, dy: dy ? 13 : 0 }, lab).textContent = line; line = wd; dy = 1; }
      else line = line ? line + ' ' + wd : wd;
    }
    el('tspan', { x: x0 + wdt / 2, dy: dy ? 13 : 0 }, lab).textContent = line;
    if (s.kind === 'delta') el('text', { x: x0 + wdt / 2, y: H - mB + 16 - 14, 'text-anchor': 'middle', class: 'axlab', fill: '#7a838d' }, g)
      .textContent = 'take out';
    r.addEventListener('mousemove', e => TIP.show(`<b>${s.label}</b> ${sgn(s.v, 4)}<br><span class="muted">${s.note}</span>`, e.clientX, e.clientY));
    r.addEventListener('mouseleave', () => TIP.hide());
  });
  el('text', { x: mL, y: 14, class: 'axlab', fill: '#7a838d' }, g).textContent = 'grade points';
}

/* ---- figure 2: distribution --------------------------------------------- */
function fig2() {
  const svg = $('fig2'); clear(svg);
  const W = 900, H = 300, mL = 52, mR = 24, mT = 18, mB = 44;
  if (!D.n) return;
  const v = D.rows.map(r => r.I), w = D.w;
  const lo = wquant(v, w, .01), hi = wquant(v, w, .99);
  const nb = 40, x = scale(lo, hi, mL, W - mR);
  const bins = new Array(nb).fill(0);
  let tot = 0;
  for (let i = 0; i < v.length; i++) {
    const k = Math.max(0, Math.min(nb - 1, Math.floor((v[i] - lo) / (hi - lo) * nb)));
    bins[k] += w[i]; tot += w[i];
  }
  const y = scale(0, Math.max(...bins) / tot * 100, H - mB, mT);
  const g = el('g', {}, svg), ax = el('g', { class: 'ax' }, g);
  spine(g, mL, mT, mL, H - mB);
  baseLine(g, mL, W - mR, H - mB);
  for (const t of niceTicks(0, y.dom[1], 4)) {
    tickY(g, mL, y(t));
    el('text', { x: mL - 12, y: y(t) + 4, 'text-anchor': 'end' }, ax).textContent = t.toFixed(0) + '%';
  }
  const bwid = (W - mL - mR) / nb;
  bins.forEach((b, i) => {
    const cx = lo + (i + .5) / nb * (hi - lo);
    const r = el('rect', { x: mL + i * bwid + .5, y: y(b / tot * 100), width: bwid - 1, height: Math.max(0, y(0) - y(b / tot * 100)), fill: cx > 0 ? '#FB0207' : '#0000FF', stroke: '#000', 'stroke-width': .9, class: 'bar' }, g);
    r.addEventListener('mousemove', e => TIP.show(`${sgn(lo + i / nb * (hi - lo), 3)} to ${sgn(lo + (i + 1) / nb * (hi - lo), 3)}<br><b>${fmt(b / tot * 100, 1)}%</b> of the weight`, e.clientX, e.clientY));
    r.addEventListener('mouseleave', () => TIP.hide());
  });
  for (const [q, lab] of [[D.p10, '10th'], [D.p50, 'median'], [D.p90, '90th']]) {
    if (q < lo || q > hi) continue;
    el('line', { x1: x(q), x2: x(q), y1: mT, y2: H - mB, stroke: '#000', 'stroke-dasharray': '4 4', 'stroke-width': 2 }, g);
    el('text', { x: x(q), y: mT - 5, 'text-anchor': 'middle', class: 'axlab' }, g).textContent = `${lab} ${sgn(q, 3)}`;
  }
  el('line', { x1: x(0), x2: x(0), y1: mT, y2: H - mB, stroke: '#000', 'stroke-width': 2.6 }, g);
  for (const t of niceTicks(lo, hi, 7)) {
    tickX(g, x(t), H - mB);
    el('text', { x: x(t), y: H - mB + 20, 'text-anchor': 'middle' }, ax).textContent = sgn(t, 2);
  }
  el('text', { x: (mL + W - mR) / 2, y: H - 4, 'text-anchor': 'middle', class: 'axlab' }, g).textContent = 'estimate for one high school, in grade points';
}

/* ---- figure 3: grades against the anchor -------------------------------- */
function fig3() {
  const svg = $('fig3'); clear(svg);
  const W = 900, H = 400, mL = 62, mR = 26, mT = 18, mB = 46;
  if (!D.n) return;
  if (!D.field) {
    el('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle', class: 'axlab' }, svg)
      .textContent = 'No achievement anchor selected — choose one in the sidebar to see this figure.';
    return;
  }
  const xs = D.rows.map(r => r.dC), ys = D.rows.map(r => r.dG);
  const xlo = wquant(xs, D.w, .005), xhi = wquant(xs, D.w, .995);
  const ylo = wquant(ys, D.w, .005), yhi = wquant(ys, D.w, .995);
  const x = scale(xlo, xhi, mL, W - mR), y = scale(ylo, yhi, H - mB, mT);
  const g = el('g', {}, svg), ax = el('g', { class: 'ax' }, g);
  spine(g, mL, mT, mL, H - mB);
  baseLine(g, mL, W - mR, H - mB);
  for (const t of niceTicks(xlo, xhi, 6)) {
    tickX(g, x(t), H - mB);
    if (Math.abs(t) < 1e-9) el('line', { x1: x(t), x2: x(t), y1: mT, y2: H - mB, stroke: '#000', 'stroke-width': 2 }, g);
    el('text', { x: x(t), y: H - mB + 20, 'text-anchor': 'middle' }, ax).textContent = sgn(t, 1);
  }
  for (const t of niceTicks(ylo, yhi, 5)) {
    tickY(g, mL, y(t));
    if (Math.abs(t) < 1e-9) baseLine(g, mL, W - mR, y(t));
    el('text', { x: mL - 12, y: y(t) + 4, 'text-anchor': 'end' }, ax).textContent = sgn(t, 2);
  }
  el('text', { x: (mL + W - mR) / 2, y: H - 4, 'text-anchor': 'middle', class: 'axlab' }, g)
    .textContent = 'change in ' + RULERS[S.ruler].label + (RULERS[S.ruler].unit ? ' (' + RULERS[S.ruler].unit + ')' : '');
  el('text', { x: 13, y: (mT + H - mB) / 2, class: 'axlab', 'text-anchor': 'middle', transform: `rotate(-90 13 ${(mT + H - mB) / 2})` }, g)
    .textContent = 'change in pool grade point average';
  // the beta line, anchored at the weighted centroid
  const mx = wmean(xs, D.w), my = wmean(ys, D.w);
  el('line', { x1: x(xlo), y1: y(my + D.beta * (xlo - mx)), x2: x(xhi), y2: y(my + D.beta * (xhi - mx)), stroke: '#000', 'stroke-width': 2.4, 'stroke-dasharray': '7 5' }, g);
  const dots = el('g', {}, g);
  D.rows.forEach(r => {
    if (r.dC < xlo || r.dC > xhi || r.dG < ylo || r.dG > yhi) return;
    const c = el('circle', { cx: x(r.dC), cy: y(r.dG), r: S.wt === 'a' ? Math.max(2, Math.min(7, Math.sqrt(r.w) / 5)) : 3.2, fill: r.I > 0 ? '#FB0207' : '#0000FF', opacity: S.pinned === r.si ? 1 : .32, stroke: S.pinned === r.si ? '#000' : 'none', 'stroke-width': 2.2, style: 'cursor:pointer' }, dots);
    c.addEventListener('mousemove', e => TIP.show(
      `<b>${SCH[r.si][1]}</b><br><span class="muted">${SCH[r.si][2]}, ${SCH[r.si][3]} County</span>` +
      `<br>grades ${fmt(r.Gp)} &rarr; ${fmt(r.Gq)} (${sgn(r.dG, 3)})` +
      `<br>anchor ${fmt(r.Cp, 1)} &rarr; ${fmt(r.Cq, 1)} (${sgn(r.dC, 2)})` +
      `<br>estimate <b>${sgn(r.I, 3)}</b>`, e.clientX, e.clientY));
    c.addEventListener('mouseleave', () => TIP.hide());
    c.addEventListener('click', () => { S.pinned = S.pinned === r.si ? null : r.si; render(); });
  });
  el('text', { x: W - mR - 6, y: mT + 12, 'text-anchor': 'end', class: 'axlab' }, g)
    .textContent = `line: ${fmt(D.beta, 4)} grade points per unit of the anchor`;
}

/* ---- table --------------------------------------------------------------- */
let sortKey = 'I', sortDir = -1;
function table() {
  const th = $('tbl').querySelector('thead'), tb = $('tbl').querySelector('tbody');
  clear(th); clear(tb);
  const cols = [['name', 'high school'], ['county', 'county'], ['Gp', 'grades, earlier'], ['Gq', 'grades, later'],
  ['dG', 'change'], ['dC', 'anchor change'], ['I', 'estimate'], ['w', 'applicants']];
  const hr = document.createElement('tr');
  for (const [k, t] of cols) {
    const h = document.createElement('th'); h.textContent = t + (sortKey === k ? (sortDir > 0 ? ' ↑' : ' ↓') : '');
    h.addEventListener('click', () => { if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = -1; } table(); });
    hr.appendChild(h);
  }
  th.appendChild(hr);
  const rows = D.rows.map(r => ({ si: r.si, name: SCH[r.si][1], county: SCH[r.si][3], Gp: r.Gp, Gq: r.Gq, dG: r.dG, dC: r.dC, I: r.I, w: Math.round(r.w) }));
  rows.sort((a, b) => { const v1 = a[sortKey], v2 = b[sortKey]; return typeof v1 === 'string' ? sortDir * v2.localeCompare(v1) : sortDir * ((v1 ?? -99) - (v2 ?? -99)); });
  for (const r of rows.slice(0, 400)) {
    const tr = document.createElement('tr');
    if (S.pinned === r.si) tr.setAttribute('aria-selected', 'true');
    for (const [k] of cols) {
      const td = document.createElement('td');
      td.textContent = (k === 'name' || k === 'county') ? r[k]
        : k === 'w' ? r[k].toLocaleString()
          : (k === 'Gp' || k === 'Gq') ? fmt(r[k], 3)
            : k === 'dC' ? (r[k] === null ? '—' : sgn(r[k], 2)) : sgn(r[k], 3);
      tr.appendChild(td);
    }
    tr.addEventListener('click', () => { S.pinned = S.pinned === r.si ? null : r.si; render(); });
    tb.appendChild(tr);
  }
  if (rows.length > 400) {
    const tr = document.createElement('tr'), td = document.createElement('td');
    td.colSpan = cols.length; td.style.textAlign = 'left'; td.style.color = '#7a838d';
    td.textContent = `showing the first 400 of ${rows.length.toLocaleString()} schools in this sort order`;
    tr.appendChild(td); tb.appendChild(tr);
  }
}

/* ---- readout -------------------------------------------------------------- */
function readout() {
  const ro = $('ro'); ro.innerHTML = '';
  const absorbed = (D.field && isFinite(D.within) && Math.abs(D.within) > 1e-9) ? -D.achTerm / D.within * 100 : null;
  const cells = [
    ['schools compared', D.n ? D.n.toLocaleString() : '—', `${D.n} schools clear both periods and both measures`],
    ['raw change inside schools', sgn(D.within, 3), `pooled across all schools: ${sgn(D.total, 3)}`],
    ['the estimate', sgn(D.index - (D.depthTerm || 0), 3), D.n ? `± ${fmt(D.se, 3)}, ${fmt(D.pos, 1)}% of schools above zero` : ''],
    ['achievement explains', D.field ? (absorbed === null ? '—' : sgn(-absorbed, 0) + '%') : 'no anchor',
      D.field ? (absorbed !== null && absorbed > 0
        ? `of the within-school rise; the anchor moved ${sgn(D.dC, 2)}`
        : `nothing — measured achievement moved the other way (${sgn(D.dC, 2)}), so the anchor raises the estimate`)
        : 'raw change reported'],
    ['grade points per unit', D.field ? fmt(D.beta, 4) : '—', D.field ? ({ pre: 'from the earlier period', post: 'from the later period', zero: 'set to zero', manual: 'set by hand' })[S.beta] : '']
  ];
  for (const [k, v, n] of cells) {
    const d = document.createElement('div');
    d.innerHTML = `<div class="k">${k}</div><div class="v">${v}</div><div class="n">${n}</div>`;
    ro.appendChild(d);
  }
}

/* ---- render ---------------------------------------------------------------- */
function render() {
  compute(); flags(); readout(); fig1(); fig2(); fig3(); table();
  const py = a => a.length === 1 ? `the class of ${a[0]}` : `the classes of ${a[0]}–${a[a.length - 1]}`;
  $('s1').textContent = `${CAMPUS[S.campus]} ${SERIES[S.ser].label}, ${py(D.pre)} against ${py(D.post)}. `
    + `Each bar is in grade points. Hover a bar for what it is.`;
  $('s2').textContent = D.n
    ? `${D.n.toLocaleString()} schools. Median ${sgn(D.p50, 3)}; the middle eighty percent runs from ${sgn(D.p10, 3)} to ${sgn(D.p90, 3)}. `
    + `A distribution centered on zero with schools on both sides looks like noise; one shifted bodily to one side does not.` : '';
  $('s3').textContent = D.field
    ? `If grades tracked measured achievement, the cloud would sit along the line. Points above it are schools whose grades rose more than the anchor accounts for.`
    : 'Choose an achievement anchor in the sidebar.';
  const CENSUS_POP = ' A census test covers essentially every eleventh grader, including students who never apply anywhere; across schools it tracks the college-bound measures at about 0.79, so it absorbs somewhat less of any real achievement change than an SAT or Advanced Placement anchor would.';
  const POSITION = ' A position, not a score level: a change means the school gained or lost ground on other California schools, not that scores rose statewide.';
  const TESTERS = ' Measured only on students who chose to sit the test — close to the population submitting grade point averages, but the share of a school testing also changed over these years, which moves the school mean on its own.';
  $('rulernote').textContent = {
    none: 'The raw change, with nothing subtracted.',
    census: 'Every eleventh grader in the school, in the test’s own percentage units. Classes 2003 to 2020 and 2023 to 2025.' + CENSUS_POP,
    censusz: 'The same test, expressed as the school’s position within its own class. Survives the changes of instrument.' + CENSUS_POP + POSITION,
    zsat: 'School mean SAT among students who sat it, bridged across the several score scales. Classes 1999 to 2020.' + POSITION + TESTERS,
    act: 'Share of a school’s ACT testers scoring 21 or better. Classes 1999 to 2020.' + TESTERS,
    appass: 'Share of a school’s Advanced Placement exams scored 3 or better. Classes 1999 to 2020.' + TESTERS,
    apge3: 'Advanced Placement exams scored 3 or better, per twelfth grader. Classes 1999 to 2020.' + TESTERS
  }[S.ruler];
  $('betanote').textContent = S.beta === 'manual'
    ? `Set by hand: ${fmt(betaManual(), 4)} grade points per unit of the anchor.`
    : S.beta === 'zero' ? 'The anchor is shown but subtracts nothing.'
      : 'Taken from how grades and the anchor stand together across schools, in levels, within that period.';
  $('betaman').style.display = S.beta === 'manual' ? 'block' : 'none';
  $('foot').innerHTML = `Grades: the University of California&rsquo;s published applicant, admitted and enrolled grade point averages by high school and campus, classes ${Y0}&ndash;${Y1}, campus labels as repaired on 30 July 2026. Anchors: California Department of Education school files &mdash; the eleventh-grade standards test, the high-school exit examination, the current state assessment, and the SAT, ACT and Advanced Placement school reports. Data prepared ${M.built}. <a href="methods.html">Methods and sources</a>.`;
}

/* ---- controls ------------------------------------------------------------- */
function opts(sel, list, val) { clear(sel); for (const [v, t] of list) { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); } sel.value = val; }
function init() {
  const yrs = yearsBetween(Y0, Y1).map(y => [y, 'class of ' + y]);
  opts($('p0a'), yrs, S.p0a); opts($('p0b'), yrs, S.p0b); opts($('p1a'), yrs, S.p1a); opts($('p1b'), yrs, S.p1b);
  opts($('campus'), CAMPUS.map((c, i) => [i, c + ' applicants']), S.campus);
  opts($('county'), [['', 'the whole state']].concat(COUNTIES.map(c => [c, c])), S.county);
  $('ser').value = S.ser; $('ruler').value = S.ruler; $('beta').value = S.beta;
  $('upp').value = S.upp; $('ach').value = S.ach; $('gate').value = S.gate; $('wt').value = S.wt;
  $('betaman').value = S.betaman;
  const bind = (id, key, num) => $(id).addEventListener('change', () => { S[key] = num ? +$(id).value : $(id).value; S.pinned = null; render(); });
  ['p0a', 'p0b', 'p1a', 'p1b', 'campus', 'gate', 'betaman'].forEach(k => bind(k, k, 1));
  ['ser', 'ruler', 'beta', 'county', 'upp', 'ach', 'wt'].forEach(k => bind(k, k));
  $('betaman').addEventListener('input', () => { S.betaman = +$('betaman').value; if (S.beta === 'manual') render(); });
  $('reset').addEventListener('click', () => { Object.assign(S, DEF); init(); render(); });
  document.querySelectorAll('.q').forEach(q => {
    q.addEventListener('mouseenter', e => TIP.show(q.dataset.help, e.clientX, e.clientY));
    q.addEventListener('mouseleave', () => TIP.hide());
  });
}
init(); render();
