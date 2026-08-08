/* Tab 4 — The shrinking top third.
   Reads window.GIB (data_bands.js): the University's own thirds of each entering
   freshman class, their boundaries, and how the students inside them graduated.
   Everything here is a count divided by a count; no estimation, no anchoring. */
'use strict';

const $ = id => document.getElementById(id);

const BM = GIB.meta;
const BYEARS = BM.years, BCAMP = BM.campuses, BEDGE = GIB.edges;
const NBY = BYEARS.length, TOPGPA = 4.00;
const MATURE = { 4: BM.mature['4'], 5: BM.mature['5'], 6: BM.mature['6'] };

/* Band colors. Three distinct hues from the house palette, deliberately NOT the
   red and blue that tab 1 reserves for above and below its reference line. */
const TCOL = ['#7A00CC', '#FF8C00', '#118040'];   // bottom, middle, top
const TNAME = BM.tiers;                            // 'bottom third', ...

const DEF = { yr: 2021, ghost: true, camp: 0, h: 4, split: '', gA: '', gB: '' };
const S = Object.assign({}, DEF);
let timer = null;

/* ---- data access ------------------------------------------------------- */
function cube() { return S.split && S.gA ? GIB.grp[S.gA] : GIB.tot; }
function cellOf(cubeRef, ci, y, t) {
  const b = BYEARS.indexOf(y); if (b < 0) return null;
  const c = cubeRef[ci] && cubeRef[ci][b] ? cubeRef[ci][b][t] : null;
  return c || null;
}
/** Cumulative graduation rate in percent at horizon h, or null if not observed. */
function rate(c, h) {
  if (!c || !c[0]) return null;
  const k = h === 4 ? c[1] : (h === 5 ? c[2] : c[3]);
  return (k === null || k === undefined) ? null : 100 * k / c[0];
}
function mature(y, h) { return y <= MATURE[h]; }
function groupsOf(key) {
  const s = BM.splits.find(x => x.key === key);
  return s ? s.groups : [];
}
function glabel(k) {
  for (const s of BM.splits) for (const g of s.groups) if (g.key === k) return g.label;
  return k;
}
/** The series drawn in figure 2: one per band, doubled when two groups compare. */
function series() {
  const out = [];
  const push = (cubeRef, dash, tag) => {
    for (let t = 0; t < 3; t++) {
      const pts = [];
      for (const y of BYEARS) {
        if (!mature(y, S.h)) continue;
        const c = cellOf(cubeRef, S.camp, y, t);
        const v = rate(c, S.h);
        if (v === null) continue;
        pts.push({ y, v, n: c[0] });
      }
      if (pts.length) out.push({ t, dash, tag, pts, label: TNAME[t] + (tag ? ' · ' + tag : '') });
    }
  };
  if (S.split && S.gA && S.gB) { push(GIB.grp[S.gA], false, glabel(S.gA)); push(GIB.grp[S.gB], true, glabel(S.gB)); }
  else push(cube(), false, S.split && S.gA ? glabel(S.gA) : '');
  return out;
}

