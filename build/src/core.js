/* ------------------------------------------------------------------ *
 * Shared core for the four grade-inflation tools.
 * Decoder for the base64url payload + the estimators + small SVG helpers.
 * No external dependencies; every tool file is self-contained.
 * ------------------------------------------------------------------ */
'use strict';

const B64 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";
const VAL = {}; for (let i = 0; i < 64; i++) VAL[B64[i]] = i;
function dec2(s, k) { const v = VAL[s[k]] * 64 + VAL[s[k + 1]]; return v === 4095 ? null : v; }

const M = GI.meta, SCH = GI.sch, FUN = GI.fun, RUL = GI.rul;
/* The Universitywide pool: the University's own aggregate over all nine campuses, in
   which an applicant to several campuses is counted once. It is kept OUT of the campus
   arrays so every campus index below is exactly where it has always been; code reaches
   it by passing a pool index of -1 wherever a campus index is expected. */
const UWF = GI.uw || [];
const HAS_UW = UWF.some(Boolean);
const CAMPUS = M.campus, NC = CAMPUS.length, NS = SCH.length;
const Y0 = M.y0, Y1 = M.y1, RY0 = M.ry0, RY1 = M.ry1;
const NF = M.fun_fields.length;          // 6 (full) or 2 (slim)
const NR = M.rul_fields.length;          // 10
const SLIM = NF === 2;

/* ---- record access -------------------------------------------------- */
const _fcache = new Map();
function fun(si, ci, y) {
  const e = ci < 0 ? UWF[si] : FUN[si][ci]; if (!e) return null;
  const k = y - e[0]; if (k < 0) return null;
  const s = e[1], off = k * 2 * NF; if (off + 2 * NF > s.length) return null;
  const A = dec2(s, off);
  if (SLIM) { const g = dec2(s, off + 2); return (A === null && g === null) ? null : { A, D: null, E: null, ag: g === null ? null : g / 100, dg: null, eg: null }; }
  const D = dec2(s, off + 2), E = dec2(s, off + 4);
  const ag = dec2(s, off + 6), dg = dec2(s, off + 8), eg = dec2(s, off + 10);
  if (A === null && D === null && E === null && ag === null && dg === null && eg === null) return null;
  return { A, D, E, ag: ag === null ? null : ag / 100, dg: dg === null ? null : dg / 100, eg: eg === null ? null : eg / 100 };
}
function rul(si, y) {
  const s = RUL[si]; if (!s) return null;
  const k = y - RY0; if (k < 0) return null;
  const off = k * 2 * NR; if (off + 2 * NR > s.length) return null;
  const K = M.scale, z = v => v === null ? null : (v - K.zoff) / K.z;
  const d = (v, k) => v === null ? null : v / k;
  const c = dec2(s, off), src = dec2(s, off + 2);
  return {
    census: d(c, K.census_pct), csrc: src,
    censusz: z(dec2(s, off + 4)), zsat: z(dec2(s, off + 6)),
    act: d(dec2(s, off + 8), K.act),
    appass: d(dec2(s, off + 10), K.ap_pass_share),
    apge3: d(dec2(s, off + 12), K.ap_ge3_per_g12),
    g12: dec2(s, off + 14), agm: dec2(s, off + 16),
    upp: d(dec2(s, off + 18), K.upp)
  };
}

