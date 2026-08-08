/* Run the consolidated site headless and dump what the browser code computes. */
const fs = require('fs');
const PT = require('path');
const { JSDOM } = require('jsdom');

const SITE = PT.join(__dirname, '..');
let html = fs.readFileSync(PT.join(SITE, 'index.html'), 'utf8');
const data = fs.readFileSync(PT.join(SITE, 'data_inflation.js'), 'utf8');
html = html.replace('<script src="data_inflation.js"></script>',
  () => '<script>\n' + data + '\n</script>');
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true });
const w = dom.window;
w.SVGElement.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, width: 900, height: 400, right: 900, bottom: 400 });
const C = w.__core;
const CAMPUS = C.CAMPUS;
const yb = C.yearsBetween;
const PRE = [2016, 2017, 2018, 2019], POST = [2023, 2024, 2025];

function agg(P, useI) {
  const rows = P.rows, ww = rows.map(r => r.w);
  return {
    n: rows.length,
    Gp: C.wmean(rows.map(r => r.Gp), rows.map(r => r.Ap)),
    Gq: C.wmean(rows.map(r => r.Gq), rows.map(r => r.Aq)),
    dG: C.wmean(rows.map(r => r.dG), ww),
    dC: C.wmean(rows.map(r => r.dC), ww),
    beta: P.beta,
    I: C.wmean(rows.map(r => r.I), ww),
    pos: 100 * C.wmean(rows.map(r => r.I > 0 ? 1 : 0), ww)
  };
}
const out = { ladder: {}, paired: {}, gap: {}, chain: {}, bench: {} };

CAMPUS.forEach((c, ci) => {
  const P = C.buildPanel({ ci, pre: PRE, post: POST, ruler: 'census', gate: 30, ser: 'app', betaMode: 'pre' });
  const a = agg(P);
  out.ladder[c] = { n: a.n, Gp: a.Gp, Gq: a.Gq, dG: a.dG, beta: a.beta, I: a.I, pos: a.pos };
});

const base = C.buildPanel({ ci: 0, pre: PRE, post: POST, ruler: 'none', gate: 30, ser: 'app', betaMode: 'zero' });
CAMPUS.forEach((c, ci) => {
  if (ci === 0) return;
  const o = C.buildPanel({ ci, pre: PRE, post: POST, ruler: 'none', gate: 30, ser: 'app', betaMode: 'zero' });
  const mB = new Map(o.rows.map(r => [r.si, r]));
  const pr = base.rows.filter(r => mB.has(r.si));
  const ww = pr.map(r => (r.w + mB.get(r.si).w) / 2);
  out.paired[c] = { n: pr.length, d: C.wmean(pr.map(r => mB.get(r.si).dG - r.dG), ww) };
});

for (const c of ['Berkeley', 'San Diego', 'Merced']) {
  const ci = CAMPUS.indexOf(c);
  for (const y of [1995, 2005, 2015, 2020, 2025]) {
    const v = [], ww = [];
    for (let si = 0; si < C.NS; si++) {
      const f = C.fun(si, ci, y);
      if (!f || !f.A || f.A < 20 || f.ag === null || f.dg === null || !f.D) continue;
      v.push(f.dg - f.ag); ww.push(f.D);
    }
    out.gap[`${c}|${y}`] = { v: v.length >= 5 ? C.wmean(v, ww) : null, n: v.length };
  }
}

for (const c of ['Berkeley', 'Merced', 'San Diego']) {
  const ci = CAMPUS.indexOf(c);
  const byYear = [];
  for (let y = C.Y0; y <= C.Y1; y++) {
    const m = new Map();
    for (let si = 0; si < C.NS; si++) {
      const f = C.fun(si, ci, y);
      if (f && f.A && f.A >= 30 && f.ag !== null) m.set(si, { g: f.ag, c: f.A });
    }
    byYear.push(m);
  }
  let lvl = 0;
  for (let k = 1; k < byYear.length; k++) {
    const a = byYear[k - 1], b = byYear[k], dv = [], dw = [];
    for (const [si, cur] of b) { const p = a.get(si); if (p) { dv.push(cur.g - p.g); dw.push((cur.c + p.c) / 2); } }
    if (dv.length >= 5) lvl += C.wmean(dv, dw);
  }
  out.chain[c] = lvl;
}

