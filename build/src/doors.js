/* Tool 1 — Same school, different doors. */
'use strict';

const $ = id => document.getElementById(id);
const S = { p0a: 2016, p0b: 2019, p1a: 2023, p1b: 2025, ser: 'app', county: '', upp: '', ach: '', gate: 30, wt: 'a', cA: 4, cB: 0, pinned: null };

/* ---- school filter ---------------------------------------------------- */
const UPPCUT = tercile(TRAIT.map(t => t.upp));
const ACHCUT = tercile(TRAIT.map(t => t.cenz));
function band(v, cut) { if (v === null || !isFinite(v)) return null; return v < cut[0] ? 0 : (v < cut[1] ? 1 : 2); }
function schoolFilter() {
  const c = S.county, u = S.upp === '' ? null : +S.upp, a = S.ach === '' ? null : +S.ach;
  if (!c && u === null && a === null) return null;
  return si => {
    const t = TRAIT[si];
    if (c && t.county !== c) return false;
    if (u !== null && band(t.upp, UPPCUT) !== u) return false;
    if (a !== null && band(t.cenz, ACHCUT) !== a) return false;
    return true;
  };
}
const wOf = r => S.wt === 'a' ? r.w : 1;

/* ---- controls --------------------------------------------------------- */
function opts(sel, list, val) {
  clear(sel);
  for (const [v, t] of list) { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); }
  sel.value = val;
}
function initControls() {
  const yrs = yearsBetween(Y0, Y1).map(y => [y, String(y)]);
  opts($('p0a'), yrs, S.p0a); opts($('p0b'), yrs, S.p0b);
  opts($('p1a'), yrs, S.p1a); opts($('p1b'), yrs, S.p1b);
  opts($('county'), [['', 'the whole state']].concat(COUNTIES.map(c => [c, c])), S.county);
  const cs = CAMPUS.map((c, i) => [i, c]);
  opts($('cA'), cs, S.cA); opts($('cB'), cs, S.cB);
  $('ser').value = S.ser; $('upp').value = S.upp; $('ach').value = S.ach;
  $('gate').value = S.gate; $('wt').value = S.wt;
  const bind = (id, key, num) => $(id).addEventListener('change', () => { S[key] = num ? +$(id).value : $(id).value; S.pinned = null; render(); });
  bind('p0a', 'p0a', 1); bind('p0b', 'p0b', 1); bind('p1a', 'p1a', 1); bind('p1b', 'p1b', 1);
  bind('ser', 'ser'); bind('county', 'county'); bind('upp', 'upp'); bind('ach', 'ach');
  bind('gate', 'gate', 1); bind('wt', 'wt'); bind('cA', 'cA', 1); bind('cB', 'cB', 1);
  $('reset').addEventListener('click', () => {
    Object.assign(S, { p0a: 2016, p0b: 2019, p1a: 2023, p1b: 2025, ser: 'app', county: '', upp: '', ach: '', gate: 30, wt: 'a', cA: 4, cB: 0, pinned: null });
    initControls(); render();
  });
  document.querySelectorAll('.q').forEach(q => {
    q.addEventListener('mouseenter', e => TIP.show(q.dataset.help, e.clientX, e.clientY));
    q.addEventListener('mouseleave', () => TIP.hide());
  });
}

