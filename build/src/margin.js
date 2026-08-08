/* Tab 3 — The crowded top.
 * Headline series: the separation between admitted and denied students, derived
 * cell by cell from the published applicant and admitted averages and counts.
 * Admitted minus applicants sits behind a toggle; the two are linked by
 * gap = (1 - p) * separation, exactly, in every cell.                        */
'use strict';
const $ = id => document.getElementById(id);
const DEF = {
  view: 'sep', sep: 'sep', camps: [0, 3, 6, 5], focal: 0,
  county: '', upp: '', gate: 20, agg: 'within', thr: 3.90,
  e0a: 2016, e0b: 2019, e1a: 2023, e1b: 2025, survcamp: 0,
  minr: 10, xscale: 'rate', grain: 'campus', plen: 4, sgate: 100
};
const S = Object.assign({}, DEF, { camps: DEF.camps.slice() });

const UPPCUT = tercile(TRAIT.map(t => t.upp));
function band(v, cut) { if (v === null || !isFinite(v)) return null; return v < cut[0] ? 0 : (v < cut[1] ? 1 : 2); }
function schoolFilter() {
  const c = S.county, u = S.upp === '' ? null : +S.upp;
  if (!c && u === null) return null;
  return si => (!c || TRAIT[si].county === c) && (u === null || band(TRAIT[si].upp, UPPCUT) === u);
}
const EARLY = () => yearsBetween(Math.min(S.e0a, S.e0b), Math.max(S.e0a, S.e0b));
const LATE = () => yearsBetween(Math.min(S.e1a, S.e1b), Math.max(S.e1a, S.e1b));
const eraLab = (a, b) => (a === b) ? `the class of ${a}` : `classes ${Math.min(a, b)}–${Math.max(a, b)}`;

/* ---- the class-by-class series ---------------------------------------- */
function seriesFor(ci) {
  const filt = schoolFilter(), out = [];
  for (let y = Y0; y <= Y1; y++) {
    const gv = [], gw = [], sv = [], sw = [], se = [], pg = [], pw = [], ar = [], aw = [];
    let numA = 0, denA = 0, numD = 0, denD = 0, numR = 0, denR = 0, numDs = 0, denDs = 0, sumA = 0, sumD = 0;
    for (let si = 0; si < NS; si++) {
      if (filt && !filt(si)) continue;
      const f = fun(si, ci, y); if (!f || !f.A || f.A < S.gate) continue;
      if (f.ag !== null) { pg.push(f.ag); pw.push(f.A); numA += f.A * f.ag; denA += f.A; }
      if (f.ag !== null && f.dg !== null && f.D) { gv.push(f.dg - f.ag); gw.push(f.D); numD += f.D * f.dg; denD += f.D; }
      if (f.ag !== null && f.D !== null && f.A) { ar.push(100 * f.D / f.A); aw.push(f.A); }
      const c = deniedCell(si, ci, y, S.minr);
      if (c) {
        sv.push(c.sep); sw.push(c.D); se.push(c.err);
        numR += c.R * c.rg; denR += c.R;
        numDs += c.D * c.dg; denDs += c.D;
        sumA += c.A; sumD += c.D;
      }
    }
    const r = { y, n: pg.length, nGap: gv.length, nSep: sv.length };
    r.gapWithin = gv.length >= 5 ? wmean(gv, gw) : null;
    r.gapPooled = (denA > 0 && denD > 0) ? (numD / denD - numA / denA) : null;
    r.gap = S.agg === 'within' ? r.gapWithin : r.gapPooled;
    r.sepWithin = sv.length >= 5 ? wmean(sv, sw) : null;
    r.sepErr = sv.length >= 5 ? wmean(se, sw) : null;      // worst-case rounding bound
    r.sepPooled = (denDs > 0 && denR > 0 && sv.length >= 5) ? (numDs / denDs - numR / denR) : null;
    r.sep = S.agg === 'within' ? r.sepWithin : r.sepPooled;
    r.val = S.sep === 'sep' ? r.sep : r.gap;
    r.valErr = S.sep === 'sep' ? r.sepErr : 0.01;
    r.nVal = S.sep === 'sep' ? r.nSep : r.nGap;
    r.poolGPA = denA > 0 ? numA / denA : null;
    r.spread = pg.length >= 5 ? wsd(pg, pw) : null;
    r.corr = null;   // filled by corrFor(), which pairs the two arrays correctly
    r.admitRate = aw.length ? wmean(ar, aw) : null;
    r.admitRateSep = sumA ? 100 * sumD / sumA : null;      // over the cells the separation uses
    // share of applicant mass at schools at or above the threshold
    let above = 0, tot = 0;
    for (let i = 0; i < pg.length; i++) { tot += pw[i]; if (pg[i] >= S.thr) above += pw[i]; }
    r.share = tot ? 100 * above / tot : null;
    out.push(r);
  }
  return out;
}
// pg and ar are built from different filters above; rebuild the correlation properly
function corrFor(ci) {
  const filt = schoolFilter(), out = [];
  for (let y = Y0; y <= Y1; y++) {
    const g = [], a = [], w = [];
    for (let si = 0; si < NS; si++) {
      if (filt && !filt(si)) continue;
      const f = fun(si, ci, y); if (!f || !f.A || f.A < S.gate) continue;
      if (f.ag === null || f.D === null) continue;
      g.push(f.ag); a.push(100 * f.D / f.A); w.push(f.A);
    }
    out.push({ y, v: g.length >= 25 ? wcorr(g, a, w) : null, n: g.length });
  }
  return out;
}

let DATA = null;
function compute() {
  const per = {};
  for (const ci of S.camps) { per[ci] = seriesFor(ci); const c = corrFor(ci); per[ci].forEach((r, i) => r.corr = c[i].v); }
  DATA = per; return per;
}

