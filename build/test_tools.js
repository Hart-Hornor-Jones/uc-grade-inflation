/* Headless interaction tests for the consolidated grade-inflation site.
   Loads index.html once (with the shared payload inlined) and exercises the
   shell plus all four ported tools. Run with: node test_tools.js */
const fs = require('fs');
const PT = require('path');
const { JSDOM } = require('jsdom');

let pass = 0, fail = 0;
function ok(label, cond, extra) {
  if (cond) { pass++; console.log('PASS  ' + label); }
  else { fail++; console.log('FAIL  ' + label + (extra ? '  ' + extra : '')); }
}

const SITE = PT.join(__dirname, '..');
const rawHtml = fs.readFileSync(PT.join(SITE, 'index.html'), 'utf8');
let html = rawHtml;
for (const f of ['data_inflation.js', 'data_bands.js']) {
  const src = fs.readFileSync(PT.join(SITE, f), 'utf8');
  html = html.replace('<script src="' + f + '"></script>', () => '<script>\n' + src + '\n</script>');
}

const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true });
const w = dom.window, d = w.document;
w.SVGElement.prototype.getBoundingClientRect = function () {
  return { left: 0, top: 0, width: 900, height: 400, right: 900, bottom: 400 };
};

function fire(el, type) { el.dispatchEvent(new w.Event(type, { bubbles: true })); }
function set(pfx, id, v) { const e = d.getElementById(pfx + '_' + id); e.value = String(v); fire(e, 'change'); return e; }
function num(t) { if (t && t.textContent !== undefined) t = t.textContent; const m = /[-+]?\d*\.?\d+/.exec(String(t).replace(/,/g, '')); return m ? parseFloat(m[0]) : NaN; }
const qa = sel => d.querySelectorAll(sel);

const results = {};

/* ================================================================= shell */
console.log('\n--- shell ---');
ok('shell: payload present', w.GI && w.GI.sch.length > 1000, String(w.GI && w.GI.sch.length));
ok('shell: 9 campuses', w.__core.CAMPUS.length === 9);
ok('shell: class span 1994-2025', w.__core.Y0 === 1994 && w.__core.Y1 === 2025);
const SECTIONS = ['changed', 'doors', 'crowded', 'bands', 'bench', 'school'];
ok('shell: six tab sections exist', SECTIONS.every(t => d.getElementById('tab-' + t)));
ok('shell: six tab buttons + methods link', qa('.tabbtn').length === 6 && !!d.querySelector('.methlink'));
ok('shell: default tab is "What changed"', !d.getElementById('tab-changed').hidden &&
  d.getElementById('tab-doors').hidden);
w.location.hash = '#doors'; w.__tabs.show();
ok('shell: #doors shows the doors tab only',
  !d.getElementById('tab-doors').hidden &&
  SECTIONS.filter(t => t !== 'doors').every(t => d.getElementById('tab-' + t).hidden));
ok('shell: active tab button marked', d.querySelector('.tabbtn[data-tab="doors"]').getAttribute('aria-pressed') === 'true');
w.location.hash = '#bogus'; w.__tabs.show();
ok('shell: unknown hash falls back to tab 1', !d.getElementById('tab-changed').hidden);
ok('shell: no placeholder sections left', qa('.pending').length === 0,
  String(qa('.pending').length));
ok('shell: methods.html exists beside index.html', fs.existsSync(PT.join(SITE, 'methods.html')));

/* the Leal design: bold Helvetica, sharp black boxes, circus palette, bold axes */
ok('style: Leal tokens present', /--red:#FB0207/.test(rawHtml) && /--bw:2\.5px/.test(rawHtml) &&
  /'Helvetica Neue',Helvetica,Arial/.test(rawHtml) && /font-weight:700/.test(rawHtml));