/* ---- the per-campus table --------------------------------------------- */
let LAST = null;
function computeAll() {
  const pre = yearsBetween(Math.min(S.p0a, S.p0b), Math.max(S.p0a, S.p0b));
  const post = yearsBetween(Math.min(S.p1a, S.p1b), Math.max(S.p1a, S.p1b));
  const filt = schoolFilter();
  const per = [];
  for (let ci = 0; ci < NC; ci++) {
    const P = buildPanel({ ci, pre, post, ruler: 'none', gate: S.gate, ser: S.ser, betaMode: 'zero', filter: filt });
    const r = P.rows; if (!r.length) { per.push(null); continue; }
    const w = r.map(wOf);
    // pool depth: applicants per hundred A-G completers, era means
    let dp = [], dq = [];
    for (const row of r) {
      let ap = 0, aq = 0, gp = 0, gq = 0;
      for (const y of pre) { const f = fun(row.si, ci, y), g = rul(row.si, y); if (f && f.A) ap += f.A; if (g && g.agm) gp += g.agm; }
      for (const y of post) { const f = fun(row.si, ci, y), g = rul(row.si, y); if (f && f.A) aq += f.A; if (g && g.agm) gq += g.agm; }
      if (gp > 0 && gq > 0) { dp.push(100 * ap / gp); dq.push(100 * aq / gq); }
    }
    per.push({
      ci, rows: r, n: r.length,
      Gp: wmean(r.map(x => x.Gp), r.map(x => x.Ap)),
      Gq: wmean(r.map(x => x.Gq), r.map(x => x.Aq)),
      dG: wmean(r.map(x => x.dG), w),
      se: bootSE(r.map(x => x.dG), w),
      pos: 100 * wmean(r.map(x => x.dG > 0 ? 1 : 0), w),
      depthP: dp.length ? dp.reduce((a, b) => a + b, 0) / dp.length : null,
      depthQ: dq.length ? dq.reduce((a, b) => a + b, 0) / dq.length : null
    });
  }
  return { pre, post, per, filt };
}

/* ---- figure 1: the dumbbells ------------------------------------------ */
function fig1(D) {
  const svg = $('fig1'); clear(svg);
  const W = 900, H = 400, mL = 118, mR = 92, mT = 14, mB = 34;
  const live = D.per.filter(Boolean); if (!live.length) return;
  const order = live.slice().sort((a, b) => a.Gp - b.Gp);
  const lo = Math.min(...order.map(o => Math.min(o.Gp, o.Gq))) - .04;
  const hi = Math.max(...order.map(o => Math.max(o.Gp, o.Gq))) + .04;
  const x = scale(lo, hi, mL, W - mR), y = scale(0, order.length - 1, mT + 14, H - mB - 14);
  const g = el('g', {}, svg);
  const ax = el('g', { class: 'ax' }, g);
  baseLine(g, mL, W - mR, H - mB);
  for (const t of niceTicks(lo, hi, 6)) {
    tickX(g, x(t), H - mB);
    el('text', { x: x(t), y: H - mB + 20, 'text-anchor': 'middle' }, ax).textContent = t.toFixed(2);
  }
  el('text', { x: (mL + W - mR) / 2, y: H - 2, 'text-anchor': 'middle', class: 'axlab' }, g)
    .textContent = 'pool grade point average';
  order.forEach((o, i) => {
    const yy = y(i);
    el('text', { x: mL - 10, y: yy + 4, 'text-anchor': 'end', class: 'axlab' }, g).textContent = CAMPUS[o.ci];
    el('line', { x1: x(o.Gp), x2: x(o.Gq), y1: yy, y2: yy, stroke: campusColor(o.ci), 'stroke-width': 3.2, opacity: .85 }, g);
    el('circle', { cx: x(o.Gp), cy: yy, r: 5.6, fill: '#fff', stroke: '#000', 'stroke-width': 2.4 }, g);
    el('circle', { cx: x(o.Gq), cy: yy, r: 6.2, fill: campusColor(o.ci), stroke: campusEdge(o.ci) === campusColor(o.ci) ? '#000' : campusEdge(o.ci), 'stroke-width': 2 }, g);
    el('text', { x: W - mR + 8, y: yy + 4, class: 'axlab', fill: '#16191d' }, g).textContent = sgn(o.dG, 3);
    const hit = el('rect', { x: mL - 110, y: yy - 11, width: W - mL - mR + 190, height: 22, fill: 'transparent', style: 'cursor:pointer' }, g);
    hit.addEventListener('mousemove', e => TIP.show(
      `<b>${CAMPUS[o.ci]}</b><br>${o.n.toLocaleString()} schools clear the threshold in both periods` +
      `<br>pool grade average <b>${fmt(o.Gp)}</b> &rarr; <b>${fmt(o.Gq)}</b>` +
      `<br>within-school change <b>${sgn(o.dG, 3)}</b> <span class="muted">(&plusmn;${fmt(o.se, 3)})</span>` +
      `<br>${fmt(o.pos, 1)}% of schools rose` +
      (o.depthP !== null ? `<br><span class="muted">applicants per 100 A&ndash;G completers: ${fmt(o.depthP, 1)} &rarr; ${fmt(o.depthQ, 1)}</span>` : ''),
      e.clientX, e.clientY));
    hit.addEventListener('mouseleave', () => TIP.hide());
    hit.addEventListener('click', () => { S.cA = o.ci; $('cA').value = o.ci; render(); });
  });
  el('text', { x: W - mR + 8, y: mT + 2, class: 'axlab', fill: '#7a838d' }, g).textContent = 'change';
}