/* ---- generic line chart ----------------------------------------------- */
function lineChart(svgId, per, key, opt) {
  const svg = $(svgId); clear(svg);
  const W = 900, H = opt.H || 420, mL = 62, mR = 130, mT = 16, mB = 40;
  const all = [];
  for (const ci of S.camps) for (const r of per[ci]) if (r[key] !== null && isFinite(r[key])) all.push(r[key]);
  if (!all.length) { el('text', { x: 300, y: 100, class: 'axlab' }, svg).textContent = 'no data for these settings'; return; }
  let lo = Math.min(...all), hi = Math.max(...all);
  if (opt.zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
  const pad = (hi - lo) * .08 + 1e-6;
  const x = scale(Y0, Y1, mL, W - mR), y = scale(lo - pad, hi + pad, H - mB, mT);
  const g = el('g', {}, svg), ax = el('g', { class: 'ax' }, g);
  drawRegimes(g, x, mT, H - mB);
  spine(g, mL, mT, mL, H - mB);
  baseLine(g, mL, W - mR, H - mB);
  for (const t of niceTicks(y.dom[0], y.dom[1], 6)) {
    tickY(g, mL, y(t));
    if (Math.abs(t) < 1e-9) baseLine(g, mL, W - mR, y(t));
    el('text', { x: mL - 12, y: y(t) + 4, 'text-anchor': 'end' }, ax).textContent = opt.fmt ? opt.fmt(t) : sgn(t, 2);
  }
  for (let t = Math.ceil(Y0 / 5) * 5; t <= Y1; t += 5) {
    tickX(g, x(t), H - mB);
    el('text', { x: x(t), y: H - mB + 20, 'text-anchor': 'middle' }, ax).textContent = t;
  }
  el('text', { x: (mL + W - mR) / 2, y: H - 4, 'text-anchor': 'middle', class: 'axlab' }, g).textContent = 'graduating class';
  el('text', { x: 13, y: (mT + H - mB) / 2, class: 'axlab', 'text-anchor': 'middle', transform: `rotate(-90 13 ${(mT + H - mB) / 2})` }, g).textContent = opt.ylab;
  const labs = [];
  for (const ci of S.camps) {
    const pts = per[ci].filter(r => r[key] !== null && isFinite(r[key]));
    if (!pts.length) continue;
    const focal = (S.camps.length > 1 && ci === S.focal);
    const dim = (S.camps.length > 1 && S.camps.includes(S.focal) && !focal);
    // the worst-case rounding band, where the quantity is derived by subtraction;
    // broken at the same class gaps as the line itself
    if (opt.errkey) {
      const bp = pts.filter(r => r[opt.errkey] !== null && isFinite(r[opt.errkey]));
      const runs = [];
      for (const r of bp) {
        const last = runs[runs.length - 1];
        if (last && r.y === last[last.length - 1].y + 1) last.push(r); else runs.push([r]);
      }
      let dd = '';
      for (const run of runs) {
        if (run.length < 2) continue;
        dd += 'M' + run.map(r => `${x(r.y).toFixed(1)},${y(Math.min(y.dom[1], r[key] + r[opt.errkey])).toFixed(1)}`).join('L')
            + 'L' + run.slice().reverse().map(r => `${x(r.y).toFixed(1)},${y(Math.max(y.dom[0], r[key] - r[opt.errkey])).toFixed(1)}`).join('L') + 'Z';
      }
      if (dd) el('path', { d: dd, fill: poolColor(ci), opacity: dim ? .08 : .18, class: 'errband' }, g);
    }
    // break the path where a class is missing
    let d = '', prev = null;
    for (const p of pts) { d += (prev !== null && p.y === prev + 1 ? 'L' : 'M') + x(p.y).toFixed(1) + ',' + y(p[key]).toFixed(1); prev = p.y; }
    el('path', { d, fill: 'none', stroke: poolColor(ci), 'stroke-width': focal ? 3.4 : 2.6, opacity: dim ? .38 : 1, class: 'series' }, g);
    labs.push({ y: y(pts[pts.length - 1][key]), t: poolLabel(ci), c: poolColor(ci), dim });
  }
  for (const l of stackLabels(labs, 13, mT + 6, H - mB))
    el('text', { x: W - mR + 6, y: l.ly + 4, class: 'axlab', fill: l.c, opacity: l.dim ? .5 : 1 }, g).textContent = l.t;
  const vline = el('line', { y1: mT, y2: H - mB, stroke: '#555555', 'stroke-width': 1, opacity: 0 }, g);
  const cap = el('rect', { x: mL, y: mT, width: W - mR - mL, height: H - mB - mT, fill: 'transparent' }, g);
  cap.addEventListener('mousemove', e => {
    const bb = svg.getBoundingClientRect(), px = (e.clientX - bb.left) / bb.width * W;
    const yy = Math.round(Math.max(Y0, Math.min(Y1, x.inv(px))));
    vline.setAttribute('x1', x(yy)); vline.setAttribute('x2', x(yy)); vline.setAttribute('opacity', .6);
    const rows = S.camps.map(ci => { const r = per[ci].find(q => q.y === yy); return { ci, r }; })
      .filter(o => o.r).sort((a, b) => (b.r[key] ?? -99) - (a.r[key] ?? -99));
    TIP.show(`<b>class of ${yy}</b><br>` + rows.map(o =>
      `<span style="color:${poolColor(o.ci)}">&#9632;</span> ${poolLabel(o.ci)} <b>${opt.fmt ? opt.fmt(o.r[key]) : sgn(o.r[key], 3)}</b>` +
      (opt.errkey && o.r[opt.errkey] ? ` &plusmn;${o.r[opt.errkey].toFixed(3)}` : '') +
      ` <span class="muted">${opt.nkey ? o.r[opt.nkey] : o.r.n} schools, admission rate ${fmt(o.r.admitRate, 0)}%</span>`).join('<br>'), e.clientX, e.clientY);
  });
  cap.addEventListener('mouseleave', () => { vline.setAttribute('opacity', 0); TIP.hide(); });
}

/* ---- saturation figure (unchanged from the 1 August build) ------------- */
function fig2() {
  const svg = $('fig2'); clear(svg);
  const W = 900, H = 320, mL = 62, mR = 130, mT = 16, mB = 40;
  const per = DATA;
  const all = [];
  for (const ci of S.camps) for (const r of per[ci]) if (r.share !== null) all.push(r.share);
  if (!all.length) return;
  const x = scale(Y0, Y1, mL, W - mR), y = scale(0, Math.max(100, Math.max(...all)), H - mB, mT);
  const g = el('g', {}, svg), ax = el('g', { class: 'ax' }, g);
  drawRegimes(g, x, mT, H - mB);
  spine(g, mL, mT, mL, H - mB);
  baseLine(g, mL, W - mR, H - mB);
  for (const t of niceTicks(0, y.dom[1], 5)) {
    tickY(g, mL, y(t));
    el('text', { x: mL - 12, y: y(t) + 4, 'text-anchor': 'end' }, ax).textContent = t + '%';
  }
  for (let t = Math.ceil(Y0 / 5) * 5; t <= Y1; t += 5) {
    tickX(g, x(t), H - mB);
    el('text', { x: x(t), y: H - mB + 20, 'text-anchor': 'middle' }, ax).textContent = t;
  }
  el('text', { x: 13, y: (mT + H - mB) / 2, class: 'axlab', 'text-anchor': 'middle', transform: `rotate(-90 13 ${(mT + H - mB) / 2})` }, g)
    .textContent = 'share of applicants';
  const labs2 = [];
  for (const ci of S.camps) {
    const pts = per[ci].filter(r => r.share !== null);
    if (!pts.length) continue;
    el('path', { d: 'M' + pts.map(p => `${x(p.y).toFixed(1)},${y(p.share).toFixed(1)}`).join('L'), fill: 'none', stroke: poolColor(ci), 'stroke-width': 2.6, class: 'series2' }, g);
    labs2.push({ y: y(pts[pts.length - 1].share), t: poolLabel(ci), c: poolColor(ci) });
  }
  for (const l of stackLabels(labs2, 13, mT + 6, H - mB))
    el('text', { x: W - mR + 6, y: l.ly + 4, class: 'axlab', fill: l.c }, g).textContent = l.t;
  $('s2').textContent = `The share of each pool's applicants who come from a high school whose applicant pool averages ${S.thr.toFixed(2)} or better. `
    + `Move the slider in the sidebar; if the lines sweep upward as the bar falls and stay flat as it rises, the crowding is at the top of the scale.`;
}

/* ---- survival curves, two windows -------------------------------------- */
const EARLYCOL = '#555555';
function fig3() {
  const svg = $('fig3'); clear(svg);
  const W = 900, H = 380, mL = 62, mR = 140, mT = 20, mB = 46;
  const ci = S.survcamp, filt = schoolFilter();
  const eA = EARLY(), eB = LATE();
  const PA = eraSchool(ci, eA, S.gate, 'app'), PB = eraSchool(ci, eB, S.gate, 'app');
  const vals = [];
  for (const [si, r] of PA) if (!filt || filt(si)) vals.push(r.G);
  for (const [si, r] of PB) if (!filt || filt(si)) vals.push(r.G);
  if (vals.length < 10) {
    el('text', { x: 300, y: 120, class: 'axlab' }, svg).textContent = 'too few schools for these settings';
    $('s3').textContent = ''; $('leg3').innerHTML = ''; return;
  }
  const raw0 = Math.max(0, Math.floor(Math.min(...vals) * 20) / 20), hi = Math.ceil(Math.max(...vals) * 20) / 20;
  const T0 = []; for (let t = raw0; t <= hi + 1e-9; t += 0.01) T0.push(+t.toFixed(2));
  const fA = survival(ci, eA, S.gate, T0, 'app', filt), fB = survival(ci, eB, S.gate, T0, 'app', filt);
  // the scale below the point where both windows still hold every applicant is flat
  // by construction; start a tenth of a point below it and say so
  let k = 0;
  while (k + 1 < T0.length && fA[k + 1].share >= 99.5 && fB[k + 1].share >= 99.5) k++;
  const trimmed = T0[k] > raw0 + 0.001;
  const lo = trimmed ? Math.max(raw0, +(T0[k] - 0.10).toFixed(2)) : raw0;
  const T = T0.filter(t => t >= lo - 1e-9);
  const cA = fA.slice(T0.length - T.length), cB = fB.slice(T0.length - T.length);

  const x = scale(lo, hi, mL, W - mR), y = scale(0, 100, H - mB, mT);
  const g = el('g', {}, svg), ax = el('g', { class: 'ax' }, g);
  spine(g, mL, mT, mL, H - mB);
  baseLine(g, mL, W - mR, H - mB);
  for (const t of [0, 20, 40, 60, 80, 100]) {
    tickY(g, mL, y(t));
    el('text', { x: mL - 12, y: y(t) + 4, 'text-anchor': 'end' }, ax).textContent = t + '%';
  }
  for (const t of niceTicks(lo, hi, 7)) {
    tickX(g, x(t), H - mB);
    el('text', { x: x(t), y: H - mB + 20, 'text-anchor': 'middle' }, ax).textContent = t.toFixed(2);
  }
  el('text', { x: (mL + W - mR) / 2, y: H - 4, 'text-anchor': 'middle', class: 'axlab' }, g).textContent = 'grade point average threshold';
  el('text', { x: 13, y: (mT + H - mB) / 2, class: 'axlab', 'text-anchor': 'middle', transform: `rotate(-90 13 ${(mT + H - mB) / 2})` }, g)
    .textContent = 'share of applicants at or above';

  const lateCol = poolColor(ci);
  el('path', {
    d: 'M' + cA.map(p => `${x(p.t).toFixed(1)},${y(p.share).toFixed(1)}`).join('L')
     + 'L' + cB.slice().reverse().map(p => `${x(p.t).toFixed(1)},${y(p.share).toFixed(1)}`).join('L') + 'Z',
    fill: lateCol, opacity: .13, class: 'band'
  }, g);
  el('path', { d: 'M' + cA.map(p => `${x(p.t).toFixed(1)},${y(p.share).toFixed(1)}`).join('L'), fill: 'none', stroke: EARLYCOL, 'stroke-width': 2.6, class: 'curve early' }, g);
  el('path', { d: 'M' + cB.map(p => `${x(p.t).toFixed(1)},${y(p.share).toFixed(1)}`).join('L'), fill: 'none', stroke: lateCol, 'stroke-width': 3.4, class: 'curve late' }, g);

  // where the two windows differ most
  let best = 0, bi = 0;
  for (let i = 0; i < T.length; i++) { const d = (cB[i].share ?? 0) - (cA[i].share ?? 0); if (d > best) { best = d; bi = i; } }
  el('line', { x1: x(T[bi]), x2: x(T[bi]), y1: y(cA[bi].share), y2: y(cB[bi].share), stroke: '#000000', 'stroke-width': 2, class: 'maxgap' }, g);
  el('text', { x: x(T[bi]) + 8, y: (y(cA[bi].share) + y(cB[bi].share)) / 2 + 4, class: 'axlab halo' }, g)
    .textContent = `widest at ${T[bi].toFixed(2)}: +${best.toFixed(1)} points`;

  // the crowding slider's bar, so the two figures read as one control
  const tv = Math.min(hi, Math.max(lo, S.thr));
  el('line', { x1: x(tv), x2: x(tv), y1: mT, y2: H - mB, stroke: '#555555', 'stroke-dasharray': '4 3', 'stroke-width': 1.6, class: 'thrline' }, g);
  el('text', { x: x(tv), y: mT - 5, 'text-anchor': 'middle', class: 'axlab halo' }, g).textContent = S.thr.toFixed(2);
  const idx = t => Math.max(0, Math.min(T.length - 1, Math.round((t - lo) / 0.01)));
  const at = idx(tv);
  el('circle', { cx: x(T[at]), cy: y(cA[at].share), r: 4, fill: EARLYCOL, class: 'mark' }, g);
  el('circle', { cx: x(T[at]), cy: y(cB[at].share), r: 4, fill: lateCol, class: 'mark' }, g);

  const cap = el('rect', { x: mL, y: mT, width: W - mR - mL, height: H - mB - mT, fill: 'transparent' }, g);
  const hov = el('line', { y1: mT, y2: H - mB, stroke: '#555555', 'stroke-width': 1, opacity: 0 }, g);
  cap.addEventListener('mousemove', e => {
    const bb = svg.getBoundingClientRect(), px = (e.clientX - bb.left) / bb.width * W;
    const i = idx(x.inv(px));
    hov.setAttribute('x1', x(T[i])); hov.setAttribute('x2', x(T[i])); hov.setAttribute('opacity', .5);
    TIP.show(`<b>${poolLabel(ci)}, threshold ${T[i].toFixed(2)}</b><br>`
      + `<span style="color:${EARLYCOL}">&#9632;</span> ${eraLab(S.e0a, S.e0b)} <b>${fmt(cA[i].share, 1)}%</b> <span class="muted">${cA[i].nSchools} of ${cA[i].nTotal} schools</span><br>`
      + `<span style="color:${lateCol}">&#9632;</span> ${eraLab(S.e1a, S.e1b)} <b>${fmt(cB[i].share, 1)}%</b> <span class="muted">${cB[i].nSchools} of ${cB[i].nTotal} schools</span><br>`
      + `difference <b>${sgn(cB[i].share - cA[i].share, 1)}</b> points`, e.clientX, e.clientY);
  });
  cap.addEventListener('mouseleave', () => { hov.setAttribute('opacity', 0); TIP.hide(); });

  const leg = $('leg3'); leg.innerHTML = '';
  [[EARLYCOL, eraLab(S.e0a, S.e0b)], [lateCol, eraLab(S.e1a, S.e1b)]].forEach(([c, t]) => {
    const s = document.createElement('span'); s.className = 'static';
    s.innerHTML = `<span class="swatch" style="background:${c}"></span>${t}`; leg.appendChild(s);
  });
  const median = c => { const p = c.find(q => q.share !== null && q.share <= 50); return p ? p.t : null; };
  $('s3').textContent = `${poolLabel(ci)}: the share of applicant mass at or above every grade point average, for ${eraLab(S.e0a, S.e0b)} and ${eraLab(S.e1a, S.e1b)}. `
    + `The vertical distance between the curves is how much of the pool moved above each bar; it is widest at ${T[bi].toFixed(2)}, where ${best.toFixed(1)} additional percent of applicants now sit at or above. `
    + `Half the pool sat at or above ${fmt(median(cA), 2)} in the earlier window and ${fmt(median(cB), 2)} in the later one. `
    + `The crowding slider's bar is marked; dragging it walks along this curve.`
    + (trimmed ? ` The scale below ${lo.toFixed(2)} is omitted: both windows hold essentially every applicant there.` : '');
}

/* ---- separation against selectivity ------------------------------------ */
let SCAT = null;
function scatterPoints() {
  const filt = schoolFilter(), PER = periods(S.plen), pts = [];
  for (const ci of S.camps) {
    PER.forEach((p, pi) => {
      if (S.grain === 'campus') {
        const r = separation(ci, p.years, S.gate, S.minr, filt);
        if (r && r.n >= 20 && r.sep !== null && r.admitRate !== null)
          pts.push({ ci, pi, p, sep: r.sep, gap: r.gap, err: r.err, rate: r.admitRate, w: r.A, n: r.n, si: null });
      } else {
        const rs = separation(ci, p.years, S.gate, S.minr, filt, S.sgate);
        for (const r of rs) if (r.sep !== null && r.admitRate !== null && r.admitRate > 0 && r.admitRate < 100)
          pts.push({ ci, pi, p, sep: r.sep, gap: r.gap, err: r.err, rate: r.admitRate, w: r.A, n: r.n, si: r.si });
      }
    });
  }
  return { pts, PER };
}
function fig4() {
  const svg = $('fig4'); clear(svg);
  const W = 900, H = 420, mL = 62, mR = 140, mT = 18, mB = 48;
  const { pts } = scatterPoints(); SCAT = pts;
  const leg = $('leg4'); leg.innerHTML = '';
  if (pts.length < 3) {
    el('text', { x: 300, y: 120, class: 'axlab' }, svg).textContent = 'too few points for these settings';
    $('s4').textContent = ''; return;
  }
  const xv = p => S.xscale === 'logit' ? logit(p.rate / 100) : p.rate;
  const COARSE = 0.10;                     // grade points of worst-case rounding
  const all = pts.filter(p => isFinite(xv(p)));
  const use = all.filter(p => p.err !== null && p.err <= COARSE);
  const coarse = all.filter(p => !(p.err !== null && p.err <= COARSE));
  if (use.length < 3) {
    el('text', { x: 300, y: 120, class: 'axlab' }, svg).textContent = 'every point here is inside the rounding bound';
    $('s4').textContent = ''; return;
  }
  const xs = use.map(xv), ys = use.map(p => p.sep), ws = use.map(p => p.w);
  const xspan = Math.max(...xs) - Math.min(...xs) + 1e-9;
  const x = scale(Math.min(...xs) - .05 * xspan, Math.max(...xs) + .05 * xspan, mL, W - mR);
  const ylo = Math.min(...ys), yhi = Math.max(...ys), yspan = yhi - ylo + 1e-9;
  const y = scale(ylo - .10 * yspan, yhi + .08 * yspan, H - mB, mT);
  const g = el('g', {}, svg), ax = el('g', { class: 'ax' }, g);
  spine(g, mL, mT, mL, H - mB);
  baseLine(g, mL, W - mR, H - mB);
  for (const t of niceTicks(y.dom[0], y.dom[1], 6)) {
    tickY(g, mL, y(t));
    el('text', { x: mL - 12, y: y(t) + 4, 'text-anchor': 'end' }, ax).textContent = sgn(t, 2);
  }
  for (const t of niceTicks(x.dom[0], x.dom[1], 7)) {
    tickX(g, x(t), H - mB);
    el('text', { x: x(t), y: H - mB + 20, 'text-anchor': 'middle' }, ax).textContent = S.xscale === 'logit' ? t.toFixed(1) : t.toFixed(0) + '%';
  }
  el('text', { x: (mL + W - mR) / 2, y: H - 4, 'text-anchor': 'middle', class: 'axlab' }, g).textContent =
    S.xscale === 'logit' ? 'admission rate, log-odds — more selective to the left' : 'admission rate over the period — more selective to the left';
  el('text', { x: 13, y: (mT + H - mB) / 2, class: 'axlab', 'text-anchor': 'middle', transform: `rotate(-90 13 ${(mT + H - mB) / 2})` }, g)
    .textContent = 'admitted minus denied, grade points';

  // one faint trajectory per pool, oldest to newest
  if (S.grain === 'campus') {
    for (const ci of S.camps) {
      const tr = use.filter(p => p.ci === ci).sort((a, b) => a.pi - b.pi);
      if (tr.length > 1) el('path', {
        d: 'M' + tr.map(p => `${x(xv(p)).toFixed(1)},${y(p.sep).toFixed(1)}`).join('L'),
        fill: 'none', stroke: poolColor(ci), 'stroke-width': 1.4, opacity: .4, class: 'traj'
      }, g);
    }
  }
  // points the record cannot resolve: shown, so nothing is silently dropped,
  // but hollow, and kept out of the fit
  for (const p of coarse) {
    const yy = Math.max(y.dom[0], Math.min(y.dom[1], p.sep));
    const c = el('circle', {
      cx: x(xv(p)), cy: y(yy), r: S.grain === 'campus' ? 4.5 : 2.6, fill: 'none',
      stroke: poolColor(p.ci), 'stroke-width': 1.4, 'stroke-dasharray': '2 2', opacity: .7, class: 'pt coarse'
    }, g);
    c.addEventListener('mouseenter', e => TIP.show(
      `<b>${poolLabel(p.ci)}, classes ${p.p.a}–${p.p.b}</b>` + (p.si !== null ? `<br>${SCH[p.si][1]}` : '') +
      `<br>separation ${sgn(p.sep, 3)} <b>&plusmn;${fmt(p.err, 2)}</b><br>admission rate ${fmt(p.rate, 1)}%` +
      `<br><span class="muted">too few denied students for the derived average to be resolved; excluded from the fit</span>`,
      e.clientX, e.clientY));
    c.addEventListener('mouseleave', () => TIP.hide());
  }
  const wmaxv = Math.max(...ws);
  for (const p of use) {
    const focal = (S.camps.length > 1 && p.ci === S.focal);
    const dim = (S.camps.length > 1 && S.camps.includes(S.focal) && !focal);
    const r = S.grain === 'campus' ? 3.6 + 6.4 * Math.sqrt(p.w / wmaxv) : 2.8;
    const c = el('circle', {
      cx: x(xv(p)), cy: y(p.sep), r, fill: poolColor(p.ci),
      opacity: S.grain === 'campus' ? (dim ? .32 : .88) : (dim ? .10 : .30),
      stroke: S.grain === 'campus' ? '#FFFFFF' : 'none', 'stroke-width': 1, class: 'pt'
    }, g);
    c.addEventListener('mouseenter', e => TIP.show(
      `<b>${poolLabel(p.ci)}, classes ${p.p.a}–${p.p.b}</b>` + (p.si !== null ? `<br>${SCH[p.si][1]}` : '') +
      `<br>separation <b>${sgn(p.sep, 3)}</b> &plusmn;${fmt(p.err, 3)}<br>admitted minus applicants ${sgn(p.gap, 3)}` +
      `<br>admission rate <b>${fmt(p.rate, 1)}%</b><br><span class="muted">${p.n} school-classes, ${p.w.toLocaleString()} applicants</span>`,
      e.clientX, e.clientY));
    c.addEventListener('mouseleave', () => TIP.hide());
  }
  // each pool labeled beside its most recent block
  if (S.grain === 'campus') {
    for (const ci of S.camps) {
      const tr = use.filter(p => p.ci === ci).sort((a, b) => a.pi - b.pi);
      if (!tr.length) continue;
      const p = tr[tr.length - 1], px = x(xv(p)), right = px < W - mR - 80;
      el('text', {
        x: px + (right ? 13 : -13), y: y(p.sep) + 4, class: 'axlab halo',
        'text-anchor': right ? 'start' : 'end', fill: poolColor(ci)
      }, g).textContent = poolLabel(ci);
    }
  }
  // the pooled tilt, and the tilt the arithmetic alone would produce
  const b = wslope(xs, ys, ws), r = wcorr(xs, ys, ws);
  const gapv = use.map(p => p.gap), rg = wcorr(xs, gapv, ws), bg = wslope(xs, gapv, ws);
  const x0 = x.dom[0], x1 = x.dom[1], mx = wmean(xs, ws), my = wmean(ys, ws);
  el('path', {
    d: `M${x(x0).toFixed(1)},${y(my + b * (x0 - mx)).toFixed(1)}L${x(x1).toFixed(1)},${y(my + b * (x1 - mx)).toFixed(1)}`,
    fill: 'none', stroke: '#000000', 'stroke-width': 2, 'stroke-dasharray': '7 5', class: 'fit'
  }, g);
  // Separation = gap / (1 - p).  If the gap were the same everywhere, the points
  // would trace this curve exactly: it is the tilt the arithmetic alone produces.
  const gbar = wmean(gapv, ws);
  const pOf = v => S.xscale === 'logit' ? 1 / (1 + Math.exp(-v)) : v / 100;
  const nullPts = [];
  for (let i = 0; i <= 160; i++) {
    const v = x0 + (x1 - x0) * i / 160, pp = pOf(v);
    if (pp > 0 && pp < 0.985) nullPts.push([v, gbar / (1 - pp)]);
  }
  const inRange = nullPts.filter(q => q[1] >= y.dom[0] && q[1] <= y.dom[1]);
  if (inRange.length > 1) el('path', {
    d: 'M' + inRange.map(q => `${x(q[0]).toFixed(1)},${y(q[1]).toFixed(1)}`).join('L'),
    fill: 'none', stroke: '#555555', 'stroke-width': 2, class: 'nullcurve'
  }, g);
  let above = 0, tot = 0;
  for (let i = 0; i < use.length; i++) {
    const pp = pOf(xs[i]); if (!(pp > 0 && pp < 0.985)) continue;
    tot += ws[i]; if (ys[i] > gbar / (1 - pp)) above += ws[i];
  }
  const legItem = (sw, text) => {
    const s = document.createElement('span'); s.className = 'static';
    s.innerHTML = sw + text; leg.appendChild(s);
  };
  legItem('<span class="swatch" style="background:#000000"></span>',
    `weighted fit: slope ${sgn(b, 4)} per ${S.xscale === 'logit' ? 'log-odds' : 'point of admission rate'}, r ${sgn(r, 2)}`);
  legItem('<span class="swatch" style="background:#555555"></span>',
    `where the points would fall if admitted minus applicants were ${sgn(gbar, 3)} everywhere`);
  if (coarse.length) legItem('<span class="swatch" style="background:#FFFFFF;border:1.4px dashed #555555"></span>',
    `rounding bound above ${COARSE.toFixed(2)}: drawn, not fitted`);
  if (S.grain === 'campus') legItem('', 'faint lines join a pool’s periods, oldest to newest; point size is applicant volume');

  const dir = b < 0 ? 'more' : 'less';
  $('s4').innerHTML = `As selection intensified, did grades express more of it or less? Each point is `
    + (S.grain === 'campus' ? `one pool over ${S.plen} graduating classes` : `one high school at one pool over ${S.plen} graduating classes, with at least ${S.sgate} applicants in the block`)
    + `, ${use.length} in all. Across these points the separation ${b < 0 ? 'rises' : 'falls'} as the admission rate falls `
    + `(slope ${sgn(b, 4)}, r ${sgn(r, 2)}), so a more selective pool shows <b>${dir}</b> distance between the admitted and the denied on the grade scale. `
    + `Part of that tilt is arithmetic: the separation is the admitted-minus-applicants distance divided by the share not admitted, so it climbs as the admission rate climbs even if nothing about the grades changes. `
    + `The gray line is where the points would sit under exactly that null, with the distance held at its average of ${sgn(gbar, 3)}; ${fmt(100 * (tot ? above / tot : 0), 0)} percent of the applicant mass sits above it. `
    + `Measured instead as admitted minus applicants, the same points tilt ${sgn(bg, 4)} with r ${sgn(rg, 2)}. `
    + `The relationship pools campuses and periods together and is not a within-campus effect; the trajectories show each pool's own path. `
    + `Where the admission rate is high the denied group is small and the derived average coarse: `
    + (coarse.length
        ? `${coarse.length} point${coarse.length === 1 ? '' : 's'} whose worst-case rounding exceeds ${COARSE.toFixed(2)} grade points ${coarse.length === 1 ? 'is' : 'are'} drawn hollow and left out of the fit. `
        : `no point here carries a worst-case rounding above ${COARSE.toFixed(2)} grade points. `)
    + `Raising the denied threshold in Refine tightens that bound and thins the right-hand side.`;
}

/* ---- table ------------------------------------------------------------- */
let sortKey = 'y', sortDir = 1;
function table() {
  const th = $('tbl').querySelector('thead'), tb = $('tbl').querySelector('tbody');
  clear(th); clear(tb);
  const cols = [['y', 'class'], ['camp', 'pool'], ['n', 'schools'], ['poolGPA', 'applicant average'],
  ['sep', 'admitted minus denied'], ['gap', 'admitted minus applicants'], ['admitRate', 'admission rate %'],
  ['nSep', 'schools with a denied average'],
  ['spread', 'spread between schools'], ['corr', 'grades vs admission rate'], ['share', 'share above threshold %']];
  const hr = document.createElement('tr');
  for (const [k, t] of cols) {
    const h = document.createElement('th'); h.textContent = t + (sortKey === k ? (sortDir > 0 ? ' ↑' : ' ↓') : '');
    h.addEventListener('click', () => { if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = 1; } table(); });
    hr.appendChild(h);
  }
  th.appendChild(hr);
  const rows = [];
  for (const ci of S.camps) for (const r of DATA[ci]) if (r.n > 0) rows.push(Object.assign({ camp: poolLabel(ci), ci }, r));
  rows.sort((a, b) => { const v1 = a[sortKey], v2 = b[sortKey]; return typeof v1 === 'string' ? sortDir * v1.localeCompare(v2) : sortDir * ((v1 ?? -99) - (v2 ?? -99)); });
  for (const r of rows) {
    const tr = document.createElement('tr');
    for (const [k] of cols) {
      const td = document.createElement('td');
      if (k === 'y' || k === 'n' || k === 'nSep') td.textContent = r[k];
      else if (k === 'camp') { td.textContent = r.camp; td.style.color = poolColor(r.ci); }
      else if (k === 'poolGPA') td.textContent = fmt(r[k], 3);
      else if (k === 'gap' || k === 'sep') td.textContent = sgn(r[k], 3);
      else if (k === 'corr') td.textContent = sgn(r[k], 2);
      else td.textContent = fmt(r[k], k === 'spread' ? 3 : 1);
      tr.appendChild(td);
    }
    tb.appendChild(tr);
  }
}

