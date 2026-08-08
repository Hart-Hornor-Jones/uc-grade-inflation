/* Tool 4 — One school at a time. */
'use strict';
const $ = id => document.getElementById(id);
const DEF = { si: null, si2: null, ser: 'app', campmode: 'all', campone: 0, gate: 5, ach: ['censusz', 'zsat', 'apge3'] };
const S = Object.assign({}, DEF, { ach: DEF.ach.slice() });

/* ---- standardise every ruler within each class ------------------------- */
const ZFIELD = ['censusz', 'zsat', 'act', 'appass', 'apge3'];
const ZSTAT = (() => {
  const st = {};
  for (const f of ZFIELD) {
    st[f] = {};
    for (let y = RY0; y <= RY1; y++) {
      const v = [];
      for (let si = 0; si < NS; si++) { const r = rul(si, y); if (r && r[f] !== null && isFinite(r[f])) v.push(r[f]); }
      if (v.length >= 25) {
        const m = v.reduce((a, b) => a + b, 0) / v.length;
        const s = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length);
        st[f][y] = { m, s: s || 1, n: v.length };
      }
    }
  }
  return st;
})();
function zOf(si, y, f) {
  const r = rul(si, y); if (!r || r[f] === null || !isFinite(r[f])) return null;
  const s = ZSTAT[f][y]; if (!s) return null;
  return (r[f] - s.m) / s.s;
}
/* achievement-measure colors, drawn from the same Leal palette */
const ACHDEF = [
  { k: 'censusz', label: 'state test, all students', short: 'state test', col: '#009192' },
  { k: 'zsat', label: 'SAT, testers only', short: 'SAT', col: '#7A00CC' },
  { k: 'act', label: 'ACT at 21 or better', short: 'ACT 21+', col: '#8B4A00' },
  { k: 'appass', label: 'Advanced Placement pass share', short: 'AP pass share', col: '#FF8C00' },
  { k: 'apge3', label: 'Advanced Placement passes per senior', short: 'AP per senior', col: '#E6007E' }
];

/* ---- grade series for one school --------------------------------------- */
function gradeSeries(si) {
  const K = SERIES[S.ser], out = [];
  for (let ci = 0; ci < NC; ci++) {
    const pts = [];
    for (let y = Y0; y <= Y1; y++) {
      const f = fun(si, ci, y); if (!f || !f.A || f.A < S.gate) continue;
      const c = f[K.c], g = f[K.g];
      if (c && g !== null) pts.push({ y, v: g, n: c, A: f.A, D: f.D });
    }
    out.push(pts);
  }
  return out;
}
function combined(si) {
  const K = SERIES[S.ser], pts = [];
  for (let y = Y0; y <= Y1; y++) {
    let num = 0, den = 0, A = 0, Dn = 0;
    for (let ci = 0; ci < NC; ci++) {
      const f = fun(si, ci, y); if (!f || !f.A || f.A < S.gate) continue;
      const c = f[K.c], g = f[K.g];
      if (c && g !== null) { num += c * g; den += c; }
      if (f.A) A += f.A; if (f.D) Dn += f.D;
    }
    if (den > 0) pts.push({ y, v: num / den, n: den, A, D: Dn });
  }
  return pts;
}