/* ---- figure 2: change against level ----------------------------------- */
function fig2(D) {
  const svg = $('fig2'); clear(svg);
  const W = 900, H = 320, mL = 62, mR = 22, mT = 16, mB = 40;
  const live = D.per.filter(Boolean); if (live.length < 3) return;
  const xs = live.map(o => o.Gp), ys = live.map(o => o.dG), ws = live.map(o => o.n);
  const x = scale(Math.min(...xs) - .03, Math.max(...xs) + .03, mL, W - mR);
  const y = scale(Math.min(0, Math.min(...ys)) - .01, Math.max(...ys) + .015, H - mB, mT);
  const g = el('g', {}, svg), ax = el('g', { class: 'ax' }, g);
  spine(g, mL, mT, mL, H - mB);
  baseLine(g, mL, W - mR, H - mB);
  for (const t of niceTicks(y.dom[0], y.dom[1], 5)) {
    tickY(g, mL, y(t));
    if (t === 0) baseLine(g, mL, W - mR, y(t));
    el('text', { x: mL - 12, y: y(t) + 4, 'text-anchor': 'end' }, ax).textContent = sgn(t, 2);
  }
  for (const t of niceTicks(x.dom[0], x.dom[1], 6)) {
    tickX(g, x(t), H - mB);
    el('text', { x: x(t), y: H - mB + 20, 'text-anchor': 'middle' }, ax).textContent = t.toFixed(2);
  }
  el('text', { x: (mL + W - mR) / 2, y: H - 4, 'text-anchor': 'middle', class: 'axlab' }, g)
    .textContent = 'pool grade point average in the earlier period';
  el('text', { x: 12, y: (mT + H - mB) / 2, class: 'axlab', transform: `rotate(-90 12 ${(mT + H - mB) / 2})`, 'text-anchor': 'middle' }, g)
    .textContent = 'change to the later period';
  const b = wslope(xs, ys, ws), a = wmean(ys, ws) - b * wmean(xs, ws);
  el('line', { x1: x(x.dom[0]), y1: y(a + b * x.dom[0]), x2: x(x.dom[1]), y2: y(a + b * x.dom[1]), stroke: '#000', 'stroke-width': 2.4, 'stroke-dasharray': '7 5' }, g);
  live.forEach(o => {
    const c = el('circle', { cx: x(o.Gp), cy: y(o.dG), r: 7.5, fill: campusColor(o.ci), stroke: campusEdge(o.ci) === campusColor(o.ci) ? '#000' : campusEdge(o.ci), 'stroke-width': 2.2, style: 'cursor:pointer' }, g);
    el('text', { x: x(o.Gp), y: y(o.dG) - 13, 'text-anchor': 'middle', class: 'axlab' }, g).textContent = CAMPUS[o.ci];
    c.addEventListener('mousemove', e => TIP.show(`<b>${CAMPUS[o.ci]}</b><br>started at ${fmt(o.Gp)}<br>rose ${sgn(o.dG, 3)}`, e.clientX, e.clientY));
    c.addEventListener('mouseleave', () => TIP.hide());
  });
  const r = wcorr(xs, ys, ws);
  el('text', { x: W - mR - 6, y: mT + 12, 'text-anchor': 'end', class: 'axlab' }, g)
    .textContent = `slope ${fmt(b, 2)} · correlation ${fmt(r, 2)} across ${live.length} campuses`;
}