/* ---- weighted statistics -------------------------------------------- */
function wmean(x, w) { let n = 0, d = 0; for (let i = 0; i < x.length; i++) { n += x[i] * w[i]; d += w[i]; } return d ? n / d : NaN; }
function wsd(x, w) { const m = wmean(x, w); let n = 0, d = 0; for (let i = 0; i < x.length; i++) { n += w[i] * (x[i] - m) ** 2; d += w[i]; } return d ? Math.sqrt(n / d) : NaN; }
function wquant(x, w, q) {
  const o = x.map((v, i) => [v, w[i]]).sort((a, b) => a[0] - b[0]);
  const T = o.reduce((s, r) => s + r[1], 0); let c = 0;
  for (let i = 0; i < o.length; i++) { const lo = c + 0.5 * o[i][1]; c += o[i][1]; if (lo / T >= q) return o[i][0]; }
  return o.length ? o[o.length - 1][0] : NaN;
}
function wslope(x, y, w) {           // weighted OLS slope with intercept
  const W = w.reduce((s, v) => s + v, 0) / w.length;
  let s0 = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < x.length; i++) { const u = w[i] / W; s0 += u; sx += u * x[i]; sy += u * y[i]; sxx += u * x[i] * x[i]; sxy += u * x[i] * y[i]; }
  const den = s0 * sxx - sx * sx; return den === 0 ? 0 : (s0 * sxy - sx * sy) / den;
}
function wcorr(x, y, w) {
  const mx = wmean(x, w), my = wmean(y, w); let a = 0, b = 0, c = 0;
  for (let i = 0; i < x.length; i++) { const dx = x[i] - mx, dy = y[i] - my; a += w[i] * dx * dy; b += w[i] * dx * dx; c += w[i] * dy * dy; }
  return (b > 0 && c > 0) ? a / Math.sqrt(b * c) : NaN;
}
// deterministic bootstrap standard error (seeded LCG, so a reload gives the same number)
function bootSE(v, w, n) {
  n = n || 400; let s = 20260801 >>> 0;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const out = [];
  for (let b = 0; b < n; b++) {
    let num = 0, den = 0;
    for (let i = 0; i < v.length; i++) { const j = (rnd() * v.length) | 0; num += v[j] * w[j]; den += w[j]; }
    out.push(den ? num / den : 0);
  }
  const m = out.reduce((a, x) => a + x, 0) / n;
  return Math.sqrt(out.reduce((a, x) => a + (x - m) ** 2, 0) / n);
}

/* ---- era aggregation ------------------------------------------------- */
const SERIES = { app: { c: 'A', g: 'ag', label: 'applicants' }, adm: { c: 'D', g: 'dg', label: 'admitted students' }, enr: { c: 'E', g: 'eg', label: 'enrolled students' } };

/** Era-pooled, count-weighted pool GPA per school for one campus. */
function eraSchool(ci, years, gate, ser) {
  const S = SERIES[ser || 'app'], out = new Map();
  for (let si = 0; si < NS; si++) {
    let num = 0, den = 0, A = 0, ny = 0;
    for (const y of years) {
      const f = fun(si, ci, y); if (!f) continue;
      if (f.A) A += f.A;
      const c = f[S.c], g = f[S.g];
      if (c && g !== null) { num += c * g; den += c; ny++; }
    }
    if (den > 0 && A >= gate) out.set(si, { G: num / den, A, n: den, ny });
  }
  return out;
}
const RULERS = {
  none: { key: null, label: 'no achievement anchor', unit: '' },
  census: { key: 'census', label: 'census test, all 11th (or 10th) graders', unit: '% at or above the bar' },
  censusz: { key: 'censusz', label: 'census test, standardized within class and instrument', unit: 'SD' },
  zsat: { key: 'zsat', label: 'SAT, school mean among testers', unit: 'SD' },
  act: { key: 'act', label: 'ACT, share of testers scoring 21 or better', unit: '%' },
  appass: { key: 'appass', label: 'AP, share of exams scored 3 or better', unit: '%' },
  apge3: { key: 'apge3', label: 'AP, exams scored 3 or better per senior', unit: 'per senior' }
};
/** Era-mean of a ruler field per school. */
function eraRuler(years, field) {
  const out = new Map(); if (!field) return out;
  for (let si = 0; si < NS; si++) {
    let s = 0, n = 0;
    for (const y of years) { const r = rul(si, y); if (r && r[field] !== null && r[field] !== undefined) { s += r[field]; n++; } }
    if (n) out.set(si, s / n);
  }
  return out;
}
/** Which census instrument(s) a set of class years draws on. */
function instruments(years) {
  const seen = new Set();
  for (const y of years) for (let si = 0; si < NS; si++) { const r = rul(si, y); if (r && r.csrc) { seen.add(r.csrc); break; } }
  return [...seen].sort();
}