/* ---- readout, the thirty-year arc, render ------------------------------ */
function readout() {
  const ro = $('ro'); ro.innerHTML = '';
  const ci = S.camps.includes(S.focal) ? S.focal : S.camps[0];
  if (ci === undefined) { ro.innerHTML = '<div><div class="k">no pool selected</div><div class="v">&mdash;</div><div class="n">pick at least one</div></div>'; return; }
  const s = DATA[ci], key = S.sep === 'sep' ? 'sep' : 'gap', nk = S.sep === 'sep' ? 'nSep' : 'nGap';
  const first = s.find(r => r[key] !== null), last = [...s].reverse().find(r => r[key] !== null);
  const mid = s.find(r => r.y === 2015) || {};
  const other = S.sep === 'sep' ? 'gap' : 'sep';
  const olab = S.sep === 'sep' ? 'admitted minus applicants' : 'admitted minus denied';
  const rate = r => r ? `admission rate ${fmt(r.admitRate, 0)}%` : '';
  const bnd = r => (S.sep === 'sep' && r && r.sepErr) ? ` ±${r.sepErr.toFixed(3)}` : '';
  const cells = [
    [poolLabel(ci) + ', class of ' + (first ? first.y : '—'), sgn(first ? first[key] : null, 3) + bnd(first), `${first ? first[nk] : 0} schools, ${rate(first)}`],
    [poolLabel(ci) + ', class of 2015', sgn(mid[key], 3) + bnd(mid), `${mid[nk] || 0} schools, ${rate(mid)}`],
    [poolLabel(ci) + ', class of ' + (last ? last.y : '—'), sgn(last ? last[key] : null, 3) + bnd(last), `${last ? last[nk] : 0} schools, ${rate(last)}`],
    ['change across the span', sgn((last && first) ? last[key] - first[key] : null, 3), `${first ? first.y : '—'} to ${last ? last.y : '—'}`],
    ['the other measure, ' + (last ? last.y : '—'), sgn(last ? last[other] : null, 3), olab],
    ['spread between schools', fmt(last ? last.spread : null, 3), `was ${fmt(first ? first.spread : null, 3)} in ${first ? first.y : '—'}`]
  ];
  for (const [k, v, n] of cells) {
    const d = document.createElement('div');
    d.innerHTML = `<div class="k">${k}</div><div class="v">${v}</div><div class="n">${n}</div>`;
    ro.appendChild(d);
  }
}