/* ---- figure 3: the paired school scatter ------------------------------ */
function fig3(D) {
  const svg = $('fig3'); clear(svg);
  const W = 900, H = 380, mL = 64, mR = 24, mT = 16, mB = 42;
  const A = D.per[S.cA], B = D.per[S.cB];
  if (!A || !B) return;
  const mapB = new Map(B.rows.map(r => [r.si, r]));
  const pairs = A.rows.filter(r => mapB.has(r.si)).map(r => ({ si: r.si, a: r.dG, b: mapB.get(r.si).dG, w: (r.w + mapB.get(r.si).w) / 2 }));
  LAST = { pairs, A, B };
  if (pairs.length < 3) return;
  const all = pairs.flatMap(p => [p.a, p.b]);
  const lo = Math.min(...all), hi = Math.max(...all);
  const x = scale(lo, hi, mL, W - mR), y = scale(lo, hi, H - mB, mT);
  const g = el('g', {}, svg), ax = el('g', { class: 'ax' }, g);
  spine(g, mL, mT, mL, H - mB);
  baseLine(g, mL, W - mR, H - mB);
  for (const t of niceTicks(lo, hi, 6)) {
    tickX(g, x(t), H - mB);
    tickY(g, mL, y(t));
    el('text', { x: x(t), y: H - mB + 20, 'text-anchor': 'middle' }, ax).textContent = sgn(t, 2);
    el('text', { x: mL - 12, y: y(t) + 4, 'text-anchor': 'end' }, ax).textContent = sgn(t, 2);
  }
  el('line', { x1: x(lo), y1: y(lo), x2: x(hi), y2: y(hi), stroke: '#000', 'stroke-width': 2.2, 'stroke-dasharray': '7 5' }, g);
  el('text', { x: (mL + W - mR) / 2, y: H - 4, 'text-anchor': 'middle', class: 'axlab' }, g)
    .textContent = `change in the ${CAMPUS[S.cA]} slice`;
  el('text', { x: 13, y: (mT + H - mB) / 2, class: 'axlab', transform: `rotate(-90 13 ${(mT + H - mB) / 2})`, 'text-anchor': 'middle' }, g)
    .textContent = `change in the ${CAMPUS[S.cB]} slice`;
  const dots = el('g', {}, g);
  for (const p of pairs) {
    const c = el('circle', { cx: x(p.a), cy: y(p.b), r: Math.max(2.2, Math.min(7, Math.sqrt(p.w) / 4)), fill: p.a > p.b ? '#FB0207' : '#0000FF', opacity: S.pinned === p.si ? 1 : .35, stroke: S.pinned === p.si ? '#000' : 'none', 'stroke-width': 2.2, style: 'cursor:pointer' }, dots);
    c.addEventListener('mousemove', e => TIP.show(
      `<b>${SCH[p.si][1]}</b><br><span class="muted">${SCH[p.si][2]}, ${SCH[p.si][3]} County</span>` +
      `<br>${CAMPUS[S.cA]} slice ${sgn(p.a, 3)}<br>${CAMPUS[S.cB]} slice ${sgn(p.b, 3)}` +
      `<br>difference <b>${sgn(p.a - p.b, 3)}</b>`, e.clientX, e.clientY));
    c.addEventListener('mouseleave', () => TIP.hide());
    c.addEventListener('click', () => { S.pinned = S.pinned === p.si ? null : p.si; render(); });
  }
  const w = pairs.map(p => S.wt === 'a' ? p.w : 1), d = pairs.map(p => p.a - p.b);
  const m = wmean(d, w), se = bootSE(d, w), sh = 100 * wmean(d.map(v => v > 0 ? 1 : 0), w);
  el('text', { x: W - mR - 6, y: mT + 12, 'text-anchor': 'end', class: 'axlab', fill: '#16191d' }, g)
    .textContent = `${pairs.length.toLocaleString()} schools · mean difference ${sgn(m, 3)} (±${fmt(se, 3)}) · ${fmt(sh, 1)}% above the line`;
  $('s3').textContent = `Each dot is one high school that clears the threshold at both campuses in both periods. `
    + `The ${CAMPUS[S.cA]} slice rose more than the ${CAMPUS[S.cB]} slice at ${fmt(sh, 1)} percent of them; `
    + `on average by ${sgn(m, 3)} of a grade point.`;
}