/* ---- figure 1: grades --------------------------------------------------- */
function fig1() {
  const svg = $('fig1'); clear(svg);
  const W = 900, H = 400, mL = 60, mR = 128, mT = 16, mB = 40;
  const sets = [];
  const push = (si, dash) => {
    if (si === null) return;
    if (S.campmode === 'comb') sets.push({ ci: -1, pts: combined(si), si, dash, col: dash ? '#555555' : '#000000' });
    else if (S.campmode === 'one') sets.push({ ci: S.campone, pts: gradeSeries(si)[S.campone], si, dash, col: dash ? '#555555' : campusColor(S.campone) });
    else gradeSeries(si).forEach((pts, ci) => sets.push({ ci, pts, si, dash, col: campusColor(ci) }));
  };
  push(S.si, false); push(S.si2, true);
  const all = sets.flatMap(s => s.pts.map(p => p.v));
  if (!all.length) { el('text', { x: 300, y: 120, class: 'axlab' }, svg).textContent = 'no published grade averages for these settings'; return; }
  const lo = Math.min(...all) - .05, hi = Math.max(...all) + .05;
  const x = scale(Y0, Y1, mL, W - mR), y = scale(lo, hi, H - mB, mT);
  const g = el('g', {}, svg), ax = el('g', { class: 'ax' }, g);
  drawRegimes(g, x, mT, H - mB);
  spine(g, mL, mT, mL, H - mB);
  baseLine(g, mL, W - mR, H - mB);
  for (const t of niceTicks(lo, hi, 6)) {
    tickY(g, mL, y(t));
    el('text', { x: mL - 12, y: y(t) + 4, 'text-anchor': 'end' }, ax).textContent = t.toFixed(2);
  }
  for (let t = Math.ceil(Y0 / 5) * 5; t <= Y1; t += 5) {
    tickX(g, x(t), H - mB);
    el('text', { x: x(t), y: H - mB + 20, 'text-anchor': 'middle' }, ax).textContent = t;
  }
  el('text', { x: (mL + W - mR) / 2, y: H - 4, 'text-anchor': 'middle', class: 'axlab' }, g).textContent = 'graduating class';
  el('text', { x: 13, y: (mT + H - mB) / 2, class: 'axlab', 'text-anchor': 'middle', transform: `rotate(-90 13 ${(mT + H - mB) / 2})` }, g)
    .textContent = 'recalculated grade point average';
  const labs = [];
  for (const s of sets) {
    if (!s.pts.length) continue;
    let d = '', prev = null;
    for (const p of s.pts) { d += (prev !== null && p.y === prev + 1 ? 'L' : 'M') + x(p.y).toFixed(1) + ',' + y(p.v).toFixed(1); prev = p.y; }
    el('path', { d, fill: 'none', stroke: s.col, 'stroke-width': s.dash ? 2 : 2.6, opacity: s.dash ? .7 : 1, 'stroke-dasharray': s.dash ? '6 4' : null, class: 'series' }, g);
    if (!s.dash) labs.push({ y: y(s.pts[s.pts.length - 1].v), t: s.ci < 0 ? 'all campuses' : CAMPUS[s.ci], c: s.col });
  }
  for (const l of stackLabels(labs, 12, mT + 6, H - mB))
    el('text', { x: W - mR + 6, y: l.ly + 4, class: 'axlab', fill: l.c }, g).textContent = l.t;
  const vline = el('line', { y1: mT, y2: H - mB, stroke: '#7a838d', 'stroke-width': 1, opacity: 0 }, g);
  const cap = el('rect', { x: mL, y: mT, width: W - mR - mL, height: H - mB - mT, fill: 'transparent' }, g);
  cap.addEventListener('mousemove', e => {
    const bb = svg.getBoundingClientRect(), px = (e.clientX - bb.left) / bb.width * W;
    const yy = Math.round(Math.max(Y0, Math.min(Y1, x.inv(px))));
    vline.setAttribute('x1', x(yy)); vline.setAttribute('x2', x(yy)); vline.setAttribute('opacity', .6);
    const rows = sets.filter(s => !s.dash).map(s => ({ s, p: s.pts.find(q => q.y === yy) })).filter(o => o.p);
    if (!rows.length) { TIP.hide(); return; }
    TIP.show(`<b>class of ${yy}</b> &middot; ${SCH[S.si][1]}<br>` + rows.map(o =>
      `<span style="color:${o.s.col}">&#9632;</span> ${o.s.ci < 0 ? 'all campuses' : CAMPUS[o.s.ci]} <b>${fmt(o.p.v, 2)}</b>` +
      ` <span class="muted">${o.p.A} applicants${o.p.D !== null && o.p.D !== undefined ? ', ' + o.p.D + ' admitted' : ''}</span>`).join('<br>'), e.clientX, e.clientY);
  });
  cap.addEventListener('mouseleave', () => { vline.setAttribute('opacity', 0); TIP.hide(); });
}