/* The shape of a pool's own margin, computed rather than asserted: where it
   peaked, where it stands, and whether the admission rate explains the level. */
function arcNote() {
  const box = $('arc'); box.innerHTML = '';
  const ci = S.camps.includes(S.focal) ? S.focal : S.camps[0];
  if (ci === undefined) return;
  const s = DATA[ci].filter(r => r.gap !== null);
  if (s.length < 5) return;
  let pk = s[0]; for (const r of s) if (r.gap > pk.gap) pk = r;
  const first = s[0], last = s[s.length - 1];
  const sepLast = [...DATA[ci]].reverse().find(r => r.sep !== null);
  const near = Math.abs(last.gap - first.gap) < 0.25 * Math.abs(pk.gap - first.gap);
  let t = `${poolLabel(ci)}, admitted minus applicants: ${sgn(first.gap, 3)} in the class of ${first.y}, a peak of ${sgn(pk.gap, 3)} in ${pk.y}, ${sgn(last.gap, 3)} in ${last.y}`;
  t += near ? ` — an arc across ${last.y - first.y} classes that returns to about where it started, not a collapse. ` : `. `;
  if (sepLast) {
    const coarse = sepLast.sepErr !== null && sepLast.sepErr > 0.25 * Math.abs(sepLast.sep);
    t += coarse
      ? `The separation from the denied group, which the admission rate does not scale, cannot be resolved here: at a ${fmt(sepLast.admitRateSep, 0)} percent admission rate the denied group is small enough that rounding in the two published averages moves the derived figure by as much as ${sepLast.sepErr.toFixed(2)} grade points. `
      : `The separation from the denied group, which the admission rate does not scale, reads ${sgn(sepLast.sep, 3)} in ${sepLast.y} across ${sepLast.nSep} schools, within a rounding bound of ${sepLast.sepErr.toFixed(3)}. `;
  }
  if (last.admitRate !== null && last.admitRate >= 55) {
    t += `${poolLabel(ci)} admitted ${fmt(last.admitRate, 0)} percent of its applicants in ${last.y}: at that rate the admitted group is most of the pool, so admitted minus applicants is small by arithmetic whatever the grades do. `
      + `That is the identity gap = (1 − p) × separation at work, and it is the reason the separation is drawn first.`;
  } else {
    t += `The admission rate moved from ${fmt(first.admitRate, 0)} percent in ${first.y} to ${fmt(last.admitRate, 0)} percent in ${last.y}, which scales the first measure and not the second.`;
  }
  box.textContent = t;
}