/* ---- controls ---------------------------------------------------------- */
function opts(sel, list, val) {
  clear(sel);
  for (const [v, t] of list) { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); }
  if (val !== undefined && val !== null) sel.value = val;
}
function fillGroupSelects() {
  const gs = groupsOf(S.split).map(g => [g.key, g.label]);
  const dis = !S.split;
  opts($('gA'), dis ? [['', '—']] : gs, dis ? '' : S.gA);
  opts($('gB'), dis ? [['', '—']] : gs, dis ? '' : S.gB);
  $('gA').disabled = dis; $('gB').disabled = dis;
}
function initControls() {
  opts($('camp'), BCAMP.map((c, i) => [i, i === 0 ? 'all campuses' : c]), S.camp);
  opts($('cmpsplit'), [['', 'do not split — everyone']].concat(BM.splits.map(s => [s.key, s.label])), S.split);
  fillGroupSelects();
  $('yr').value = S.yr;
  $('ghost').setAttribute('aria-pressed', String(S.ghost));
  for (const b of $('hz').querySelectorAll('.chip')) b.setAttribute('aria-pressed', String(+b.dataset.h === S.h));

  $('yr').addEventListener('input', () => { S.yr = +$('yr').value; stop(); render(); });
  $('camp').addEventListener('change', () => { S.camp = +$('camp').value; render(); });
  $('ghost').addEventListener('click', () => { S.ghost = !S.ghost; $('ghost').setAttribute('aria-pressed', String(S.ghost)); render(); });
  $('play').addEventListener('click', () => timer ? stop() : play());
  for (const b of $('hz').querySelectorAll('.chip'))
    b.addEventListener('click', () => { S.h = +b.dataset.h; for (const o of $('hz').querySelectorAll('.chip')) o.setAttribute('aria-pressed', String(o === b)); render(); });
  $('cmpsplit').addEventListener('change', () => {
    S.split = $('cmpsplit').value;
    const gs = groupsOf(S.split);
    S.gA = gs.length ? gs[0].key : ''; S.gB = gs.length > 1 ? gs[1].key : '';
    fillGroupSelects(); render();
  });
  $('gA').addEventListener('change', () => { S.gA = $('gA').value; render(); });
  $('gB').addEventListener('change', () => { S.gB = $('gB').value; render(); });
  $('reset').addEventListener('click', () => { stop(); Object.assign(S, DEF); initControls(); render(); });

  document.querySelectorAll('.q').forEach(q => {
    q.addEventListener('mouseenter', e => TIP.show(q.dataset.help, e.clientX, e.clientY));
    q.addEventListener('mouseleave', () => TIP.hide());
  });
}
function stop() { if (timer) { clearInterval(timer); timer = null; } $('play').textContent = 'Run 2010 to 2021'; }
function play() {
  S.yr = BYEARS[0]; $('yr').value = S.yr; render();
  $('play').textContent = 'Stop';
  timer = setInterval(() => {
    const i = BYEARS.indexOf(S.yr);
    if (i >= NBY - 1) { stop(); return; }
    S.yr = BYEARS[i + 1]; $('yr').value = S.yr; render();
  }, 420);
}