/* ---- figure 2: achievement ---------------------------------------------- */
function fig2() {
  const svg = $('fig2'); clear(svg);
  const W = 900, H = 380, mL = 60, mR = 128, mT = 16, mB = 40;
  const lines = [];
  for (const a of ACHDEF) {
    if (!S.ach.includes(a.k)) continue;
    for (const [si, dash] of [[S.si, false], [S.si2, true]]) {
      if (si === null) continue;
      const pts = [];
      for (let y = RY0; y <= RY1; y++) { const z = zOf(si, y, a.k); if (z !== null) pts.push({ y, v: z, src: (rul(si, y) || {}).csrc }); }
      if (pts.length) lines.push({ a, pts, dash });
    }
  }
  if (!lines.length) { el('text', { x: 300, y: 120, class: 'axlab' }, svg).textContent = 'no achievement measures published for this school'; return; }
  const all = lines.flatMap(l => l.pts.map(p => p.v));
  const lo = Math.min(-1, Math.min(...all) - .2), hi = Math.max(1, Math.max(...all) + .2);
  const x = scale(Y0, Y1, mL, W - mR), y = scale(lo, hi, H - mB, mT);
  const g = el('g', {}, svg), ax = el('g', { class: 'ax' }, g);
  spine(g, mL, mT, mL, H - mB);
  baseLine(g, mL, W - mR, H - mB);
  for (const t of niceTicks(lo, hi, 6)) {
    tickY(g, mL, y(t));
    if (Math.abs(t) < 1e-9) baseLine(g, mL, W - mR, y(t));
    el('text', { x: mL - 12, y: y(t) + 4, 'text-anchor': 'end' }, ax).textContent = sgn(t, 1);
  }
  for (let t = Math.ceil(Y0 / 5) * 5; t <= Y1; t += 5) {
    tickX(g, x(t), H - mB);
    el('text', { x: x(t), y: H - mB + 20, 'text-anchor': 'middle' }, ax).textContent = t;
  }
  el('text', { x: (mL + W - mR) / 2, y: H - 4, 'text-anchor': 'middle', class: 'axlab' }, g).textContent = 'graduating class';
  el('text', { x: 13, y: (mT + H - mB) / 2, class: 'axlab', 'text-anchor': 'middle', transform: `rotate(-90 13 ${(mT + H - mB) / 2})` }, g)
    .textContent = 'position among California high schools, in standard deviations';
  // mark the census instrument seams
  const seams = [];
  let prevSrc = null;
  for (let yy = RY0; yy <= RY1; yy++) {
    let src = null;
    for (let si = 0; si < NS; si++) { const r = rul(si, yy); if (r && r.csrc) { src = r.csrc; break; } }
    if (src && prevSrc && src !== prevSrc) seams.push(yy);
    if (src) prevSrc = src;
  }
  let lastSeamX = -99;
  seams.forEach((sy, i) => {
    el('line', { x1: x(sy - .5), x2: x(sy - .5), y1: mT, y2: H - mB, stroke: '#000', 'stroke-width': 2, 'stroke-dasharray': '3 5' }, g);
    if (x(sy - .5) - lastSeamX > 52) {
      el('text', { x: x(sy - .5), y: mT - 4, 'text-anchor': 'middle', class: 'axlab', 'font-size': 10.5 }, g).textContent = 'new test';
      lastSeamX = x(sy - .5);
    }
  });
  const labs2 = [];
  for (const l of lines) {
    let d = '', prev = null;
    for (const p of l.pts) { d += (prev !== null && p.y === prev + 1 ? 'L' : 'M') + x(p.y).toFixed(1) + ',' + y(p.v).toFixed(1); prev = p.y; }
    el('path', { d, fill: 'none', stroke: l.a.col, 'stroke-width': l.dash ? 2 : 2.6, opacity: l.dash ? .65 : 1, 'stroke-dasharray': l.dash ? '6 4' : null, class: 'series' }, g);
    if (!l.dash) {
      for (const p of l.pts) el('circle', { cx: x(p.y), cy: y(p.v), r: 2.8, fill: l.a.col }, g);
      labs2.push({ y: y(l.pts[l.pts.length - 1].v), t: l.a.short, c: l.a.col });
    }
  }
  for (const l of stackLabels(labs2, 13, mT + 6, H - mB))
    el('text', { x: W - mR + 6, y: l.ly + 4, class: 'axlab', fill: l.c }, g).textContent = l.t;
  const vline = el('line', { y1: mT, y2: H - mB, stroke: '#7a838d', 'stroke-width': 1, opacity: 0 }, g);
  const cap = el('rect', { x: mL, y: mT, width: W - mR - mL, height: H - mB - mT, fill: 'transparent' }, g);
  const INAME = { 1: 'exit examination', 2: 'eleventh-grade standards test', 3: 'current state assessment' };
  cap.addEventListener('mousemove', e => {
    const bb = svg.getBoundingClientRect(), px = (e.clientX - bb.left) / bb.width * W;
    const yy = Math.round(Math.max(Y0, Math.min(Y1, x.inv(px))));
    vline.setAttribute('x1', x(yy)); vline.setAttribute('x2', x(yy)); vline.setAttribute('opacity', .6);
    const rows = lines.filter(l => !l.dash).map(l => ({ l, p: l.pts.find(q => q.y === yy) })).filter(o => o.p);
    if (!rows.length) { TIP.hide(); return; }
    TIP.show(`<b>class of ${yy}</b><br>` + rows.map(o =>
      `<span style="color:${o.l.a.col}">&#9632;</span> ${o.l.a.label} <b>${sgn(o.p.v, 2)}</b>` +
      (o.l.a.k === 'censusz' && o.p.src ? ` <span class="muted">${INAME[o.p.src]}</span>` : '')).join('<br>'), e.clientX, e.clientY);
  });
  cap.addEventListener('mouseleave', () => { vline.setAttribute('opacity', 0); TIP.hide(); });
}