const VIEWS = {
  sep: { key: 'val', nkey: 'nVal', errkey: 'valErr', ylab: 'grade points', zero: true, fmt: v => sgn(v, 2) },
  corr: { key: 'corr', nkey: 'n', ylab: 'correlation across schools', head: 'How well a school’s grades predict its admission rate', zero: true, fmt: v => sgn(v, 2) },
  spread: { key: 'spread', nkey: 'n', ylab: 'standard deviation of pool averages', head: 'How much grades still vary between schools', zero: false, fmt: v => fmt(v, 3) }
};
const NOTES = {
  sep: 'Inside each school, the admitted group’s average minus the average of the group it turned away — or minus the applicants, if the separation measure is switched.',
  corr: 'Across schools within one class, weighted by applicants. Confounded by where each pool’s applicants come from — read it with care.',
  spread: 'The applicant-weighted standard deviation of school pool averages. A falling line means schools look more alike on grades.'
};
const SEPHELP = 'Admitted minus denied: inside one high school, one pool and one class, the admitted group’s mean recalculated grade point average minus the mean of the applicants who were not admitted. '
  + 'The denied mean is not published; it is the arithmetic remainder of the applicant mean and the admitted mean, weighted by their counts, and it is withheld where fewer than the Refine threshold of students were denied. '
  + 'Admitted minus applicants measures the same separation multiplied by the share not admitted, because the applicants include the admitted: gap = (1 − p) × separation, exactly, in every cell, where p is the admission rate. '
  + 'A pool that admits nearly everyone therefore shows a small gap whatever its grades do, which is why the admission rate accompanies every number here. '
  + 'The identity binds the two cell by cell; the two lines drawn here are averages over slightly different sets of cells, because the denied threshold withholds some that the gap can still use. '
  + 'The published averages carry two decimals, so the derived denied mean inherits a rounding error amplified by A/(A−D); the shaded band around each line is that worst-case bound.';