/* ---- figure 1: the boundaries ------------------------------------------ */
const X0 = 3.30;
function fig1() {
  const svg = $('fig1'); clear(svg);
  const W = 900, H = 250, mL = 64, mR = 44, yTop = 84, hB = 44, base = 178;
  const g = el('g', {}, svg), ax = el('g', { class: 'ax' }, g);
  const x = scale(X0, TOPGPA, mL, W - mR);
  const b = BYEARS.indexOf(S.yr), E = BEDGE[b], E0 = BEDGE[0];

  /* the trail: every top cut up to the chosen year, so the movement leaves a track */
  for (let k = 0; k <= b; k++) {
    el('line', { x1: x(BEDGE[k][2]), x2: x(BEDGE[k][2]), y1: yTop + hB + 6, y2: yTop + hB + 16, stroke: TCOL[2], 'stroke-width': 2.2, opacity: k === b ? 1 : 0.18 + 0.5 * k / Math.max(1, b) }, g);
  }

  /* the three bands */
  const spans = [[mL, x(E[1])], [x(E[1]), x(E[2])], [x(E[2]), x(TOPGPA)]];
  const cells = [0, 1, 2].map(t => cellOf(GIB.tot, S.camp, S.yr, t));
  spans.forEach((sp, t) => {
    const w = Math.max(1.5, sp[1] - sp[0]);
    el('rect', { x: sp[0], y: yTop, width: w, height: hB, fill: TCOL[t], stroke: '#000', 'stroke-width': 2.5 }, g);
    // the band name sits INSIDE its own band, so nothing above the bar can collide
    // with it; ink color is whichever of black or white reads on that fill
    el('text', {
      x: (sp[0] + sp[1]) / 2, y: yTop + hB / 2 + 4, 'text-anchor': 'middle',
      class: 'axlab', fill: t === 1 ? '#000' : '#FFFFFF'
    }, g).textContent = TNAME[t];
    const n = cells[t] ? cells[t][0] : null;
    const span = t === 0 ? null : (t === 1 ? E[2] - E[1] : TOPGPA - E[2]);
    const hit = el('rect', { x: sp[0], y: yTop, width: w, height: hB, fill: 'transparent' }, g);
    hit.addEventListener('mousemove', e => TIP.show(
      `<b>${TNAME[t]}, entering ${S.yr}</b><br>` +
      (t === 0 ? `${E[0].toFixed(2)} to below ${E[1].toFixed(2)}` :
        t === 1 ? `${E[1].toFixed(2)} to below ${E[2].toFixed(2)}` : `${E[2].toFixed(2)} to 4.00`) +
      (span === null ? '' : `<br>width <b>${span.toFixed(2)}</b> of a grade point`) +
      (n === null ? '' : `<br>${n.toLocaleString()} entering students at ${S.camp === 0 ? 'all campuses' : BCAMP[S.camp]}`) +
      `<br><span class="muted">count is the Pell split summed &mdash; a lower bound</span>`,
      e.clientX, e.clientY));
    hit.addEventListener('mouseleave', () => TIP.hide());
  });

  /* the bottom band runs off the left edge; say where it really ends */
  el('path', { d: `M${mL + 13},${yTop + hB / 2 - 8}L${mL + 3},${yTop + hB / 2}L${mL + 13},${yTop + hB / 2 + 8}`, fill: 'none', stroke: '#FFFFFF', 'stroke-width': 2.6 }, g);
  el('text', { x: mL, y: yTop - 21, class: 'axlab', 'text-anchor': 'start' }, g)
    .textContent = `◀ down to ${E[0].toFixed(2)}`;
  /* what the small marks under the bar are */
  el('text', { x: mL, y: yTop + hB + 19, 'text-anchor': 'start', class: 'axlab', fill: '#555555' }, g)
    .textContent = 'small marks: the top cut in every earlier class';

  /* the two cut points, called out */
  [1, 2].forEach(k => {
    el('line', { x1: x(E[k]), x2: x(E[k]), y1: yTop - 4, y2: yTop + hB + 26, stroke: '#000', 'stroke-width': 2.6 }, g);
    el('text', { x: x(E[k]), y: yTop + hB + 44, 'text-anchor': 'middle', class: 'axlab' }, g)
      .textContent = E[k].toFixed(2);
  });

  /* where the same two cuts sat in 2010 */
  if (S.ghost && S.yr !== BYEARS[0]) {
    [1, 2].forEach(k => {
      // a caliper mark straddling the top edge: it marks the position without
      // running through the band name centered inside the bar
      el('line', { x1: x(E0[k]), x2: x(E0[k]), y1: yTop - 15, y2: yTop + 11, stroke: '#000', 'stroke-width': 2, 'stroke-dasharray': '5 4' }, g);
    });
    el('text', { x: (x(E0[1]) + x(E0[2])) / 2, y: yTop - 21, 'text-anchor': 'middle', class: 'axlab' }, g)
      .textContent = 'dashed: where 2010 cut';
  }

  /* axis */
  baseLine(g, mL, W - mR, base);
  for (let t = X0; t <= TOPGPA + 1e-9; t += 0.10) {
    const v = +t.toFixed(2);
    tickX(g, x(v), base);
    el('text', { x: x(v), y: base + 21, 'text-anchor': 'middle' }, ax).textContent = v.toFixed(2);
  }
  el('text', { x: (mL + W - mR) / 2, y: H - 6, 'text-anchor': 'middle', class: 'axlab' }, g)
    .textContent = 'recalculated grade point average at entry';
}