/* ---- figure 3: this school in the statewide cloud ----------------------- */
const PRE = [2016, 2017, 2018, 2019], POST = [2023, 2024, 2025];
function fig3() {
  const svg = $('fig3'); clear(svg);
  const W = 900, H = 360, mL = 62, mR = 26, mT = 18, mB = 46;
  const P = buildPanel({ ci: 0, pre: PRE, post: POST, ruler: 'census', gate: 20, ser: 'app', betaMode: 'pre' });
  if (!P.rows.length) return;
  const w = P.rows.map(r => r.w);
  const xs = P.rows.map(r => r.dC), ys = P.rows.map(r => r.dG);
  const xlo = wquant(xs, w, .005), xhi = wquant(xs, w, .995), ylo = wquant(ys, w, .005), yhi = wquant(ys, w, .995);
  const x = scale(xlo, xhi, mL, W - mR), y = scale(ylo, yhi, H - mB, mT);
  const g = el('g', {}, svg), ax = el('g', { class: 'ax' }, g);
  spine(g, mL, mT, mL, H - mB);
  baseLine(g, mL, W - mR, H - mB);
  for (const t of niceTicks(xlo, xhi, 6)) {
    tickX(g, x(t), H - mB);
    if (Math.abs(t) < 1e-9) el('line', { x1: x(t), x2: x(t), y1: mT, y2: H - mB, stroke: '#000', 'stroke-width': 2 }, g);
    el('text', { x: x(t), y: H - mB + 20, 'text-anchor': 'middle' }, ax).textContent = sgn(t, 0);
  }
  for (const t of niceTicks(ylo, yhi, 5)) {
    tickY(g, mL, y(t));
    if (Math.abs(t) < 1e-9) baseLine(g, mL, W - mR, y(t));
    el('text', { x: mL - 12, y: y(t) + 4, 'text-anchor': 'end' }, ax).textContent = sgn(t, 2);
  }
  el('text', { x: (mL + W - mR) / 2, y: H - 4, 'text-anchor': 'middle', class: 'axlab' }, g).textContent = 'change in the state test, percentage points';
  el('text', { x: 13, y: (mT + H - mB) / 2, class: 'axlab', 'text-anchor': 'middle', transform: `rotate(-90 13 ${(mT + H - mB) / 2})` }, g).textContent = 'change in Berkeley-applicant grade average';
  for (const r of P.rows) {
    if (r.dC < xlo || r.dC > xhi || r.dG < ylo || r.dG > yhi) continue;
    const me = r.si === S.si, me2 = r.si === S.si2;
    el('circle', { cx: x(r.dC), cy: y(r.dG), r: me ? 8 : me2 ? 6.5 : 2.6, fill: me ? '#FB0207' : me2 ? '#0000FF' : '#555555', opacity: (me || me2) ? 1 : .22, stroke: (me || me2) ? '#000' : 'none', 'stroke-width': 2.2 }, g);
    if (me || me2) el('text', { x: x(r.dC), y: y(r.dG) - 14, 'text-anchor': 'middle', class: 'axlab' }, g).textContent = SCH[r.si][1];
  }
  const mine = P.rows.find(r => r.si === S.si);
  const iw = P.rows.map(r => r.w), iv = P.rows.map(r => r.I);
  let pct = null;
  if (mine) { let below = 0, tot = 0; for (let i = 0; i < iv.length; i++) { tot += iw[i]; if (iv[i] < mine.I) below += iw[i]; } pct = 100 * below / tot; }
  $('s3').innerHTML = mine
    ? `Classes of 2016&ndash;2019 against 2023&ndash;2025, Berkeley applicants, at the ${P.rows.length.toLocaleString()} schools with enough of them. `
    + `<b>${SCH[S.si][1]}</b> sits at ${sgn(mine.dG, 3)} on grades against ${sgn(mine.dC, 1)} on the state test &mdash; an estimate of ${sgn(mine.I, 3)}, higher than ${fmt(pct, 0)} percent of California schools.`
    : `Classes of 2016&ndash;2019 against 2023&ndash;2025, Berkeley applicants. This school does not send enough Berkeley applicants in both periods to appear.`;
}