const cfgs = [
  ['berk_census_1619_2325', 0, PRE, POST, 'census', 'pre'],
  ['berk_none_1619_2325', 0, PRE, POST, 'none', 'zero'],
  ['merced_census_1619_2325', 4, PRE, POST, 'census', 'pre'],
  ['berk_sat_0508_1619', 0, [2005, 2006, 2007, 2008], PRE, 'zsat', 'pre'],
  ['sd_sat_9902_1720', 6, [1999, 2000, 2001, 2002], [2017, 2018, 2019, 2020], 'zsat', 'pre'],
  ['berk_census_post', 0, PRE, POST, 'census', 'post'],
];
for (const [key, ci, pre, post, ruler, bm] of cfgs) {
  const P = C.buildPanel({ ci, pre, post, ruler, gate: 30, ser: 'app', betaMode: bm });
  const a = agg(P);
  out.bench[key] = { n: a.n, beta: a.beta, dG: a.dG, dC: a.dC, I: a.I, pos: a.pos };
}

/* ---- tab 1: the opening triptych, read back through the tab's own state ---- */
out.changed = {};
{
  const T = w.__changed;
  const cfg = [
    ['uw_census_default',    { pool: -1, p0a: 2016, p0b: 2019, p1a: 2023, p1b: 2025, anchor: 'census', gate: 30, ser: 'app', wt: 'a' }],
    ['uw_census_unweighted', { pool: -1, p0a: 2016, p0b: 2019, p1a: 2023, p1b: 2025, anchor: 'census', gate: 30, ser: 'app', wt: 's' }],
    ['uw_census_gate60',     { pool: -1, p0a: 2016, p0b: 2019, p1a: 2023, p1b: 2025, anchor: 'census', gate: 60, ser: 'app', wt: 'a' }],
    ['uw_census_admitted',   { pool: -1, p0a: 2016, p0b: 2019, p1a: 2023, p1b: 2025, anchor: 'census', gate: 30, ser: 'adm', wt: 'a' }],
    ['berk_census_default',  { pool: 0, p0a: 2016, p0b: 2019, p1a: 2023, p1b: 2025, anchor: 'census', gate: 30, ser: 'app', wt: 'a' }],
    ['merced_census_default',{ pool: 4, p0a: 2016, p0b: 2019, p1a: 2023, p1b: 2025, anchor: 'census', gate: 30, ser: 'app', wt: 'a' }],
    ['uw_sat_0508_1619',     { pool: -1, p0a: 2005, p0b: 2008, p1a: 2016, p1b: 2019, anchor: 'zsat', gate: 30, ser: 'app', wt: 'a' }],
  ];
  for (const [key, st] of cfg) {
    for (const k in st) T.set(k, st[k]);
    T.set('ref', 'fit');
    const f = T.state();
    T.set('ref', 'eq');
    const e = T.state();
    out.changed[key] = {
      n: f.n, mdG: f.mdG, posG: f.posG, mdC: f.mdC, a: f.a, b: f.b, s: f.s, r: f.r,
      mres_fit: f.mres, posres_fit: f.posres, mres_eq: e.mres, posres_eq: e.posres
    };
  }
  for (const k in T.DEF) T.set(k, T.DEF[k]);
}

/* ---- the derived denied pool, the survival curves and the scatter ------- *
 * Read straight off the shared estimator library, the same entry points the
 * crowded-top tab calls, so the comparison is against the shipped code path.
 * Pool -1 is the Universitywide aggregate.                                  */
out.sep = {}; out.identity = {}; out.surv = {}; out.scat = {}; out.scat_school = {};
const POOLNAME = ci => ci < 0 ? 'Universitywide' : CAMPUS[ci];
const POOLIDX = { 'Universitywide': -1 };
CAMPUS.forEach((c, i) => POOLIDX[c] = i);