function fig1b() {
  const svg = $('fig1b'); clear(svg);
  const W = 430, H = 210, mL = 46, mR = 18, mT = 16, mB = 40;
  const g = el('g', {}, svg), ax = el('g', { class: 'ax' }, g);
  const wid = BYEARS.map((y, i) => TOPGPA - BEDGE[i][2]);
  const x = scale(BYEARS[0], BYEARS[NBY - 1], mL, W - mR);
  const y = scale(0, Math.max(...wid) * 1.15, H - mB, mT);
  spine(g, mL, mT, mL, H - mB);
  baseLine(g, mL, W - mR, H - mB);
  for (const t of niceTicks(0, Math.max(...wid) * 1.15, 4)) {
    tickY(g, mL, y(t));
    el('text', { x: mL - 10, y: y(t) + 4, 'text-anchor': 'end' }, ax).textContent = t.toFixed(2);
  }
  for (const t of [2010, 2013, 2016, 2019, 2021]) {
    tickX(g, x(t), H - mB);
    el('text', { x: x(t), y: H - mB + 20, 'text-anchor': 'middle' }, ax).textContent = t;
  }
  el('path', { d: 'M' + BYEARS.map((yy, i) => `${x(yy).toFixed(1)},${y(wid[i]).toFixed(1)}`).join('L'), fill: 'none', stroke: TCOL[2], 'stroke-width': 2.8 }, g);
  BYEARS.forEach((yy, i) => {
    const cur = yy === S.yr;
    el('circle', { class: 'widthdot', cx: x(yy), cy: y(wid[i]), r: cur ? 6 : 3.4, fill: cur ? '#000' : TCOL[2], stroke: cur ? '#000' : 'none', 'stroke-width': 2 }, g);
  });
  const i0 = 0, i1 = NBY - 1;
  el('text', { x: mL + 6, y: mT + 12, class: 'axlab' }, g)
    .textContent = `${wid[i0].toFixed(2)} in ${BYEARS[i0]} → ${wid[i1].toFixed(2)} in ${BYEARS[i1]}`;
  el('text', { x: (mL + W - mR) / 2, y: H - 6, 'text-anchor': 'middle', class: 'axlab' }, g)
    .textContent = 'entering class';
}

/* ---- figure 2: what the thirds predict --------------------------------- */
function fig2() {
  const svg = $('fig2'); clear(svg);
  const W = 900, H = 430, mL = 62, mR = 168, mT = 20, mB = 46;
  const g = el('g', {}, svg), ax = el('g', { class: 'ax' }, g);
  const SS = series();
  const vals = SS.flatMap(s => s.pts.map(p => p.v));
  if (!vals.length) return;
  const lo = Math.max(0, Math.min(...vals) - 4), hi = Math.min(100, Math.max(...vals) + 4);
  const x = scale(BYEARS[0], BYEARS[NBY - 1], mL, W - mR), y = scale(lo, hi, H - mB, mT);
  spine(g, mL, mT, mL, H - mB);
  baseLine(g, mL, W - mR, H - mB);
  for (const t of niceTicks(lo, hi, 6)) {
    tickY(g, mL, y(t));
    el('text', { x: mL - 12, y: y(t) + 4, 'text-anchor': 'end' }, ax).textContent = t.toFixed(0);
  }
  for (const t of BYEARS) {
    tickX(g, x(t), H - mB, t % 2 === 1);
    if (t % 2 === 0) el('text', { x: x(t), y: H - mB + 21, 'text-anchor': 'middle' }, ax).textContent = t;
  }
  el('text', { x: (mL + W - mR) / 2, y: H - 6, 'text-anchor': 'middle', class: 'axlab' }, g)
    .textContent = 'entering class';
  el('text', { x: 14, y: (mT + H - mB) / 2, class: 'axlab', transform: `rotate(-90 14 ${(mT + H - mB) / 2})`, 'text-anchor': 'middle' }, g)
    .textContent = `graduated within ${S.h} years (%)`;

  /* the year the boundary figure is showing */
  el('line', { class: 'yearrule', x1: x(S.yr), x2: x(S.yr), y1: mT, y2: H - mB, stroke: '#000', 'stroke-width': 1.6, 'stroke-dasharray': '4 4', opacity: .55 }, g);

  const labs = [];
  for (const s of SS) {
    el('path', {
      class: 'series', d: 'M' + s.pts.map(p => `${x(p.y).toFixed(1)},${y(p.v).toFixed(1)}`).join('L'),
      fill: 'none', stroke: TCOL[s.t], 'stroke-width': 2.8,
      'stroke-dasharray': s.dash ? '7 5' : null
    }, g);
    for (const p of s.pts)
      el('circle', { class: 'pt', cx: x(p.y), cy: y(p.v), r: 3.6, fill: s.dash ? '#fff' : TCOL[s.t], stroke: TCOL[s.t], 'stroke-width': 2 }, g);
    const last = s.pts[s.pts.length - 1];
    labs.push({ y: y(last.v), t: s.label, c: TCOL[s.t] });
  }
  for (const l of stackLabels(labs, 13, mT + 6, H - mB))
    el('text', { x: W - mR + 8, y: l.ly + 4, class: 'axlab', fill: l.c }, g).textContent = l.t;

  /* hover column: every series at one entering class, with cohort counts */
  const hov = el('g', {}, g);
  const vline = el('line', { y1: mT, y2: H - mB, stroke: '#555555', 'stroke-width': 1, opacity: 0 }, hov);
  const cap = el('rect', { x: mL, y: mT, width: W - mR - mL, height: H - mB - mT, fill: 'transparent' }, hov);
  cap.addEventListener('mousemove', e => {
    const bb = svg.getBoundingClientRect(), px = (e.clientX - bb.left) / bb.width * W;
    const yy = Math.round(Math.max(BYEARS[0], Math.min(BYEARS[NBY - 1], x.inv(px))));
    vline.setAttribute('x1', x(yy)); vline.setAttribute('x2', x(yy)); vline.setAttribute('opacity', .6);
    const lines = SS.map(s => {
      const p = s.pts.find(q => q.y === yy);
      return p ? `<span style="color:${TCOL[s.t]}">&#9632;</span> ${s.label} <b>${p.v.toFixed(1)}%</b> <span class="muted">${p.n.toLocaleString()} entered</span>` : null;
    }).filter(Boolean);
    TIP.show(`<b>entering class of ${yy}</b><br>` + (lines.length ? lines.join('<br>') :
      `<span class="muted">${{ 4: 'four', 5: 'five', 6: 'six' }[S.h]}-year rates are not yet observed for this class</span>`) +
      (yy >= 2020 ? '<br><span class="muted">this class met the pandemic while enrolled</span>' : ''),
      e.clientX, e.clientY);
  });
  cap.addEventListener('mouseleave', () => { vline.setAttribute('opacity', 0); TIP.hide(); });
}