/* ---- table -------------------------------------------------------------- */
function table() {
  const th = $('tbl').querySelector('thead'), tb = $('tbl').querySelector('tbody');
  clear(th); clear(tb);
  const cols = ['class', 'applicants', 'admitted', 'applicant average', 'admitted average', 'state test', 'SAT position', 'AP passes per senior'];
  const hr = document.createElement('tr');
  for (const c of cols) { const h = document.createElement('th'); h.textContent = c; hr.appendChild(h); }
  th.appendChild(hr);
  for (let y = Y0; y <= Y1; y++) {
    let A = 0, Dn = 0, na = 0, da = 0, nd = 0, dd = 0;
    for (let ci = 0; ci < NC; ci++) {
      const f = fun(S.si, ci, y); if (!f) continue;
      if (f.A) A += f.A; if (f.D) Dn += f.D;
      if (f.A && f.ag !== null) { na += f.A * f.ag; da += f.A; }
      if (f.D && f.dg !== null) { nd += f.D * f.dg; dd += f.D; }
    }
    const r = rul(S.si, y) || {};
    if (!A && r.census === undefined) continue;
    const tr = document.createElement('tr');
    const vals = [y, A || '—', Dn || '—', da ? fmt(na / da, 3) : '—', dd ? fmt(nd / dd, 3) : '—',
      r.census !== null && r.census !== undefined ? fmt(r.census, 1) : '—',
      (() => { const z = zOf(S.si, y, 'zsat'); return z === null ? '—' : sgn(z, 2); })(),
      r.apge3 !== null && r.apge3 !== undefined ? fmt(r.apge3, 2) : '—'];
    for (const v of vals) { const td = document.createElement('td'); td.textContent = v; tr.appendChild(td); }
    tb.appendChild(tr);
  }
}