function sepYear(ci, y, gate, minR) {
  const sv = [], sw = [], se = [];
  let numD = 0, denD = 0, numR = 0, denR = 0, sA = 0, sD = 0;
  for (let si = 0; si < C.NS; si++) {
    const f = C.fun(si, ci, y); if (!f || !f.A || f.A < gate) continue;
    const c = C.deniedCell(si, ci, y, minR); if (!c) continue;
    sv.push(c.sep); sw.push(c.D); se.push(c.err);
    numD += c.D * c.dg; denD += c.D; numR += c.R * c.rg; denR += c.R;
    sA += c.A; sD += c.D;
  }
  if (sv.length < 5) return { sep: null, sepPooled: null, n: 0, rate: null, err: null };
  return { sep: C.wmean(sv, sw), sepPooled: numD / denD - numR / denR,
           err: C.wmean(se, sw), n: sv.length, rate: 100 * sD / sA };
}
function gapYear(ci, y, gate) {
  const v = [], w2 = [];
  for (let si = 0; si < C.NS; si++) {
    const f = C.fun(si, ci, y);
    if (!f || !f.A || f.A < gate || f.ag === null || f.dg === null || !f.D) continue;
    v.push(f.dg - f.ag); w2.push(f.D);
  }
  return { gap: v.length >= 5 ? C.wmean(v, w2) : null, nGap: v.length };
}
for (const c of ['Universitywide', 'Berkeley', 'San Diego', 'Merced', 'Riverside']) {
  const ci = POOLIDX[c];
  for (const y of [1995, 2005, 2015, 2020, 2025]) {
    const s = sepYear(ci, y, 20, 10), g = gapYear(ci, y, 20);
    out.sep[`${c}|${y}`] = { sep: s.sep, sepPooled: s.sepPooled, gap: g.gap, err: s.err,
                             n: s.n, nGap: g.nGap, rate: s.rate };
  }
}

for (const [nm, gate, minR] of [['Universitywide', 20, 10], ['Berkeley', 20, 10], ['Merced', 1, 3]]) {
  const ci = POOLIDX[nm];
  let maxdev = 0, n = 0; const sv = [], sw = [], gv = [];
  for (let si = 0; si < C.NS; si++) for (let y = C.Y0; y <= C.Y1; y++) {
    const f = C.fun(si, ci, y); if (!f || !f.A || f.A < gate) continue;
    const c = C.deniedCell(si, ci, y, minR); if (!c) continue;
    maxdev = Math.max(maxdev, Math.abs(c.gap - (1 - c.D / c.A) * c.sep));
    sv.push(c.sep); gv.push(c.gap); sw.push(c.D); n++;
  }
  out.identity[nm] = { n, maxdev, meansep: C.wmean(sv, sw), meangap: C.wmean(gv, sw) };
}

const THR = []; for (let i = 0; i < 37; i++) THR.push(+(2.50 + 0.05 * i).toFixed(2));
for (const c of ['Universitywide', 'Berkeley', 'Merced', 'San Diego']) {
  const ci = POOLIDX[c];
  for (const [nm, yrs] of [['e1619', PRE], ['e2325', POST], ['e0508', [2005, 2006, 2007, 2008]]]) {
    const cur = C.survival(ci, yrs, 20, THR, 'app', null);
    out.surv[`${c}|${nm}`] = { t: cur.map(r => r.t), share: cur.map(r => r.share),
                               nSchools: cur.map(r => r.nSchools), nTotal: cur[0].nTotal };
  }
}

for (const ci of [-1].concat([...Array(CAMPUS.length).keys()])) {
  for (let a = 1994; a <= 2025; a += 4) {
    const r = C.separation(ci, yb(a, Math.min(2025, a + 3)), 20, 10, null);
    if (r && r.n >= 20) out.scat[`${POOLNAME(ci)}|${a}`] =
      { n: r.n, sep: r.sep, gap: r.gap, err: r.err, rate: r.admitRate, A: r.A };
  }
}
for (const c of ['Berkeley', 'Merced']) {
  const rs = C.separation(POOLIDX[c], [2022, 2023, 2024, 2025], 20, 10, null, 100);
  const byCeeb = {};
  for (const r of rs) byCeeb[w.GI.sch[r.si][0]] =
    { n: r.n, sep: r.sep, gap: r.gap, err: r.err, rate: r.admitRate, A: r.A };
  const ks = Object.keys(byCeeb).sort().slice(0, 12);
  out.scat_school[c] = {}; for (const k of ks) out.scat_school[c][k] = byCeeb[k];
  out.scat_school[c + '|count'] = rs.length;
}

fs.mkdirSync(PT.join(__dirname, 'out'), { recursive: true });
fs.writeFileSync(PT.join(__dirname, 'out', 'js_actual.json'), JSON.stringify(out, null, 1));
console.log('wrote ' + PT.join(__dirname, 'out', 'js_actual.json'));