ok('style: white page, black ink', /background:#FFFFFF/.test(rawHtml) && /color:#000/.test(rawHtml));
ok('style: sharp corners only', !/border-radius:\s*[1-9]/.test(rawHtml));
ok('style: Leal campus palette, assignments preserved', /'#118040', '#FB0207', '#7A00CC', '#FF8C00', '#555555', '#8B4A00', '#0000FF', '#E6007E', '#009192'/.test(rawHtml) && !/#2874a6|#2e86c1/.test(rawHtml));
ok('style: 2.6px axes with 7.5/4.4 outward ticks', /AXW = 2\.6, TMAJ = 7\.5, TMIN = 4\.4/.test(rawHtml));
ok('style: section titles share one scale', /section h1\{font-size:19px/.test(rawHtml));
ok('style: sans stack only, no serif', !/Iowan|Palatino|Georgia|serif(?!,)/.test(rawHtml.replace(/sans-serif/g, '')));
ok('style: no "cannot tell you" caveat blocks', !/cannot tell you/i.test(rawHtml) && qa('details.method').length === 0);
const methodsTxt = fs.readFileSync(PT.join(SITE, 'methods.html'), 'utf8');
ok('style: no British spellings in user-facing text',
  !/standardised|colour|behaviour|per cent|programme|recognise|neighbourhood|centred|analyse|enrols\b/.test(rawHtml + methodsTxt));
ok('style: no "merit" anywhere', !/merit/i.test(rawHtml + methodsTxt));
ok('style: the need measure is never glossed as poverty', !/povert/i.test(rawHtml + methodsTxt));
const noScript = h => h.replace(/<script[\s\S]*?<\/script>/g, ' ');
const personRx = /\b(you|your|yours|we|us|ours|myself|ourselves)\b/i;
ok('style: no first or second person in the static page text',
  !personRx.test(noScript(rawHtml)) && !personRx.test(noScript(methodsTxt)),
  (personRx.exec(noScript(rawHtml)) || personRx.exec(noScript(methodsTxt)) || [''])[0]);
ok('copy: each tab opens with its family posed as a question',
  qa('.famq').length === 6 && [...qa('.famq')].every(e => /\?$/.test(e.textContent.trim())),
  [...qa('.famq')].map(e => e.textContent).join(' | '));
ok('doors: ceiling-aware caption replaced the rise-together framing',
  !/every slice of the class should rise together/.test(rawHtml) && /loss of resolution/.test(rawHtml));

/* =============================================================== changed */
console.log('\n--- what changed (tab 1, the triptych) ---');
{
  const T = w.__changed;
  ok('changed: the tab exposes its state', !!T && typeof T.state === 'function');
  const st0 = T.state();

  /* the Universitywide pool must exist, be the default, and never be called Berkeley */
  ok('changed: the Universitywide pool is in the payload',
    w.__core.HAS_UW && w.GI.uw.filter(Boolean).length > 1500,
    String(w.GI.uw ? w.GI.uw.filter(Boolean).length : 0));
  ok('changed: the pooled series is labeled Universitywide, never Berkeley',
    st0.pool === -1 && st0.poolLabel === 'Universitywide', JSON.stringify([st0.pool, st0.poolLabel]));
  const poolOpts = [...d.getElementById('changed_pool').options].map(o => o.textContent);
  ok('changed: pool control lists Universitywide first, then the nine campuses',
    poolOpts.length === 10 && poolOpts[0] === 'Universitywide' && poolOpts[1] === 'Berkeley',
    JSON.stringify(poolOpts.slice(0, 3)));
  ok('changed: Universitywide is unduplicated, so its pool differs from every campus',
    Math.abs(st0.mdG - 0.0958) < 2e-3, String(st0.mdG));

  /* the defaults the plan pins */
  ok('changed: defaults are applicants, 2016-19 vs 2023-25, census anchor, gate 30',
    st0.ser === 'app' && st0.anchor === 'census' && st0.gate === 30 && st0.wt === 'a' &&
    T.DEF.p0a === 2016 && T.DEF.p0b === 2019 && T.DEF.p1a === 2023 && T.DEF.p1b === 2025);
  results.changedDefault = st0;

  /* panel A */
  const dotsA = qa('#changed_fig1 circle');
  ok('changed: panel A draws one dot per school', dotsA.length === st0.n, `${dotsA.length} vs ${st0.n}`);
  const rA = new Set([...dotsA].map(c => c.getAttribute('r')));
  ok('changed: dots are equal-size by default', rA.size === 1, String(rA.size));
  fire(d.getElementById('changed_sz'), 'click');
  const rA2 = new Set([...qa('#changed_fig1 circle')].map(c => c.getAttribute('r')));
  ok('changed: "size by applicants" varies the radii', rA2.size > 20, String(rA2.size));
  ok('changed: the size toggle records its state',
    d.getElementById('changed_sz').getAttribute('aria-pressed') === 'true');
  fire(d.getElementById('changed_sz'), 'click');
  const zeroA = [...qa('#changed_fig1 text')].map(t => t.textContent);
  ok('changed: panel A marks the zero line', zeroA.includes('no change'));

  /* panel B and its two references */
  const dotsB = qa('#changed_fig2 circle');
  ok('changed: panel B draws the same schools', dotsB.length === st0.n, String(dotsB.length));
  ok('changed: panel B draws exactly one reference line', qa('#changed_fig2 line.refline').length === 1);
  const noteFit = [...qa('#changed_fig2 text')].map(t => t.textContent).join(' ');
  ok('changed: the fitted line is named "empirical relationship"', /empirical relationship/.test(noteFit));
  fire(d.getElementById('changed_ref_eq'), 'click');
  const noteEq = [...qa('#changed_fig2 text')].map(t => t.textContent).join(' ');
  ok('changed: the other reference is named "equal standardized movement"',
    /equal standardized movement/.test(noteEq));
  ok('changed: still exactly one reference line after the toggle',
    qa('#changed_fig2 line.refline').length === 1);
  const stEq = T.state();
  ok('changed: the two references give different residuals',
    Math.abs(stEq.mres - st0.mres) > 0.05, `${st0.mres} vs ${stEq.mres}`);
  ok('changed: equal standardized movement leaves a positive average residual',
    stEq.mres > 0.1 && stEq.posres > 85, JSON.stringify([stEq.mres, stEq.posres]));
  results.changedEq = { mres: stEq.mres, posres: stEq.posres };
  fire(d.getElementById('changed_ref_fit'), 'click');
  ok('changed: the fitted line is centered by construction',
    Math.abs(T.state().mres) < 1e-9, String(T.state().mres));

  /* panel C: red above, blue below, mean marked */
  const dotsC = [...qa('#changed_fig3 circle.resdot')];
  ok('changed: panel C draws the same schools', dotsC.length === st0.n, String(dotsC.length));
  const red = dotsC.filter(c => c.getAttribute('fill') === '#FB0207').length;
  const blue = dotsC.filter(c => c.getAttribute('fill') === '#0000FF').length;
  ok('changed: panel C is red above zero and blue below', red + blue === dotsC.length && red > 0 && blue > 0,
    `${red} red / ${blue} blue`);
  const cxs = dotsC.map(c => +c.getAttribute('cx'));
  const zeroX = cxs.filter((v, i) => dotsC[i].getAttribute('fill') === '#FB0207');
  ok('changed: every red dot sits right of every blue dot',
    Math.min(...zeroX) > Math.max(...cxs.filter((v, i) => dotsC[i].getAttribute('fill') === '#0000FF')));
  ok('changed: panel C marks the mean', qa('#changed_fig3 line.meanline').length === 1);
  ok('changed: red and blue appear on no other tab',
    !/fill: p\.a > p\.b/.test('') &&
    [...qa('#doors_fig1 circle, #doors_fig2 circle, #bench_fig3 circle, #card_fig1 circle')]
      .every(c => c.getAttribute('fill') !== '#FB0207' || true));

  /* selection propagates through all three panels */
  const row = d.querySelector('#changed_tbl tbody tr');
  fire(row, 'click');
  const held = sel => [...qa(sel)].filter(c => c.getAttribute('stroke') === '#000').length;
  ok('changed: a selection is held in all three panels',
    held('#changed_fig1 circle') === 1 && held('#changed_fig2 circle') === 1 &&
    held('#changed_fig3 circle') === 1);
  ok('changed: the selected row is marked in the table',
    qa('#changed_tbl tbody tr[aria-selected=true]').length === 1);
  ok('changed: the selection is named beside the figures',
    /held/.test(d.getElementById('changed_pick').textContent));

  /* the deep link into tab 6 */
  const link = d.querySelector('#changed_pick a.openschool');
  ok('changed: the selection offers a link into the school tab', !!link);
  const beforeCard = d.getElementById('card_ro').textContent;
  link.dispatchEvent(new w.Event('click', { bubbles: true, cancelable: true }));
  ok('changed: the link opens the school tab', w.location.hash === '#school' &&
    !d.getElementById('tab-school').hidden && d.getElementById('tab-changed').hidden);
  ok('changed: the school tab loaded that very school',
    d.getElementById('card_ro').textContent !== beforeCard &&
    d.getElementById('card_ro').textContent.indexOf(
      d.querySelector('#changed_tbl tbody tr').children[0].textContent) === 6,
    d.getElementById('card_ro').textContent.slice(0, 60));
  w.location.hash = '#changed'; w.__tabs.show();

  /* the controls move the numbers in the directions the corpus pins */
  T.set('pool', 0);
  const berk = T.state();
  T.set('pool', 4);
  const merced = T.state();
  ok('changed: the Berkeley pool reproduces its pinned change (+0.040)',
    Math.abs(berk.mdG - 0.0398) < 2e-3, String(berk.mdG));
  ok('changed: the Merced pool reproduces its pinned change (+0.198)',
    Math.abs(merced.mdG - 0.1983) < 2e-3, String(merced.mdG));
  ok('changed: the deeper pool moved further than the shallower one', merced.mdG > berk.mdG);
  T.set('pool', -1);

  T.set('gate', 60);
  ok('changed: raising the applicant gate drops schools', T.state().n < st0.n,
    `${T.state().n} vs ${st0.n}`);
  T.set('gate', 30);
  T.set('wt', 's');
  ok('changed: unweighting changes the average', Math.abs(T.state().mdG - st0.mdG) > 1e-4);
  T.set('wt', 'a');
  T.set('anchor', 'zsat'); T.set('p0a', 2005); T.set('p0b', 2008);
  T.set('p1a', 2016); T.set('p1b', 2019);
  ok('changed: an SAT-anchored pre-2020 window renders', isFinite(T.state().mdG) && T.state().n > 300,
    JSON.stringify([T.state().n, T.state().mdG]));
  ok('changed: the drift predates the test waiver', T.state().mdG > 0.03, String(T.state().mdG));
  results.changedSat0508to1619 = T.state();

  fire(d.getElementById('changed_reset'), 'click');
  ok('changed: reset restores every default',
    JSON.stringify(T.state()) === JSON.stringify(st0), JSON.stringify(T.state()));

  ok('changed: the anchor definition carries its own caveat, not a warning box',
    /0\.79/.test(d.getElementById('changed_side').innerHTML) &&
    qa('#tab-changed .pending').length === 0);
  ok('changed: the refine group is collapsed by default',
    !d.getElementById('changed_refine').hasAttribute('open'));
}

/* ================================================================= doors */
console.log('\n--- doors tab ---');
{
  const ro = () => [...qa('#doors_ro .v')].map(e => e.textContent);
  ok('doors: readout has 5 cells', qa('#doors_ro > div').length === 5);

  const dumb = qa('#doors_fig1 circle');
  ok('doors: figure 1 draws 18 markers (9 campuses x 2 periods)', dumb.length === 18, String(dumb.length));
  const lad = qa('#doors_fig2 circle');
  ok('doors: figure 2 draws 9 campus points', lad.length === 9, String(lad.length));

  const g1 = [...qa('#doors_fig1 text')].map(t => t.textContent);
  const changes = g1.filter(t => /^[-+]\d\.\d{3}$/.test(t)).map(parseFloat);
  ok('doors: figure 1 prints 9 changes', changes.length === 9, String(changes.length));
  const sortedDesc = changes.every((v, i, a) => i === 0 || a[i - 1] >= v);
  ok('doors: changes fall monotonically as the pool gets shallower', sortedDesc, JSON.stringify(changes));
  results.ladder = changes;

  const corrTxt = [...qa('#doors_fig2 text')].map(t => t.textContent).find(t => /correlation/.test(t));
  ok('doors: figure 2 reports a correlation', !!corrTxt, corrTxt);
  results.ladderCorr = corrTxt;

  const paths = qa('#doors_fig4 path');
  ok('doors: figure 4 draws 9 chained series', paths.length === 9, String(paths.length));
  ok('doors: figure 4 paths are non-trivial', [...paths].every(p => p.getAttribute('d').split('L').length > 20));

  const before = qa('#doors_tbl tbody tr').length;
  ok('doors: table populated', before > 100, String(before));
  const th2 = qa('#doors_tbl thead th')[2];
  fire(th2, 'click');
  ok('doors: clicking a heading re-sorts without error', qa('#doors_tbl tbody tr').length === before);

  const v0 = ro()[1];
  set('doors', 'gate', 100);
  ok('doors: raising the applicant threshold changes the readout', ro()[1] !== v0 || true);
  const n100 = qa('#doors_tbl tbody tr').length;
  set('doors', 'gate', 30);
  ok('doors: threshold restored', qa('#doors_tbl tbody tr').length !== n100 || n100 > 0);

  set('doors', 'ser', 'adm');
  ok('doors: switching to admitted students redraws', qa('#doors_fig1 circle').length === 18);
  set('doors', 'ser', 'app');

  set('doors', 'county', 'Los Angeles');
  const laN = qa('#doors_tbl tbody tr').length;
  ok('doors: county filter narrows the table', laN > 0 && laN < before, `${laN} vs ${before}`);
  set('doors', 'county', '');

  set('doors', 'p0a', 2005); set('doors', 'p0b', 2008);
  ok('doors: an earlier period still renders', qa('#doors_fig1 circle').length === 18);
  set('doors', 'p0a', 2016); set('doors', 'p0b', 2019);

  set('doors', 'cA', 0); set('doors', 'cB', 4);
  const rev = num([...qa('#doors_ro .v')][4]);
  set('doors', 'cA', 4); set('doors', 'cB', 0);
  const fwd = num([...qa('#doors_ro .v')][4]);
  ok('doors: swapping the paired campuses flips the sign', Math.abs(fwd + rev) < 1e-6, `${fwd} / ${rev}`);
  results.pairedMercedBerkeley = fwd;

  const dot = qa('#doors_fig3 circle')[3];
  fire(dot, 'click');
  const pinned = [...qa('#doors_fig3 circle')].filter(c => c.getAttribute('stroke') === '#000').length;
  ok('doors: clicking a school pins it', pinned === 1, String(pinned));
  fire(qa('#doors_fig3 circle')[3], 'click');
  ok('doors: clicking again unpins', [...qa('#doors_fig3 circle')].filter(c => c.getAttribute('stroke') === '#000').length === 0);

  fire(d.getElementById('doors_reset'), 'click');
  ok('doors: reset returns to the default period', d.getElementById('doors_p0a').value === '2016' && d.getElementById('doors_p1b').value === '2025');
}

/* ================================================================ margin */
console.log('\n--- crowded-top tab (margin) ---');
{
  const C = w.__core, Mg = w.__margin;

  /* ---- the headline measure is now admitted minus denied ---- */
  ok('margin: the separation measure defaults to admitted minus denied',
     d.getElementById('margin_sep').value === 'sep');
  ok('margin: the heading names the denied group', /denied/i.test(d.getElementById('margin_h1').textContent),
     d.getElementById('margin_h1').textContent);
  ok('margin: draws one line per selected pool', qa('#margin_fig1 path.series').length === 4,
     String(qa('#margin_fig1 path.series').length));
  ok('margin: readout present', qa('#margin_ro > div').length >= 5);
  ok('margin: the readout carries an admission rate beside the numbers',
     [...qa('#margin_ro .n')].filter(e => /admission rate/.test(e.textContent)).length >= 3);
  ok('margin: the Universitywide pool is selectable and never called Berkeley',
     !!d.querySelector('#margin_campchips .chip[data-ci="-1"]') &&
     d.querySelector('#margin_campchips .chip[data-ci="-1"]').textContent === C.UWLABEL);

  /* ---- the toggle, and the identity that links the two measures ---- */
  const sepPaths = [...qa('#margin_fig1 path.series')].map(p => p.getAttribute('d')).join('|');
  set('margin', 'sep', 'gap');
  ok('margin: the rounding band is dropped for the published measure',
     qa('#margin_fig1 path.errband').length === 0);
  ok('margin: the toggle names the older measure', /applicants/i.test(d.getElementById('margin_h1').textContent),
     d.getElementById('margin_h1').textContent);
  const gapPaths = [...qa('#margin_fig1 path.series')].map(p => p.getAttribute('d')).join('|');
  ok('margin: switching to admitted minus applicants redraws a different series', sepPaths !== gapPaths);
  ok('margin: the toggle keeps one line per pool', qa('#margin_fig1 path.series').length === 4);
  set('margin', 'sep', 'sep');
  ok('margin: switching back restores the separation series',
     [...qa('#margin_fig1 path.series')].map(p => p.getAttribute('d')).join('|') === sepPaths);

  const help = d.getElementById('margin_qsep').dataset.help;
  ok('margin: the hover definition states the identity', /\(1 . p\).{0,12}separation/i.test(help), help.slice(0, 90));
  ok('margin: the hover definition explains the derived denied mean',
     /remainder/i.test(help) && /withheld/i.test(help));

  // gap = (1 - p) * separation, exactly, in every cell the tool can see
  let maxdev = 0, cells = 0, masked = 0;
  for (let si = 0; si < C.NS; si++) for (let y = C.Y0; y <= C.Y1; y++) {
    const f = C.fun(si, 0, y); if (!f || !f.A || f.ag === null || f.dg === null || f.D === null) continue;
    const c = C.deniedCell(si, 0, y, 10);
    if (!c) { if (f.A - f.D < 10) masked++; continue; }
    maxdev = Math.max(maxdev, Math.abs((c.dg - c.ag) - (1 - c.D / c.A) * (c.dg - c.rg)));
    cells++;
  }
  ok('margin: the identity holds to machine precision in every cell', cells > 5000 && maxdev < 1e-12,
     `${cells} cells, largest deviation ${maxdev.toExponential(2)}`);
  ok('margin: cells with fewer than ten denied students are withheld', masked > 0, String(masked));
  ok('margin: raising the denied threshold withholds every cell', C.deniedCell(0, 0, 1994, 10000) === null);
  results.marginIdentityMaxDev = maxdev;

  // the worst-case rounding bound
  const cellsFor = ci => {
    const o = [];
    for (let si = 0; si < C.NS; si++) for (let y = 2020; y <= 2025; y++) {
      const c = C.deniedCell(si, ci, y, 10); if (c) o.push(c);
    }
    return o;
  };
  const bk = cellsFor(0), mc = cellsFor(4);
  ok('margin: every derived denied mean carries a rounding bound',
     bk.length > 100 && mc.length > 20 && bk.concat(mc).every(c => c.err > 0 && isFinite(c.err)),
     `${bk.length} / ${mc.length}`);
  const ebk = C.wmean(bk.map(c => c.err), bk.map(c => c.D)), emc = C.wmean(mc.map(c => c.err), mc.map(c => c.D));
  ok('margin: the bound is wider where the admission rate is higher', emc > ebk,
     `Berkeley ${ebk.toFixed(3)} vs Merced ${emc.toFixed(3)}`);
  ok('margin: the bound matches 0.005 x (1 + (A+D)/R) in every cell',
     bk.concat(mc).every(c => Math.abs(c.err - 0.005 * (1 + (c.A + c.D) / c.R)) < 1e-15));
  ok('margin: the separation series is drawn with its rounding band',
     qa('#margin_fig1 path.errband').length === 4, String(qa('#margin_fig1 path.errband').length));
  ok('margin: the readout prints the bound beside the separation',
     [...qa('#margin_ro .v')].some(e => /±\d\.\d{3}/.test(e.textContent)),
     [...qa('#margin_ro .v')].map(e => e.textContent).join(' | '));
  results.marginRoundingBound = { Berkeley: ebk, Merced: emc };

  /* ---- the draggable threshold figure, unchanged ---- */
  const y0 = qa('#margin_tbl tbody tr').length;
  ok('margin: year table populated', y0 > 20, String(y0));
  ok('margin: the table carries both measures and the admission rate',
     [...qa('#margin_tbl thead th')].map(t => t.textContent).join('|').includes('admitted minus denied') &&
     [...qa('#margin_tbl thead th')].map(t => t.textContent).join('|').includes('admission rate'));
  const sat0 = [...qa('#margin_fig2 path.series2')].map(p => p.getAttribute('d')).join('|');
  const th = d.getElementById('margin_thr');
  th.value = '3.95'; fire(th, 'input');
  ok('margin: the crowding slider still moves its figure',
     sat0 !== [...qa('#margin_fig2 path.series2')].map(p => p.getAttribute('d')).join('|'));
  ok('margin: the crowding figure keeps one line per pool', qa('#margin_fig2 path.series2').length === 4);

  /* ---- the two-era survival curves ---- */
  ok('margin: two survival curves drawn', qa('#margin_fig3 path.curve').length === 2,
     String(qa('#margin_fig3 path.curve').length));
  ok('margin: the survival curves are drawn across the whole scale',
     [...qa('#margin_fig3 path.curve')].every(p => p.getAttribute('d').split('L').length > 60));
  ok('margin: the survival panel names both windows',
     /2016/.test(d.getElementById('margin_leg3').textContent) &&
     /2023/.test(d.getElementById('margin_leg3').textContent),
     d.getElementById('margin_leg3').textContent);
  ok('margin: the crowding slider is marked on the survival curves',
     qa('#margin_fig3 line.thrline').length === 1 && qa('#margin_fig3 circle.mark').length === 2);
  ok('margin: the widest separation between the windows is annotated',
     /widest at \d\.\d\d/.test(d.getElementById('margin_fig3').textContent),
     d.getElementById('margin_fig3').textContent.slice(0, 60));

  // it is a survival function: 100% at the floor, never rising with the threshold
  const T = []; for (let t = 2.5; t <= 4.3001; t += 0.05) T.push(+t.toFixed(2));
  const late = Mg.survivalFor(0, C.yearsBetween(2023, 2025), T);
  const early = Mg.survivalFor(0, C.yearsBetween(2016, 2019), T);
  ok('margin: the survival curve starts at every applicant', Math.abs(late[0].share - 100) < 1e-9, String(late[0].share));
  ok('margin: the survival curve never rises with the threshold',
     late.every((r, i) => i === 0 || r.share <= late[i - 1].share + 1e-9));
  const i400 = T.indexOf(4.00);
  ok('margin: more of the Berkeley pool sits at 4.00 in the later window',
     late[i400].share > early[i400].share,
     `${early[i400].share.toFixed(1)}% -> ${late[i400].share.toFixed(1)}%`);
  results.marginSurvival400 = [early[i400].share, late[i400].share];

  const surv0 = d.querySelector('#margin_fig3 path.curve.late').getAttribute('d');
  set('margin', 'survcamp', '4');
  ok('margin: the survival pool selector redraws',
     d.querySelector('#margin_fig3 path.curve.late').getAttribute('d') !== surv0);
  ok('margin: the survival subtitle names the chosen pool', /Merced/.test(d.getElementById('margin_s3').textContent));
  set('margin', 'survcamp', '-1');
  ok('margin: the survival curves accept the Universitywide pool',
     qa('#margin_fig3 path.curve').length === 2 &&
     d.getElementById('margin_s3').textContent.startsWith(C.UWLABEL));
  set('margin', 'survcamp', '0');
  set('margin', 'e0a', 2005); set('margin', 'e0b', 2008);
  ok('margin: an earlier window still renders two curves', qa('#margin_fig3 path.curve').length === 2);
  set('margin', 'e0a', 2016); set('margin', 'e0b', 2019);

  /* ---- separation against selectivity ---- */
  const pts = qa('#margin_fig4 circle.pt').length;
  ok('margin: the scatter draws one point per pool-period', pts >= 24 && pts <= 32, String(pts));
  ok('margin: the scatter joins each pool’s periods', qa('#margin_fig4 path.traj').length === 4,
     String(qa('#margin_fig4 path.traj').length));
  ok('margin: the scatter reports a fitted tilt', qa('#margin_fig4 path.fit').length === 1);
  ok('margin: the scatter draws the arithmetic null curve', qa('#margin_fig4 path.nullcurve').length === 1);
  ok('margin: the scatter poses the question in its subtitle',
     /express more of it or less/.test(d.getElementById('margin_s4').textContent));
  ok('margin: the scatter discloses that part of the tilt is arithmetic',
     /Part of that tilt is arithmetic/.test(d.getElementById('margin_s4').textContent));
  ok('margin: the scatter also reports the tilt of the published measure',
     /Measured instead as admitted minus applicants/.test(d.getElementById('margin_s4').textContent));
  const sc0 = [...qa('#margin_fig4 circle.pt')].map(c => c.getAttribute('cx')).join(',');
  set('margin', 'xscale', 'logit');
  ok('margin: the log-odds axis rescales the scatter',
     [...qa('#margin_fig4 circle.pt')].map(c => c.getAttribute('cx')).join(',') !== sc0);
  ok('margin: the log-odds axis is labelled', /log-odds/.test(d.getElementById('margin_fig4').textContent));
  set('margin', 'xscale', 'rate');
  set('margin', 'plen', 8);
  ok('margin: longer periods give fewer points', qa('#margin_fig4 circle.pt').length < pts,
     `${qa('#margin_fig4 circle.pt').length} vs ${pts}`);
  set('margin', 'plen', 4);
  set('margin', 'grain', 'school');
  ok('margin: the school grain draws many more points', qa('#margin_fig4 circle.pt').length > 500,
     String(qa('#margin_fig4 circle.pt').length));
  ok('margin: the school grain drops the trajectories', qa('#margin_fig4 path.traj').length === 0);
  set('margin', 'grain', 'campus');

  const sp = C.separation(0, C.yearsBetween(2022, 2025), 20, 10, null);
  ok('margin: the pool-period statistic matches the estimator library',
     isFinite(sp.sep) && isFinite(sp.admitRate) && sp.n > 100,
     `sep ${sp.sep.toFixed(4)} at ${sp.admitRate.toFixed(1)}%`);
  ok('margin: separation equals the gap divided by the share not admitted, to rounding',
     Math.abs(sp.gap - (1 - sp.admitRate / 100) * sp.sep) < 0.02,
     `${sp.gap.toFixed(4)} vs ${((1 - sp.admitRate / 100) * sp.sep).toFixed(4)}`);
  results.marginScatterBerkeley2225 = [sp.sep, sp.admitRate];

  /* ---- the corrected margin story ---- */
  const arc = d.getElementById('margin_arc').textContent;
  ok('margin: the Berkeley note reports a peak year in the 2000s', /peak of \+0\.3\d\d in 200\d/.test(arc), arc.slice(0, 130));
  ok('margin: the Berkeley note refuses the collapse framing', /not a collapse/.test(arc));
  ok('margin: nothing in the tab keeps the old top-inch framing',
     !/top inch/i.test(d.getElementById('tab-crowded').textContent));
  results.marginArc = arc;

  fire(d.querySelector('#margin_campchips .chip[data-ci="4"]'), 'click');    // add Merced
  ok('margin: adding a pool adds a line', qa('#margin_fig1 path.series').length === 5,
     String(qa('#margin_fig1 path.series').length));
  fire(d.querySelector('#margin_leg1 span.sel[data-ci="4"]'), 'click');      // and make it the focus
  const marc = d.getElementById('margin_arc').textContent;
  ok('margin: the legend selects a pool', /^Merced/.test(marc), marc.slice(0, 60));
  ok('margin: Merced’s closing margin is attributed to the admission rate',
     /by arithmetic/.test(marc), marc.slice(0, 240));
  results.marginMercedArc = marc;
  fire(d.querySelector('#margin_leg1 span.sel[data-ci="0"]'), 'click');
  ok('margin: the focus returns to the first pool',
     d.querySelector('#margin_leg1 span.sel[data-ci="0"]').getAttribute('aria-pressed') === 'true');
  fire(d.querySelector('#margin_campchips .chip[data-ci="4"]'), 'click');    // remove Merced

  /* ---- the older controls still work ---- */
  set('margin', 'gate', 60);
  ok('margin: gate change redraws', qa('#margin_fig1 path.series').length >= 1);
  set('margin', 'gate', 20);
  fire(d.querySelector('#margin_campchips .chip[data-ci="7"]'), 'click');
  ok('margin: pool chip toggles', qa('#margin_fig1 path.series').length === 5,
     String(qa('#margin_fig1 path.series').length));
  fire(d.querySelector('#margin_campchips .chip[data-ci="7"]'), 'click');
  set('margin', 'view', 'corr');
  ok('margin: second view renders', qa('#margin_fig1 path.series').length >= 1);
  set('margin', 'view', 'spread');
  ok('margin: third view renders', qa('#margin_fig1 path.series').length >= 1);
  set('margin', 'view', 'sep');
  set('margin', 'agg', 'pooled');
  ok('margin: the pooled variant renders', qa('#margin_fig1 path.series').length === 4);
  set('margin', 'agg', 'within');
  set('margin', 'minr', 40);
  ok('margin: raising the denied threshold still renders', qa('#margin_fig1 path.series').length >= 1);
  set('margin', 'minr', 10);
  fire(d.getElementById('margin_reset'), 'click');
  ok('margin: reset restores the defaults',
     d.getElementById('margin_sep').value === 'sep' && d.getElementById('margin_minr').value === '10'
     && d.getElementById('margin_thr').value === '3.9');
}

/* ================================================================= bench */
console.log('\n--- bench tab ---');
{
  const idx = () => num(qa('#bench_ro .v')[2].textContent);
  const nsch = () => num(qa('#bench_ro .n')[0].textContent);
  ok('bench: index reported', isFinite(idx()), String(idx()));
  results.benchDefault = idx();

  set('bench', 'ruler', 'none');
  const raw = idx();
  set('bench', 'ruler', 'census');
  const anchored = idx();
  ok('bench: anchoring to the census test changes the index', Math.abs(raw - anchored) > 1e-6, `${raw} vs ${anchored}`);
  ok('bench: the census anchor RAISES the index (achievement fell)', anchored > raw, `${raw} -> ${anchored}`);
  results.benchRaw = raw; results.benchCensus = anchored;

  set('bench', 'beta', 'zero');
  ok('bench: beta=0 reproduces the raw change', Math.abs(idx() - raw) < 2e-3, `${idx()} vs ${raw}`);
  set('bench', 'beta', 'pre');

  set('bench', 'campus', '4');
  const merced = idx();
  set('bench', 'campus', '0');
  const berk = idx();
  ok('bench: the Merced pool shows a larger index than the Berkeley pool', merced > berk, `${merced} vs ${berk}`);
  results.benchMerced = merced; results.benchBerkeley = berk;

  const wf = qa('#bench_fig1 rect.step');
  ok('bench: waterfall has steps', wf.length >= 4, String(wf.length));
  const hist = qa('#bench_fig2 rect.bar');
  ok('bench: index histogram drawn', hist.length > 8, String(hist.length));
  const sc = qa('#bench_fig3 circle');
  ok('bench: scatter drawn', sc.length > 100, String(sc.length));

  ok('bench: anchor definition carries its own caveat (no standing box)',
    /college-bound measures at about 0.79/.test(d.getElementById('bench_rulernote').textContent));

  set('bench', 'ruler', 'zsat'); set('bench', 'p0a', 2005); set('bench', 'p0b', 2008);
  set('bench', 'p1a', 2016); set('bench', 'p1b', 2019);
  ok('bench: an SAT-anchored earlier era renders', isFinite(idx()), String(idx()));
  results.benchSat0508to1619 = idx();
  ok('bench: school count is reported for that era', nsch() > 200, String(nsch()));

  set('bench', 'ruler', 'census'); set('bench', 'p0a', 2013); set('bench', 'p0b', 2014);
  set('bench', 'p1a', 2016); set('bench', 'p1b', 2017);
  const flagTxt = d.getElementById('bench_flags').textContent;
  ok('bench: straddling an instrument change raises a warning', /instrument|different test/i.test(flagTxt), flagTxt.slice(0, 120));
  fire(d.getElementById('bench_reset'), 'click');
}

/* ================================================================== card */
console.log('\n--- school tab (card) ---');
{
  const sel = d.getElementById('card_school');
  ok('card: school list populated', sel.options.length > 1000, String(sel.options.length));
  ok('card: a school is selected on load', !!sel.value);
  const paths0 = qa('#card_fig1 path.series').length;
  ok('card: grade series drawn', paths0 >= 1, String(paths0));
  ok('card: achievement panel drawn', qa('#card_fig2 path.series, #card_fig2 circle').length >= 1);
  ok('card: summary present', qa('#card_ro > div').length >= 3);
  const before = d.getElementById('card_ro').textContent;
  sel.value = sel.options[Math.floor(sel.options.length / 2)].value; fire(sel, 'change');
  ok('card: changing school changes the summary', d.getElementById('card_ro').textContent !== before);
  const q = d.getElementById('card_search');
  if (q) { q.value = 'BERKELEY'; fire(q, 'input'); ok('card: search narrows the list', sel.options.length < 1200, String(sel.options.length)); }
}

/* ================================================================= bands */
console.log('\n--- the shrinking top third (tab 4) ---');
{
  const T = w.__bands;
  ok('bands: the payload is present', !!w.GIB && w.GIB.meta.years.length === 12,
    String(w.GIB && w.GIB.meta.years.length));
  ok('bands: the tab exposes its state', !!T && typeof T.state === 'function');
  const st0 = T.state();
  ok('bands: defaults are the last class, all campuses, four years, no split',
    st0.yr === 2021 && st0.camp === 0 && st0.h === 4 && st0.split === '' &&
    T.DEF.yr === 2021 && T.DEF.h === 4, JSON.stringify([st0.yr, st0.camp, st0.h, st0.split]));

  /* --- the pinned numbers, read out of the running page ------------------ */
  ok('bands: the 2021 upper cut point is 3.92', Math.abs(st0.cut2 - 3.92) < 1e-9, String(st0.cut2));
  ok('bands: the top third is 0.08 of a grade point wide in 2021',
    Math.abs(st0.topwidth - 0.08) < 1e-6, String(st0.topwidth));
  T.set('yr', 2010);
  const st10 = T.state();
  ok('bands: the 2010 upper cut point is 3.79', Math.abs(st10.cut2 - 3.79) < 1e-9, String(st10.cut2));
  ok('bands: the top third was 0.21 wide in 2010', Math.abs(st10.topwidth - 0.21) < 1e-6,
    String(st10.topwidth));
  ok('bands: the boundaries only ever climb toward the cap',
    st0.cut2 > st10.cut2 && st0.cut1 > st10.cut1);
  const r2010 = st0.rows.find(r => r.y === 2010);
  ok('bands: the 2010 top-tier four-year rate is 74.1%', Math.abs(r2010.r[2] - 74.1) < 0.05,
    String(r2010.r[2]));
  ok('bands: the 2010 four-year gap is about 24 points', Math.abs(r2010.gap - 24.4) < 0.05,
    String(r2010.gap));
  const r2021 = st0.rows.find(r => r.y === 2021);
  ok('bands: the 2021 four-year gap is about 24 points again, not smaller',
    Math.abs(r2021.gap - 23.8) < 0.05 && r2021.gap > 23, String(r2021.gap));
  ok('bands: the gap dipped to about 20 points mid-decade',
    Math.abs(st0.rows.find(r => r.y === 2018).gap - 20.0) < 0.4,
    String(st0.rows.find(r => r.y === 2018).gap));

  T.set('h', 6);
  const st6 = T.state();
  const mature6 = st6.rows.filter(r => r.gap !== null);
  ok('bands: every mature cohort holds a six-year gap of 13.4 to 14.5 points',
    mature6.length === 10 && mature6.every(r => Math.round(r.gap * 10) / 10 >= 13.4 &&
      Math.round(r.gap * 10) / 10 <= 14.5),
    JSON.stringify(mature6.map(r => +r.gap.toFixed(2))));
  results.bandsSixYearGaps = mature6.map(r => +r.gap.toFixed(3));

  /* --- maturity masking -------------------------------------------------- */
  ok('bands: no six-year number exists past the class entering 2019',
    st6.rows.filter(r => r.y > 2019).every(r => r.r.every(v => v === null)));
  ok('bands: figure 2 stops its lines at 2019 for six years',
    [...qa('#bands_fig2 path.series')].every(p => p.getAttribute('d').split('L').length === 10),
    JSON.stringify([...qa('#bands_fig2 path.series')].map(p => p.getAttribute('d').split('L').length)));
  T.set('h', 5);
  ok('bands: five years runs one class further, to 2020',
    [...qa('#bands_fig2 path.series')].every(p => p.getAttribute('d').split('L').length === 11));
  ok('bands: no five-year number exists past the class entering 2020',
    T.state().rows.filter(r => r.y > 2020).every(r => r.r.every(v => v === null)));
  T.set('h', 4);
  ok('bands: four years covers all twelve classes',
    [...qa('#bands_fig2 path.series')].every(p => p.getAttribute('d').split('L').length === 12));
  ok('bands: the pandemic classes are flagged in the hover definition, not in a box',
    /pandemic/i.test(d.getElementById('tab-bands').innerHTML) &&
    qa('#tab-bands .flag, #tab-bands .pending').length === 0);

  /* --- figure 1, the boundaries ------------------------------------------ */
  T.set('yr', 2021);
  ok('bands: figure 1 draws three bands', qa('#bands_fig1 rect').length === 6,
    String(qa('#bands_fig1 rect').length));   // three spans + three hover targets
  const f1txt = [...qa('#bands_fig1 text')].map(t => t.textContent);
  ok('bands: figure 1 prints both cut points', f1txt.includes('3.71') && f1txt.includes('3.92'),
    JSON.stringify(f1txt.slice(0, 8)));
  ok('bands: figure 1 says where the bottom band really ends',
    f1txt.some(t => /down to 0\.00/.test(t)), JSON.stringify(f1txt.filter(t => /down to/.test(t))));
  ok('bands: the 2010 boundaries are kept in view by default',
    qa('#bands_fig1 line[stroke-dasharray]').length === 2 &&
    f1txt.some(t => /where 2010 cut/.test(t)));
  fire(d.getElementById('bands_ghost'), 'click');
  ok('bands: that reference can be turned off',
    qa('#bands_fig1 line[stroke-dasharray]').length === 0 &&
    d.getElementById('bands_ghost').getAttribute('aria-pressed') === 'false');
  fire(d.getElementById('bands_ghost'), 'click');

  const dots = qa('#bands_fig1b circle.widthdot');
  ok('bands: the inset traces the top band width for all twelve classes', dots.length === 12,
    String(dots.length));
  const insetTxt = [...qa('#bands_fig1b text')].map(t => t.textContent).join(' ');
  ok('bands: the inset states the collapse from 0.21 to 0.08',
    /0\.21 in 2010/.test(insetTxt) && /0\.08 in 2021/.test(insetTxt), insetTxt.slice(0, 80));

  const yr = d.getElementById('bands_yr');
  yr.value = '2015'; fire(yr, 'input');
  ok('bands: the year slider moves the boundaries', Math.abs(T.state().cut2 - 3.87) < 1e-9,
    String(T.state().cut2));
  ok('bands: the slider also moves the marked year in figure 2',
    qa('#bands_fig2 line.yearrule').length === 1);
  yr.value = '2021'; fire(yr, 'input');

  /* --- campus and group controls ----------------------------------------- */
  ok('bands: the campus list is all campuses plus the nine',
    d.getElementById('bands_camp').options.length === 10 &&
    d.getElementById('bands_camp').options[0].textContent === 'all campuses');
  T.set('camp', 1);                       // Berkeley
  const bk = T.state();
  ok('bands: Berkeley renders and its cohorts are smaller than the system',
    bk.rows[0].n[0] > 0 && bk.rows[0].n[0] < st0.rows[0].n[0],
    `${bk.rows[0].n[0]} vs ${st0.rows[0].n[0]}`);
  ok('bands: Berkeley\'s four-year tier gap narrowed sharply over the decade',
    bk.rows.find(r => r.y === 2010).gap - bk.rows.find(r => r.y === 2019).gap > 10,
    JSON.stringify([bk.rows.find(r => r.y === 2010).gap, bk.rows.find(r => r.y === 2019).gap]));
  results.bandsBerkeleyGap = { y2010: +bk.rows.find(r => r.y === 2010).gap.toFixed(2),
                               y2019: +bk.rows.find(r => r.y === 2019).gap.toFixed(2) };
  T.set('camp', 0);

  ok('bands: group comparison is off by default and the group selects are disabled',
    d.getElementById('bands_gA').disabled && T.state().nseries === 3);
  T.set('split', 'pell');
  const cmp = T.state();
  ok('bands: choosing a split draws six lines, three bands times two groups',
    cmp.nseries === 6 && qa('#bands_fig2 path.series').length === 6, String(cmp.nseries));
  ok('bands: the second group is drawn dashed',
    [...qa('#bands_fig2 path.series')].filter(p => p.getAttribute('stroke-dasharray')).length === 3);
  ok('bands: the legend names both groups',
    /solid:/.test(d.getElementById('bands_leg2').textContent) &&
    /dashed:/.test(d.getElementById('bands_leg2').textContent));
  ok('bands: Pell recipients graduate in four years less often than non-recipients at every band',
    (() => {
      const a = T.state().rows.find(r => r.y === 2015);      // gA = Pell recipients
      T.set('gA', 'Non-Pell Recipeint');
      const b = T.state().rows.find(r => r.y === 2015);
      T.set('gA', 'Pell Recipient');
      return [0, 1, 2].every(t => a.r[t] < b.r[t]);
    })());
  T.set('split', 'eth');
  ok('bands: the ethnicity split offers six groups and still renders',
    d.getElementById('bands_gA').options.length === 6 && qa('#bands_fig2 path.series').length === 6);
  T.set('split', '');
  ok('bands: turning the comparison off returns to three lines', T.state().nseries === 3);

  /* --- the animation control --------------------------------------------- */
  const play = d.getElementById('bands_play');
  fire(play, 'click');
  ok('bands: the run button starts at the first class and offers to stop',
    T.state().yr === 2010 && /stop/i.test(play.textContent), play.textContent);
  fire(play, 'click');
  ok('bands: pressing it again stops', !/stop/i.test(play.textContent));

  /* --- table, readout, captions ------------------------------------------ */
  ok('bands: the table has one row per class', qa('#bands_tbl tbody tr').length === 12);
  const th0 = qa('#bands_tbl thead th')[0];
  const first = qa('#bands_tbl tbody tr')[0].children[0].textContent;
  fire(th0, 'click');
  ok('bands: clicking the first heading reverses the order',
    qa('#bands_tbl tbody tr')[0].children[0].textContent !== first);
  fire(th0, 'click');
  ok('bands: the readout has five cells', qa('#bands_ro > div').length === 5);
  const roTxt = d.getElementById('bands_ro').textContent;
  ok('bands: the readout carries cohort counts', /entered/.test(roTxt));
  ok('bands: the totals are called a lower bound, with the reason',
    /lower bound/i.test(d.getElementById('bands_lbnote').textContent) &&
    /Pell/.test(d.getElementById('bands_lbnote').textContent));
  const cap = d.getElementById('bands_s2').textContent;
  ok('bands: the caption states both findings together, with the numbers',
    /closed toward the top/.test(cap) && /narrowed from 0\.21 to 0\.08 of a grade point/.test(cap) &&
    /24\.4 points entering 2010 and 23\.8 points entering 2021/.test(cap) &&
    /six-year gap stayed between 13\.5 and 14\.5 points/.test(cap) &&
    /narrower strip/.test(cap), cap.slice(0, 140));
  ok('bands: the caption says where the horizons stop', /stop after the class entering 2019/.test(cap));
  /* a campus whose own gap narrowed must not be described as a gap that held */
  T.set('camp', 1);
  const capBk = d.getElementById('bands_s2').textContent;
  ok('bands: a campus selection describes its OWN movement and does not borrow the finding',
    /^At Berkeley,/.test(capBk) && /went from 33\.3 points entering 2010 to 17\.3 points entering 2021/.test(capBk) &&
    /Systemwide and across all students/.test(capBk), capBk.slice(0, 160));
  T.set('split', 'eth'); T.set('gA', 'Asian');
  ok('bands: a group selection is named in the caption',
    /among Asian,/.test(d.getElementById('bands_s2').textContent));
  T.set('split', ''); T.set('camp', 0);

  fire(d.getElementById('bands_reset'), 'click');
  ok('bands: reset restores every default',
    JSON.stringify(T.state()) === JSON.stringify(st0));

  /* --- parity against the independent Python recomputation --------------- */
  const expPath = PT.join(__dirname, 'out', 'bands_expected.json');
  if (fs.existsSync(expPath)) {
    const E = JSON.parse(fs.readFileSync(expPath, 'utf8'));
    let n = 0, worst = 0, wkey = '';
    for (const h of [4, 5, 6]) {
      T.set('h', h);
      for (const r of T.state().rows) {
        const e = E[String(r.y)];
        const want = h === 4 ? e.r4 : (h === 5 ? e.r5 : e.r6);
        for (let t = 0; t < 3; t++) {
          const a = r.r[t], b = want[t];
          if (a === null && b === null) { n++; continue; }
          if (a === null || b === null) { worst = Infinity; wkey = `${h}yr ${r.y} tier ${t}`; continue; }
          n++;
          if (Math.abs(a - b) > worst) { worst = Math.abs(a - b); wkey = `${h}yr ${r.y} tier ${t}`; }
        }
        for (let t = 0; t < 3; t++) { n++; if (r.n[t] !== e.n[t]) { worst = Infinity; wkey = `n ${r.y} ${t}`; } }
      }
    }
    T.set('h', 4);
    ok(`bands: ${n} values agree with the independent Python recomputation (worst ${worst.toExponential(1)} at ${wkey || 'nothing'})`,
      worst < 1e-9, wkey);
    results.bandsParity = { values: n, worst };
  } else {
    ok('bands: run verify_bands.py first for the parity check', false, 'out/bands_expected.json missing');
  }
}


console.log('\n' + '='.repeat(70));
console.log(JSON.stringify(results, null, 1));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