/* ---- readout ------------------------------------------------------------ */
function readout() {
  const ro = $('ro'); ro.innerHTML = '';
  const t = TRAIT[S.si], s = SCH[S.si];
  const comb = combined(S.si);
  const first = comb[0], last = comb[comb.length - 1];
  const cells = [
    ['school', s[1], `${s[2]}, ${s[3]} County · code ${s[0]}`],
    ['applicants to the University', t.apps.toLocaleString(), `across classes ${t.first}–${t.last}`],
    [`grade average, class of ${first ? first.y : '—'}`, first ? fmt(first.v, 3) : '—', first ? `${first.A} applicants` : ''],
    [`grade average, class of ${last ? last.y : '—'}`, last ? fmt(last.v, 3) : '—', last ? `${last.A} applicants` : ''],
    ['change across the record', (first && last) ? sgn(last.v - first.v, 3) : '—', 'all campuses combined, no adjustment']
  ];
  for (const [k, v, n] of cells) {
    const d = document.createElement('div');
    d.innerHTML = `<div class="k">${k}</div><div class="v" style="font-size:${String(v).length > 22 ? 14 : String(v).length > 14 ? 16 : 21}px">${v}</div><div class="n">${n}</div>`;
    ro.appendChild(d);
  }
  $('schnote').textContent = `${t.apps.toLocaleString()} applicants to the University over ${t.last - t.first + 1} classes.`
    + (t.upp !== null ? ` High-need pupils: ${fmt(t.upp, 0)} percent.` : '');
}