/** The balanced two-era panel and the index. */
function buildPanel(opt) {
  const { ci, pre, post, ruler, gate, ser, betaMode, betaManual, filter } = opt;
  const P = eraSchool(ci, pre, gate, ser), Q = eraSchool(ci, post, gate, ser);
  const field = RULERS[ruler].key;
  const RP = eraRuler(pre, field), RQ = eraRuler(post, field);
  const rows = [];
  for (const [si, p] of P) {
    const q = Q.get(si); if (!q) continue;
    if (filter && !filter(si)) continue;
    let cp = null, cq = null;
    if (field) { cp = RP.get(si); cq = RQ.get(si); if (cp === undefined || cq === undefined) continue; }
    rows.push({ si, Gp: p.G, Gq: q.G, Ap: p.A, Aq: q.A, Cp: cp, Cq: cq, dG: q.G - p.G, dC: field ? cq - cp : 0, w: (p.A + q.A) / 2 });
  }
  let beta = 0;
  if (field && rows.length > 2) {
    if (betaMode === 'manual') beta = betaManual;
    else if (betaMode === 'zero') beta = 0;
    else if (betaMode === 'post') beta = wslope(rows.map(r => r.Cq), rows.map(r => r.Gq), rows.map(r => r.Aq));
    else beta = wslope(rows.map(r => r.Cp), rows.map(r => r.Gp), rows.map(r => r.Ap));
  }
  for (const r of rows) r.I = r.dG - beta * r.dC;
  return { rows, beta, field };
}

/* ---- pooled (all-schools) series, for the composition term ----------- */
function pooledGPA(ci, years, ser, filter) {
  const S = SERIES[ser || 'app']; let num = 0, den = 0;
  for (let si = 0; si < NS; si++) {
    if (filter && !filter(si)) continue;
    for (const y of years) { const f = fun(si, ci, y); if (!f) continue; const c = f[S.c], g = f[S.g]; if (c && g !== null) { num += c * g; den += c; } }
  }
  return den ? num / den : NaN;
}

/* ---- the denied pool, derived ----------------------------------------- *
 * The University publishes, for one high school, one campus and one class,
 * the mean recalculated grade point average of the applicants and of the
 * admitted subset, together with both counts.  The students who applied and
 * were not admitted are the arithmetic remainder:
 *
 *     A = applicants,  D = admitted,  R = A - D = denied
 *     mean(A) = p*mean(D) + (1-p)*mean(R),   p = D/A
 *  => mean(R) = (A*mean(A) - D*mean(D)) / R
 *
 * and therefore, exactly, cell by cell:
 *
 *     mean(D) - mean(A) = (1 - p) * ( mean(D) - mean(R) )
 *
 * The published means carry two decimal places, so the derived denied mean
 * inherits a rounding error amplified by A/R = 1/(1-p): the fewer denied
 * students a cell has, the coarser its denied mean.  Cells with fewer than
 * MIN_DENIED denied students are therefore withheld.
 * ---------------------------------------------------------------------- */
const MIN_DENIED = 10;
function deniedCell(si, ci, y, minR) {
  const f = fun(si, ci, y); if (!f) return null;
  if (!f.A || f.D === null || f.D === undefined || f.ag === null || f.dg === null) return null;
  const R = f.A - f.D;
  const m = (minR === undefined || minR === null) ? MIN_DENIED : minR;
  if (!(R >= m) || R <= 0) return null;
  const rg = (f.A * f.ag - f.D * f.dg) / R;
  if (!isFinite(rg)) return null;
  // Worst-case rounding bound.  Each published mean is correct to +/- 0.005, so
  //   |error in rg| <= 0.005 * (A + D) / R,   |error in (dg - rg)| <= 0.005 * (1 + (A+D)/R).
  // At a high admission rate R is small and the bound is large: the separation
  // is still the right quantity, but the record cannot resolve it.
  const err = 0.005 * (1 + (f.A + f.D) / R);
  return { A: f.A, D: f.D, R, p: f.D / f.A, ag: f.ag, dg: f.dg, rg, err,
           sep: f.dg - rg, gap: f.dg - f.ag };
}