/* ---- figure 4: chain-linked within-school series ---------------------- */
function chain(ci, gate, ser, filt) {
  const Sk = SERIES[ser];
  const out = [], byYear = [];
  for (let y = Y0; y <= Y1; y++) {
    const m = new Map();
    for (let si = 0; si < NS; si++) {
      if (filt && !filt(si)) continue;
      const f = fun(si, ci, y); if (!f) continue;
      const c = f[Sk.c], g = f[Sk.g];
      if (c && g !== null && f.A >= gate) m.set(si, { g, c });
    }
    byYear.push(m);
  }
  let lvl = 0;
  for (let k = 0; k < byYear.length; k++) {
    if (k === 0) { out.push({ y: Y0, v: 0, n: byYear[0].size }); continue; }
    const a = byYear[k - 1], b = byYear[k];
    const dv = [], dw = [];
    for (const [si, cur] of b) { const prev = a.get(si); if (prev) { dv.push(cur.g - prev.g); dw.push((cur.c + prev.c) / 2); } }
    if (dv.length >= 5) lvl += wmean(dv, dw);
    out.push({ y: Y0 + k, v: lvl, n: dv.length });
  }
  return out;
}
function fig4(D) {
  const svg = $('fig4'); clear(svg);
  const W = 900, H = 400, mL = 60, mR = 118, mT = 16, mB = 40;
  const series = [];
  for (let ci = 0; ci < NC; ci++) series.push({ ci, pts: chain(ci, S.gate, S.ser, D.filt) });
  const vals = series.flatMap(s => s.pts.map(p => p.v));
  const x = scale(Y0, Y1, mL, W - mR), y = scale(Math.min(...vals) - .02, Math.max(...vals) + .02, H - mB, mT);
  const g = el('g', {}, svg), ax = el('g', { class: 'ax' }, g);
  drawRegimes(g, x, mT, H - mB);
  spine(g, mL, mT, mL, H - mB);
  baseLine(g, mL, W - mR, H - mB);
  for (const t of niceTicks(y.dom[0], y.dom[1], 6)) {
    tickY(g, mL, y(t));
    if (Math.abs(t) < 1e-9) baseLine(g, mL, W - mR, y(t));
    el('text', { x: mL - 12, y: y(t) + 4, 'text-anchor': 'end' }, ax).textContent = sgn(t, 2);
  }
  for (let t = Math.ceil(Y0 / 5) * 5; t <= Y1; t += 5) {
    tickX(g, x(t), H - mB);
    el('text', { x: x(t), y: H - mB + 20, 'text-anchor': 'middle' }, ax).textContent = t;
  }
  el('text', { x: (mL + W - mR) / 2, y: H - 4, 'text-anchor': 'middle', class: 'axlab' }, g).textContent = 'graduating class';
  el('text', { x: 13, y: (mT + H - mB) / 2, class: 'axlab', transform: `rotate(-90 13 ${(mT + H - mB) / 2})`, 'text-anchor': 'middle' }, g)
    .textContent = 'cumulative within-school change in pool grade average';
  const labs = [];
  for (const s of series) {
    const pts = s.pts.filter(p => isFinite(p.v));
    el('path', { d: 'M' + pts.map(p => `${x(p.y).toFixed(1)},${y(p.v).toFixed(1)}`).join('L'), fill: 'none', stroke: campusColor(s.ci), 'stroke-width': 2.6 }, g);
    labs.push({ y: y(pts[pts.length - 1].v), t: CAMPUS[s.ci], c: campusColor(s.ci) });
  }
  for (const l of stackLabels(labs, 13, mT + 6, H - mB))
    el('text', { x: W - mR + 6, y: l.ly + 4, class: 'axlab', fill: l.c }, g).textContent = l.t;
  // hover column
  const hov = el('g', {}, g);
  const vline = el('line', { y1: mT, y2: H - mB, stroke: '#7a838d', 'stroke-width': 1, opacity: 0 }, hov);
  const cap = el('rect', { x: mL, y: mT, width: W - mR - mL, height: H - mB - mT, fill: 'transparent' }, hov);
  cap.addEventListener('mousemove', e => {
    const bb = svg.getBoundingClientRect(), px = (e.clientX - bb.left) / bb.width * W;
    const yy = Math.round(Math.max(Y0, Math.min(Y1, x.inv(px))));
    vline.setAttribute('x1', x(yy)); vline.setAttribute('x2', x(yy)); vline.setAttribute('opacity', .6);
    const rows = series.map(s => { const p = s.pts.find(q => q.y === yy); return { ci: s.ci, v: p ? p.v : null, n: p ? p.n : 0 }; })
      .sort((a, b) => (b.v ?? -9) - (a.v ?? -9));
    TIP.show(`<b>class of ${yy}</b><br>` + rows.map(r =>
      `<span style="color:${campusColor(r.ci)}">&#9632;</span> ${CAMPUS[r.ci]} <b>${sgn(r.v, 3)}</b> <span class="muted">${r.n} schools</span>`).join('<br>'),
      e.clientX, e.clientY);
  });
  cap.addEventListener('mouseleave', () => { vline.setAttribute('opacity', 0); TIP.hide(); });
  $('s4').textContent = `Chain-linked from the class of ${Y0}. Each step averages the year-over-year change at schools present in both years, so schools entering or leaving never create a jump. Read the vertical distance between two campuses, not the absolute height.`;
}