function render() {
  compute();
  const V = VIEWS[S.view];
  const headSep = S.sep === 'sep' ? 'The separation between admitted and denied students' : 'The distance between admitted students and applicants';
  $('h1').firstChild.nodeValue = S.view === 'sep' ? headSep : V.head;
  $('qsep').dataset.help = S.view === 'sep' ? SEPHELP : NOTES[S.view];
  $('viewnote').textContent = NOTES[S.view];
  lineChart('fig1', DATA, V.key, { ylab: V.ylab, zero: V.zero, fmt: V.fmt, nkey: V.nkey,
                                   errkey: (S.view === 'sep' && S.sep === 'sep') ? V.errkey : null, H: 420 });
  fig2(); fig3(); fig4(); readout(); arcNote(); table();
  $('s1').textContent = S.view === 'sep'
    ? (S.sep === 'sep'
      ? (S.agg === 'within'
        ? 'Averaged inside each high school first and weighted by admitted students, so the changing mix of schools cannot move the line. The denied average is derived from the published applicant and admitted averages and counts; a school enters a class only if it sends at least the applicant threshold and leaves at least the denied threshold behind.'
        : 'Every admitted student in the state pooled against every denied student. This version lets the changing mix of schools move the line; compare it with the within-school version.')
      : (S.agg === 'within'
        ? 'Averaged inside each high school first, so the changing mix of schools cannot move the line. This measure is the separation multiplied by the share not admitted, so a rising admission rate pulls it toward zero on its own.'
        : 'Every applicant in the state pooled together. This version lets the changing mix of schools move the line, and the admission rate scales it.'))
    : S.view === 'corr'
      ? 'One correlation per pool per class, across high schools, weighted by applicants. Positive means schools with higher-grading applicant pools get more of them admitted.'
      : 'The applicant-weighted standard deviation of school pool averages within each class. This is the raw material any admission reader has to work with.';
  legend1();
  $('foot').innerHTML = `Built from the University of California&rsquo;s published applicant and admitted grade point averages by high school and campus, classes ${Y0}&ndash;${Y1}; the denied averages are derived from those figures and the counts. Campus labels as repaired on 30 July 2026. Data prepared ${M.built}. <a href="methods.html">Methods and sources</a>.`;
}
function legend1() {
  const leg = $('leg1'); leg.innerHTML = '';
  for (const ci of S.camps) {
    const s = document.createElement('span');
    s.className = 'sel'; s.dataset.ci = ci;
    s.setAttribute('aria-pressed', String(ci === S.focal));
    s.innerHTML = `<span class="swatch" style="background:${poolColor(ci)}"></span>${poolLabel(ci)}`;
    s.addEventListener('click', () => { S.focal = ci; S.survcamp = ci; $('survcamp').value = String(ci); render(); });
    leg.appendChild(s);
  }
  if (S.camps.length > 1) {
    const n = document.createElement('span'); n.className = 'static';
    n.style.color = '#555555'; n.textContent = 'click a pool to make it the focus';
    leg.appendChild(n);
  }
}