/* Era-pooled survival curve: the share of applicant mass sitting at or above
 * each grade threshold, where a school contributes all of its applicants at
 * its own era-pooled pool average.  Returns [{t, share, nAbove, nSchools}]. */
function survival(ci, years, gate, thresholds, ser, filter) {
  const P = eraSchool(ci, years, gate, ser);
  const G = [], W = [];
  for (const [si, r] of P) { if (filter && !filter(si)) continue; G.push(r.G); W.push(r.A); }
  const tot = W.reduce((a, b) => a + b, 0);
  return thresholds.map(t => {
    let above = 0, ns = 0;
    for (let i = 0; i < G.length; i++) if (G[i] >= t - 1e-12) { above += W[i]; ns++; }
    return { t, share: tot ? 100 * above / tot : null, nAbove: above, nSchools: ns, nTotal: G.length, wTotal: tot };
  });
}

/* Separation and admission rate over a set of classes, at one campus.
 * grain 'campus'  -> one object;  grain 'school' -> one object per school. */
function separation(ci, years, gate, minR, filter, schoolGate) {
  const cells = [];
  for (let si = 0; si < NS; si++) {
    if (filter && !filter(si)) continue;
    for (const y of years) {
      const f = fun(si, ci, y); if (!f || !f.A || f.A < gate) continue;
      const c = deniedCell(si, ci, y, minR); if (!c) continue;
      cells.push({ si, y, A: c.A, D: c.D, R: c.R, err: c.err, sep: c.dg - c.rg, gap: c.dg - c.ag });
    }
  }
  const roll = list => {
    if (!list.length) return null;
    let sw = 0, sg = 0, se = 0, wD = 0, sA = 0, sD = 0;
    for (const c of list) { sw += c.D * c.sep; sg += c.D * c.gap; se += c.D * c.err; wD += c.D; sA += c.A; sD += c.D; }
    return { n: list.length, sep: wD ? sw / wD : null, gap: wD ? sg / wD : null,
             err: wD ? se / wD : null, admitRate: sA ? 100 * sD / sA : null,
             A: sA, D: sD, R: sA - sD };
  };
  if (schoolGate === undefined || schoolGate === null) return roll(cells);
  const by = new Map();
  for (const c of cells) { if (!by.has(c.si)) by.set(c.si, []); by.get(c.si).push(c); }
  const out = [];
  for (const [si, list] of by) {
    const tot = list.reduce((s, c) => s + c.A, 0);
    if (tot < schoolGate) continue;
    const r = roll(list); if (r) { r.si = si; out.push(r); }
  }
  return out;
}

/* Fixed-width class periods spanning the record, oldest first. */
function periods(len) {
  const out = [];
  for (let a = Y0; a <= Y1; a += len) {
    const b = Math.min(Y1, a + len - 1);
    out.push({ a, b, years: yearsBetween(a, b), label: (a === b) ? String(a) : `${a}–${String(b).slice(2)}` });
  }
  return out;
}
const logit = p => (p > 0 && p < 1) ? Math.log(p / (1 - p)) : NaN;