/* ---- table ------------------------------------------------------------ */
let sortKey = 'diff', sortDir = -1;
function table() {
  if (!LAST || !LAST.pairs.length) return;
  const th = $('tbl').querySelector('thead'), tb = $('tbl').querySelector('tbody');
  clear(th); clear(tb);
  const cols = [['name', 'high school'], ['county', 'county'], ['a', CAMPUS[S.cA] + ' change'], ['b', CAMPUS[S.cB] + ' change'], ['diff', 'difference'], ['w', 'applicants']];
  const hr = document.createElement('tr');
  for (const [k, t] of cols) {
    const h = document.createElement('th');
    h.textContent = t + (sortKey === k ? (sortDir > 0 ? ' ↑' : ' ↓') : '');
    h.addEventListener('click', () => { if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = -1; } table(); });
    hr.appendChild(h);
  }
  th.appendChild(hr);
  const rows = LAST.pairs.map(p => ({ si: p.si, name: SCH[p.si][1], county: SCH[p.si][3], a: p.a, b: p.b, diff: p.a - p.b, w: Math.round(p.w) }));
  rows.sort((r1, r2) => {
    const v1 = r1[sortKey], v2 = r2[sortKey];
    return (typeof v1 === 'string') ? sortDir * v2.localeCompare(v1) : sortDir * (v1 - v2);
  });
  for (const r of rows.slice(0, 400)) {
    const tr2 = document.createElement('tr');
    if (S.pinned === r.si) tr2.setAttribute('aria-selected', 'true');
    for (const [k] of cols) {
      const td = document.createElement('td');
      td.textContent = (k === 'name' || k === 'county') ? r[k] : (k === 'w' ? r[k].toLocaleString() : sgn(r[k], 3));
      tr2.appendChild(td);
    }
    tr2.addEventListener('click', () => { S.pinned = S.pinned === r.si ? null : r.si; render(); });
    tb.appendChild(tr2);
  }
  if (rows.length > 400) {
    const tr3 = document.createElement('tr'); const td = document.createElement('td');
    td.colSpan = 6; td.style.color = '#7a838d'; td.style.textAlign = 'left';
    td.textContent = `showing the first 400 of ${rows.length.toLocaleString()} schools in this sort order`;
    tr3.appendChild(td); tb.appendChild(tr3);
  }
}