/* ---- lists and controls -------------------------------------------------- */
const ORDER = [...Array(NS).keys()].sort((a, b) => TRAIT[b].apps - TRAIT[a].apps);
function fillList(sel, q, cur, allowNone) {
  clear(sel);
  if (allowNone) { const o = document.createElement('option'); o.value = ''; o.textContent = '— none —'; sel.appendChild(o); }
  const ql = (q || '').trim().toLowerCase();
  let n = 0;
  for (const si of ORDER) {
    const s = SCH[si];
    if (ql && !((s[1] + ' ' + s[2] + ' ' + s[3]).toLowerCase().includes(ql))) continue;
    const o = document.createElement('option'); o.value = si; o.textContent = `${s[1]} — ${s[2]}`;
    sel.appendChild(o); n++;
    if (n > 4000) break;
  }
  if (cur !== null && [...sel.options].some(o => o.value === String(cur))) sel.value = String(cur);
  else if (sel.options.length) { sel.selectedIndex = allowNone ? 0 : 0; }
  return n;
}
function serChips() {
  const box = $('serchips'); box.innerHTML = '';
  for (const [k, lab] of [['app', 'applicants'], ['adm', 'admitted'], ['enr', 'enrolled']]) {
    const b = document.createElement('button'); b.className = 'chip'; b.textContent = lab;
    b.setAttribute('aria-pressed', S.ser === k);
    b.addEventListener('click', () => { S.ser = k; serChips(); render(); });
    box.appendChild(b);
  }
}
function achChips() {
  const box = $('achchips'); box.innerHTML = '';
  for (const a of ACHDEF) {
    const b = document.createElement('button'); b.className = 'chip'; b.textContent = a.label;
    const on = S.ach.includes(a.k);
    b.setAttribute('aria-pressed', on);
    if (on) { b.style.background = a.col; b.style.borderColor = a.col; b.style.color = '#fff'; }
    b.addEventListener('click', () => {
      const i = S.ach.indexOf(a.k); if (i >= 0) S.ach.splice(i, 1); else S.ach.push(a.k);
      achChips(); render();
    });
    box.appendChild(b);
  }
}
function render() {
  readout(); fig1(); fig2(); fig3(); table();
  $('h1').textContent = 'Grades submitted to the University';
  $('s1').textContent = S.campmode === 'all'
    ? `One line per campus: the mean recalculated grade point average of this school's ${SERIES[S.ser].label} to that campus. The lines separate because the campuses draw on different depths of the class.`
    : S.campmode === 'comb'
      ? `Every campus combined, weighted by the number of ${SERIES[S.ser].label}.`
      : `${CAMPUS[S.campone]} only.`;
  $('s2').textContent = 'Each measure is the school’s standing among California high schools in that graduating class. A flat line means the school held its place, whatever happened to statewide scores.';
  const l1 = $('leg1'); l1.innerHTML = '';
  if (S.campmode === 'all') CAMPUS.forEach((c, i) => { const s = document.createElement('span'); s.innerHTML = `<span class="swatch" style="background:${campusColor(i)}"></span>${c}`; l1.appendChild(s); });
  if (S.si2 !== null) { const s = document.createElement('span'); s.innerHTML = `<span class="swatch" style="background:#7a838d"></span>dashed: ${SCH[S.si2][1]}`; l1.appendChild(s); }
  const l2 = $('leg2'); l2.innerHTML = '';
  for (const a of ACHDEF) if (S.ach.includes(a.k)) { const s = document.createElement('span'); s.innerHTML = `<span class="swatch" style="background:${a.col}"></span>${a.label}`; l2.appendChild(s); }
  $('foot').innerHTML = `Grades: University of California published applicant, admitted and enrolled grade point averages by high school and campus, classes ${Y0}&ndash;${Y1}, campus labels as repaired on 30 July 2026. Tests: California Department of Education school files. Data prepared ${M.built}. <a href="methods.html">Methods and sources</a>.`;
}
function init() {
  S.si = ORDER[0];
  fillList($('school'), '', S.si, false);
  fillList($('school2'), '', null, true);
  const co = $('campone'); clear(co);
  CAMPUS.forEach((c, i) => { const o = document.createElement('option'); o.value = i; o.textContent = c; co.appendChild(o); });
  co.value = S.campone; $('campmode').value = S.campmode; $('gate').value = S.gate;
  $('school').addEventListener('change', () => { S.si = +$('school').value; render(); });
  $('school2').addEventListener('change', () => { S.si2 = $('school2').value === '' ? null : +$('school2').value; render(); });
  $('search').addEventListener('input', () => { fillList($('school'), $('search').value, S.si, false); if ($('school').value !== '') { S.si = +$('school').value; render(); } });
  $('search2').addEventListener('input', () => { fillList($('school2'), $('search2').value, S.si2, true); });
  $('campmode').addEventListener('change', () => { S.campmode = $('campmode').value; $('campone').style.display = S.campmode === 'one' ? 'block' : 'none'; render(); });
  $('campone').addEventListener('change', () => { S.campone = +$('campone').value; render(); });
  $('gate').addEventListener('change', () => { S.gate = +$('gate').value; render(); });
  $('reset').addEventListener('click', () => {
    Object.assign(S, DEF, { ach: DEF.ach.slice() }); S.si = ORDER[0];
    $('search').value = ''; $('search2').value = '';
    init(); serChips(); achChips(); render();
  });
  document.querySelectorAll('.q').forEach(q => {
    q.addEventListener('mouseenter', e => TIP.show(q.dataset.help, e.clientX, e.clientY));
    q.addEventListener('mouseleave', () => TIP.hide());
  });
}
init(); serChips(); achChips(); render();

/* Deep-link target. Every dot and row elsewhere on the site opens a school here. */
window.__card = {
  load(si) {
    if (si === null || si === undefined || si < 0 || si >= NS) return false;
    S.si = si; S.si2 = null;
    $('search').value = ''; $('search2').value = '';
    fillList($('school'), '', si, false);
    $('school').value = String(si);
    fillList($('school2'), '', null, true);
    render();
    return true;
  },
  current: () => S.si
};