/* ---- school traits, computed once ------------------------------------ */
const TRAIT = (() => {
  const t = [];
  for (let si = 0; si < NS; si++) {
    let upp = null, cen = null, g12 = null, un = 0, cn = 0, gn = 0;
    for (let y = RY0; y <= RY1; y++) {
      const r = rul(si, y); if (!r) continue;
      if (r.upp !== null) { upp = (upp || 0) + r.upp; un++; }
      if (r.censusz !== null) { cen = (cen || 0) + r.censusz; cn++; }
      if (r.g12 !== null) { g12 = (g12 || 0) + r.g12; gn++; }
    }
    let apps = 0, first = null, last = null;
    for (let ci = 0; ci < NC; ci++) for (let y = Y0; y <= Y1; y++) { const f = fun(si, ci, y); if (f && f.A) { apps += f.A; if (first === null || y < first) first = y; if (last === null || y > last) last = y; } }
    t.push({ upp: un ? upp / un : null, cenz: cn ? cen / cn : null, g12: gn ? g12 / gn : null, apps, first, last, county: SCH[si][3] });
  }
  return t;
})();
function tercile(vals) {                     // returns cutpoints [c1,c2] of finite values
  const v = vals.filter(x => x !== null && isFinite(x)).sort((a, b) => a - b);
  if (v.length < 6) return [null, null];
  return [v[Math.floor(v.length / 3)], v[Math.floor(2 * v.length / 3)]];
}
const COUNTIES = [...new Set(SCH.map(s => s[3]).filter(Boolean))].sort();

/* ---- tiny SVG helpers ------------------------------------------------ */
const NSVG = 'http://www.w3.org/2000/svg';
function el(tag, attrs, parent) {
  const n = document.createElementNS(NSVG, tag);
  for (const k in attrs) if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}