/* ---- readout ----------------------------------------------------------- */
function readout(D) {
  const live = D.per.filter(Boolean);
  const ro = $('ro'); ro.innerHTML = '';
  if (!live.length) { ro.innerHTML = '<div><div class="k">no schools</div><div class="v">&mdash;</div><div class="n">loosen the filters or lower the applicant threshold</div></div>'; return; }
  const deep = live.reduce((a, b) => a.Gp < b.Gp ? a : b), shal = live.reduce((a, b) => a.Gp > b.Gp ? a : b);
  const A = D.per[S.cA], B = D.per[S.cB];
  let pd = '—', pn = '';
  if (A && B) {
    const mB = new Map(B.rows.map(r => [r.si, r]));
    const pr = A.rows.filter(r => mB.has(r.si));
    if (pr.length > 2) {
      const w = pr.map(r => S.wt === 'a' ? (r.w + mB.get(r.si).w) / 2 : 1);
      const d = pr.map(r => r.dG - mB.get(r.si).dG);
      pd = sgn(wmean(d, w), 3); pn = `${pr.length.toLocaleString()} schools, ±${fmt(bootSE(d, w), 3)}`;
    }
  }
  const cells = [
    ['deepest pool', CAMPUS[deep.ci], `started at ${fmt(deep.Gp)} — furthest down the class`],
    ['its change', sgn(deep.dG, 3), `${fmt(deep.pos, 0)}% of ${deep.n.toLocaleString()} schools rose`],
    ['shallowest pool', CAMPUS[shal.ci], `started at ${fmt(shal.Gp)} — the top of the class`],
    ['its change', sgn(shal.dG, 3), `${fmt(shal.pos, 0)}% of ${shal.n.toLocaleString()} schools rose`],
    [`${CAMPUS[S.cA]} minus ${CAMPUS[S.cB]}`, pd, pn || 'same schools, paired']
  ];
  for (const [k, v, n] of cells) {
    const d = document.createElement('div');
    d.innerHTML = `<div class="k">${k}</div><div class="v">${v}</div><div class="n">${n}</div>`;
    ro.appendChild(d);
  }
}

function render() {
  const D = computeAll();
  const py = a => a.length === 1 ? `the class of ${a[0]}` : `the classes of ${a[0]}–${a[a.length - 1]}`;
  $('s1').textContent = `Grade point average of ${SERIES[S.ser].label}, ${py(D.pre)} against ${py(D.post)}, `
    + `measured only at schools that clear the applicant threshold in both periods.`;
  $('s2').textContent = `The pools that started nearest the cap moved least. However the rise arose, a downward slope here measures compression: gains crowd against the top of the scale, and a grade point separates less of the class than it once did.`;
  readout(D); fig1(D); fig2(D); fig3(D); fig4(D); table();
  $('foot').innerHTML = `Built from the University of California&rsquo;s published applicant, admitted and enrolled grade point averages by high school and campus, classes ${Y0}&ndash;${Y1}; campus labels as repaired on 30 July 2026. Data prepared ${M.built}. ${NS.toLocaleString()} California high schools. <a href="methods.html">Methods and sources</a>.`;
}
initControls(); render();