/* ---- readout, legends, table, captions --------------------------------- */
function gapAt(y, h) {
  const c0 = cellOf(cube(), S.camp, y, 0), c2 = cellOf(cube(), S.camp, y, 2);
  const a = rate(c0, h), b = rate(c2, h);
  return (a === null || b === null) ? null : b - a;
}
function readout() {
  const ro = $('ro'); ro.innerHTML = '';
  const b = BYEARS.indexOf(S.yr), E = BEDGE[b], E0 = BEDGE[0];
  const wid = TOPGPA - E[2], wid0 = TOPGPA - E0[2];
  const c0 = cellOf(cube(), S.camp, S.yr, 0), c2 = cellOf(cube(), S.camp, S.yr, 2);
  const r0 = rate(c0, S.h), r2 = rate(c2, S.h), gp = gapAt(S.yr, S.h);
  const other = S.h === 4 ? 6 : 4;
  const word = { 4: 'four', 5: 'five', 6: 'six' };
  const gOther = gapAt(S.yr, other);
  const where = S.camp === 0 ? 'all campuses' : BCAMP[S.camp];
  const who = S.split && S.gA ? glabel(S.gA) : 'everyone';
  const cells = [
    ['top-third boundary', E[2].toFixed(2), `entering class of ${S.yr} · was ${E0[2].toFixed(2)} in ${BYEARS[0]}`],
    ['width of the top third', wid.toFixed(2), `of a grade point · was ${wid0.toFixed(2)} in ${BYEARS[0]}`],
    [`bottom third, ${S.h} years`, r0 === null ? '—' : r0.toFixed(1) + '%',
      c0 ? `${c0[0].toLocaleString()} entered · ${where} · ${who}` : 'not yet observed for this class'],
    [`top third, ${S.h} years`, r2 === null ? '—' : r2.toFixed(1) + '%',
      c2 ? `${c2[0].toLocaleString()} entered · ${where} · ${who}` : 'not yet observed for this class'],
    ['top minus bottom', gp === null ? '—' : (gp >= 0 ? '+' : '') + gp.toFixed(1),
      gp === null ? `${word[S.h]}-year rates are not yet observed for this class`
        : (gOther === null ? `points · ${word[other]}-year rates are not yet observed for this class`
          : `points · ${(gOther >= 0 ? '+' : '') + gOther.toFixed(1)} at ${word[other]} years`)]
  ];
  for (const [k, v, n] of cells) {
    const d = document.createElement('div');
    d.innerHTML = `<div class="k">${k}</div><div class="v">${v}</div><div class="n">${n}</div>`;
    ro.appendChild(d);
  }
}
function legends() {
  const l1 = $('leg1'); l1.innerHTML = TNAME.map((t, i) =>
    `<span><span class="swatch" style="background:${TCOL[i]};border:2px solid #000"></span>${t} of the entering class</span>`).join('');
  const l2 = $('leg2');
  l2.innerHTML = TNAME.map((t, i) =>
    `<span><span class="swatch" style="background:${TCOL[i]};border:2px solid #000"></span>${t}</span>`).join('')
    + (S.split && S.gA && S.gB
      ? `<span>solid: ${glabel(S.gA)}</span><span>dashed: ${glabel(S.gB)}</span>` : '');
}
let sortDir = 1;
function table() {
  const th = $('tbl').querySelector('thead'), tb = $('tbl').querySelector('tbody');
  clear(th); clear(tb);
  const cols = ['entering class', 'top cut', 'bottom %', 'middle %', 'top %',
    'top − bottom', 'bottom n', 'middle n', 'top n'];
  const hr = document.createElement('tr');
  cols.forEach((t, i) => {
    const h = document.createElement('th');
    h.textContent = t + (i === 0 ? (sortDir > 0 ? ' ↑' : ' ↓') : '');
    if (i === 0) h.addEventListener('click', () => { sortDir = -sortDir; table(); });
    hr.appendChild(h);
  });
  th.appendChild(hr);
  const ys = sortDir > 0 ? BYEARS.slice() : BYEARS.slice().reverse();
  for (const y of ys) {
    const b = BYEARS.indexOf(y);
    const cs = [0, 1, 2].map(t => cellOf(cube(), S.camp, y, t));
    const rs = cs.map(c => rate(c, S.h));
    const tr = document.createElement('tr');
    const vals = [String(y), BEDGE[b][2].toFixed(2),
      ...rs.map(v => v === null ? '—' : v.toFixed(1)),
      (rs[0] === null || rs[2] === null) ? '—' : ((rs[2] - rs[0] >= 0 ? '+' : '') + (rs[2] - rs[0]).toFixed(1)),
      ...cs.map(c => c ? c[0].toLocaleString() : '—')];
    for (const v of vals) { const td = document.createElement('td'); td.textContent = v; tr.appendChild(td); }
    tb.appendChild(tr);
  }
}
function captions() {
  const b = BYEARS.indexOf(S.yr), E = BEDGE[b], E0 = BEDGE[0];
  $('yrlab').textContent = String(S.yr);
  $('s1').textContent =
    `The entering class of ${S.yr}, cut into thirds by the University. The top third begins at `
    + `${E[2].toFixed(2)} and so occupies ${(TOPGPA - E[2]).toFixed(2)} of a grade point; in ${BYEARS[0]} it began at `
    + `${E0[2].toFixed(2)} and occupied ${(TOPGPA - E0[2]).toFixed(2)}. The lower cut moved from `
    + `${E0[1].toFixed(2)} to ${E[1].toFixed(2)} over the same twelve classes. The boundaries are the same at every campus.`;

  /* Sentence one describes exactly what is drawn, whatever the controls say.
     Sentence two is the site's finding, and is ALWAYS computed from the systemwide
     totals so that a campus or group selection can never be read as evidence for it. */
  const g10 = gapAt(BYEARS[0], S.h), gLast = (() => {
    for (let i = NBY - 1; i >= 0; i--) { const v = gapAt(BYEARS[i], S.h); if (v !== null) return { y: BYEARS[i], v }; }
    return null;
  })();
  const where = S.camp === 0 ? 'Across all nine campuses' : `At ${BCAMP[S.camp]}`;
  const who = S.split && S.gA ? `, among ${glabel(S.gA)},` : ',';
  const shown = (g10 === null || !gLast)
    ? `${S.h} years is not observed for the earliest classes shown here. `
    : `the distance between the top and bottom thirds went from ${g10.toFixed(1)} points `
      + `entering ${BYEARS[0]} to ${gLast.v.toFixed(1)} points entering ${gLast.y}. `;

  const sysGap = (y, h) => {
    const a = rate(cellOf(GIB.tot, 0, y, 0), h), b = rate(cellOf(GIB.tot, 0, y, 2), h);
    return (a === null || b === null) ? null : b - a;
  };
  const s4a = sysGap(BYEARS[0], 4), s4b = sysGap(BYEARS[NBY - 1], 4);
  const six = BYEARS.filter(y => y <= MATURE[6]).map(y => sysGap(y, 6));
  const w0 = TOPGPA - BEDGE[0][2], w1 = TOPGPA - BEDGE[NBY - 1][2];

  $('s2').textContent =
    `${where}${who} the two boundaries drawn above closed toward the top of the scale, and over the very same classes `
    + shown
    + `Systemwide and across all students the two do not move together: the top third narrowed from `
    + `${w0.toFixed(2)} to ${w1.toFixed(2)} of a grade point, while the four-year top-minus-bottom gap was `
    + `${s4a.toFixed(1)} points entering ${BYEARS[0]} and ${s4b.toFixed(1)} points entering ${BYEARS[NBY - 1]}, and the `
    + `six-year gap stayed between ${Math.min(...six).toFixed(1)} and ${Math.max(...six).toFixed(1)} points in every `
    + `class old enough to measure. The same predictive spread is now being carried by a much narrower strip of the ruler. `
    + `Six-year rates stop after the class entering ${MATURE[6]} and five-year rates after ${MATURE[5]}, because those classes have not yet reached the horizon.`;

  $('s3').textContent = `Every number in both figures, for ${S.camp === 0 ? 'all campuses' : BCAMP[S.camp]}`
    + `${S.split && S.gA ? ', ' + glabel(S.gA) : ''}, at ${S.h} years. Click the first heading to reverse the order.`;

  $('lbnote').innerHTML = `Counts are the University&rsquo;s Pell Grant split summed, which is the least lossy of `
    + `the three published splits and is <b>a lower bound</b> on the entering class; the first-generation split `
    + `recovers ${(100 * BM.split_coverage.fgen.share_of_pell).toFixed(1)}% of it and the ethnicity split `
    + `${(100 * BM.split_coverage.eth.share_of_pell).toFixed(1)}%. Rates are unaffected: each band&rsquo;s rate is its own graduates over its own entrants.`;

  $('foot').innerHTML = `Built from the University of California&rsquo;s Graduation Dashboard (final rates), `
    + `&ldquo;Grad. rates by GPA groups&rdquo;, freshman cohorts entering ${BYEARS[0]}&ndash;${BYEARS[NBY - 1]}, `
    + `all residencies. Data prepared ${BM.built}. <a href="methods.html">Methods and sources</a>.`;
}

function render() { readout(); fig1(); fig1b(); fig2(); legends(); table(); captions(); }

/* test hook */
window.__bands = {
  DEF,
  set(k, v) { S[k] = v; if (k === 'split') { const gs = groupsOf(v); S.gA = gs.length ? gs[0].key : ''; S.gB = gs.length > 1 ? gs[1].key : ''; fillGroupSelects(); } render(); },
  state() {
    const b = BYEARS.indexOf(S.yr);
    const rows = BYEARS.map(y => {
      const cs = [0, 1, 2].map(t => cellOf(cube(), S.camp, y, t));
      return {
        y, n: cs.map(c => c ? c[0] : null),
        r: cs.map(c => rate(c, S.h)),
        gap: gapAt(y, S.h)
      };
    });
    return {
      yr: S.yr, camp: S.camp, h: S.h, split: S.split, gA: S.gA, gB: S.gB,
      cut1: BEDGE[b][1], cut2: BEDGE[b][2], topwidth: TOPGPA - BEDGE[b][2],
      nseries: series().length, rows
    };
  }
};

initControls(); render();