function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
function scale(d0, d1, r0, r1) { const f = v => (d1 === d0) ? (r0 + r1) / 2 : r0 + (v - d0) / (d1 - d0) * (r1 - r0); f.inv = p => d0 + (p - r0) / (r1 - r0) * (d1 - d0); f.dom = [d0, d1]; f.rng = [r0, r1]; return f; }
function niceTicks(a, b, n) {
  n = n || 6; const span = b - a; if (!(span > 0)) return [a];
  const step0 = span / n, mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const cand = [1, 2, 2.5, 5, 10].map(m => m * mag);
  const step = cand.find(c => c >= step0) || cand[cand.length - 1];
  const out = []; for (let v = Math.ceil(a / step) * step; v <= b + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}
function fmt(v, d) { return (v === null || v === undefined || !isFinite(v)) ? '—' : v.toFixed(d === undefined ? 2 : d); }
function sgn(v, d) { return (v === null || !isFinite(v)) ? '—' : (v >= 0 ? '+' : '') + v.toFixed(d === undefined ? 3 : d); }

/* floating hover box, shared by every chart */
const TIP = (() => {
  const d = document.createElement('div'); d.className = 'tip'; d.style.display = 'none';
  document.body.appendChild(d);
  return {
    show(html, x, y) {
      d.innerHTML = html; d.style.display = 'block';
      const r = d.getBoundingClientRect();
      let L = x + 14, T = y + 14;
      if (L + r.width > window.innerWidth - 8) L = x - r.width - 14;
      if (T + r.height > window.innerHeight - 8) T = y - r.height - 14;
      d.style.left = Math.max(4, L) + 'px'; d.style.top = Math.max(4, T) + 'px';
    },
    hide() { d.style.display = 'none'; }
  };
})();

/* THE campus color map — one campus, one color, on every tab of the site.
   The Leal / uc-waiver-explorer palette, campus assignments preserved exactly:
   Davis red, San Diego blue, Berkeley green (with its deliberate teal edge),
   Los Angeles orange, Irvine purple, Santa Barbara magenta, Santa Cruz teal,
   Riverside brown, Merced gray. Never redefine locally.
   CAMPUS order: Berkeley, Davis, Irvine, Los Angeles, Merced, Riverside,
   San Diego, Santa Barbara, Santa Cruz. */
const CCOL = ['#118040', '#FB0207', '#7A00CC', '#FF8C00', '#555555', '#8B4A00', '#0000FF', '#E6007E', '#009192'];
const CEDGE = ['#108080', '#FB0207', '#7A00CC', '#FF8C00', '#555555', '#8B4A00', '#0000FF', '#E6007E', '#009192'];
const campusColor = ci => CCOL[ci];
const campusEdge = ci => CEDGE[ci];

/* Pools = the Universitywide aggregate (index -1) followed by the nine campuses.
   Universitywide is drawn in black: it is not a campus and must never borrow a campus
   hue, and it is never labelled Berkeley (the 2026-07-25 label diagnosis). */
const UWLABEL = M.uw_label || 'Universitywide';
const POOLS = (HAS_UW ? [-1] : []).concat([...Array(NC).keys()]);
const poolLabel = p => p < 0 ? UWLABEL : CAMPUS[p];
const poolColor = p => p < 0 ? '#000000' : CCOL[p];
const poolEdge = p => p < 0 ? '#000000' : CEDGE[p];

/* Leal chart chrome: 2.6px black spines with outward ticks (major 7.5, minor 4.4),
   no gridlines, full-width black zero/base lines. */
const AXW = 2.6, TMAJ = 7.5, TMIN = 4.4;
function spine(g, x1, y1, x2, y2) { el('line', { x1, y1, x2, y2, stroke: '#000', 'stroke-width': AXW }, g); }
function tickX(g, x, y, minor) { el('line', { x1: x, y1: y, x2: x, y2: y + (minor ? TMIN : TMAJ), stroke: '#000', 'stroke-width': AXW }, g); }
function tickY(g, x, y, minor) { el('line', { x1: x - (minor ? TMIN : TMAJ), y1: y, x2: x, y2: y, stroke: '#000', 'stroke-width': AXW }, g); }
function baseLine(g, x1, x2, y) { el('line', { x1, x2, y1: y, y2: y, stroke: '#000', 'stroke-width': AXW }, g); }

/* Greedy vertical de-collision for right-edge series labels. */
function stackLabels(items, minGap, lo, hi) {
  minGap = minGap || 12;
  items.sort((a, b) => a.y - b.y);
  let prev = (lo === undefined ? -1e9 : lo - minGap);
  for (const it of items) { it.ly = Math.max(it.y, prev + minGap); prev = it.ly; }
  if (hi !== undefined && items.length && items[items.length - 1].ly > hi) {
    let next = hi;
    for (let i = items.length - 1; i >= 0; i--) { items[i].ly = Math.min(items[i].ly, next); next = items[i].ly - minGap; }
  }
  return items;
}
/* Draws the admission-regime bands with labels that never collide. */
function drawRegimes(g, x, top, bottom) {
  const rg = el('g', { class: 'regime' }, g);
  REGIMES.slice(1).forEach((r, i) => {
    const x0 = x(r.a - .5), x1 = x(r.b + .5);
    el('rect', { x: x0, y: top, width: x1 - x0, height: bottom - top }, rg);
    const wide = (x1 - x0) > 46;
    el('text', {
      x: wide ? (x0 + x1) / 2 : x1 + 3, y: top + 11 + i * 12,
      'text-anchor': wide ? 'middle' : 'start'
    }, rg).textContent = r.name;
  });
  return rg;
}

/* class-year helpers */
function yearsBetween(a, b) { const o = []; for (let y = a; y <= b; y++) o.push(y); return o; }

/* the three admission regimes, for background shading */
const REGIMES = [
  { a: 1994, b: 2020, name: 'test scores required' },
  { a: 2021, b: 2021, name: 'test-optional' },
  { a: 2022, b: 2025, name: 'test-blind' }
];

/* test hook — lets the headless suite read the internals without re-deriving them */
window.__core = { CAMPUS, NC, NS, Y0, Y1, RY0, RY1, fun, rul, TRAIT, RULERS,
                  eraSchool, eraRuler, buildPanel, pooledGPA, wmean, wsd, wslope,
                  wcorr, wquant, bootSE, instruments, yearsBetween, tercile, COUNTIES,
                  stackLabels, drawRegimes, CCOL, CEDGE, campusColor, campusEdge,
                  HAS_UW, UWLABEL, POOLS, poolLabel, poolColor, poolEdge,
                  SERIES, RULERS, niceTicks, scale, fmt, sgn,
                  MIN_DENIED, deniedCell, survival, separation, periods, logit };