/* ---- controls ---------------------------------------------------------- */
function chips() {
  const box = $('campchips'); box.innerHTML = '';
  POOLS.forEach(i => {
    const b = document.createElement('button');
    b.className = 'chip sw'; b.dataset.ci = i; b.textContent = poolLabel(i);
    b.setAttribute('aria-pressed', S.camps.includes(i));
    if (S.camps.includes(i)) b.style.background = poolColor(i), b.style.borderColor = '#000';
    b.addEventListener('click', () => {
      const k = S.camps.indexOf(i);
      if (k >= 0) S.camps.splice(k, 1); else S.camps.push(i);
      S.camps.sort((a, b2) => a - b2);
      if (!S.camps.includes(S.focal) && S.camps.length) S.focal = S.camps[0];
      chips(); render();
    });
    box.appendChild(b);
  });
}
function init() {
  const co = $('county'); clear(co);
  for (const [v, t] of [['', 'the whole state']].concat(COUNTIES.map(c => [c, c]))) { const o = document.createElement('option'); o.value = v; o.textContent = t; co.appendChild(o); }
  co.value = S.county;
  const sc = $('survcamp'); clear(sc);
  POOLS.forEach(i => { const o = document.createElement('option'); o.value = String(i); o.textContent = poolLabel(i); sc.appendChild(o); });
  sc.value = String(S.survcamp);
  $('view').value = S.view; $('sep').value = S.sep; $('upp').value = S.upp; $('gate').value = S.gate; $('agg').value = S.agg;
  $('thr').value = S.thr; $('thrv').textContent = S.thr.toFixed(2);
  for (const k of ['e0a', 'e0b', 'e1a', 'e1b', 'minr', 'sgate']) $(k).value = S[k];
  $('xscale').value = S.xscale; $('grain').value = S.grain; $('plen').value = S.plen;
  const bind = (id, key, num) => $(id).addEventListener('change', () => { S[key] = num ? +$(id).value : $(id).value; render(); });
  bind('view', 'view'); bind('sep', 'sep'); bind('county', 'county'); bind('upp', 'upp'); bind('gate', 'gate', 1); bind('agg', 'agg');
  bind('e0a', 'e0a', 1); bind('e0b', 'e0b', 1); bind('e1a', 'e1a', 1); bind('e1b', 'e1b', 1);
  bind('minr', 'minr', 1); bind('xscale', 'xscale'); bind('grain', 'grain'); bind('plen', 'plen', 1); bind('sgate', 'sgate', 1);
  $('survcamp').addEventListener('change', () => { S.survcamp = +$('survcamp').value; fig3(); });
  $('thr').addEventListener('input', () => { S.thr = +$('thr').value; $('thrv').textContent = S.thr.toFixed(2); compute(); fig2(); fig3(); table(); });
  $('allc').addEventListener('click', () => { S.camps = POOLS.slice(); chips(); render(); });
  $('nonec').addEventListener('click', () => { S.camps = []; chips(); render(); });
  $('reset').addEventListener('click', () => { Object.assign(S, DEF, { camps: DEF.camps.slice() }); init(); chips(); render(); });
  document.querySelectorAll('.q').forEach(q => {
    q.addEventListener('mouseenter', e => TIP.show(q.dataset.help, e.clientX, e.clientY));
    q.addEventListener('mouseleave', () => TIP.hide());
  });
}
init(); chips(); render();

/* test hook — the headless suite reads these rather than re-deriving them */
window.__margin = {
  S, seriesFor, compute, scatterPoints,
  survivalFor: (ci, years, T) => survival(ci, years, S.gate, T, 'app', schoolFilter()),
  get DATA() { return DATA; }, get SCAT() { return SCAT; }
};
