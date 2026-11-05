#!/usr/bin/env python3
"""verify_bands.py — independent check of the tab 4 payload.

    python verify_bands.py

build_bands_data.py reads the LONG harvest file and anchors on the 4yr measure
row.  This file reads the WIDE harvest file instead, which carries the
University's OWN published cumulative rates (rate_grad_4yr/5yr/6yr_freshman_
cumulative) alongside the counts.  Two different files, two different columns,
one answer.  It then

  1. re-derives the band boundaries and every cell, and asserts the payload
     in ..\\data_bands.js matches value for value;
  2. checks each stored rate against UC's own published cumulative rate;
  3. cross-foots the cohort denominators three ways -- campus "All" against the
     sum of the nine campuses, the Pell split against the first-generation and
     ethnicity splits, and (for the two cohort years where UC publishes one)
     against the dashboard's own Overall sheet;
  4. prints the systemwide tier table and asserts the pinned checks:
        2010 top-tier four-year rate  = 74.1%
        2021 top boundary             = 3.92
        six-year top-minus-bottom gap = 13.4 to 14.5 points in every mature cohort
  5. writes out/bands_expected.json, which test_tools.js compares against what
     the browser actually computes.

Exit status is non-zero if anything fails.
"""
import csv
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(HERE)
OUT = os.path.join(HERE, 'out')

SRC = os.environ.get('BANDS_WIDE') or os.path.join(
    'C:' + os.sep, 'Users', 'harth', 'svetlana', 'outcomes data',
    'ug_outcomes_gpa_groups_summary_api_full', 'vizql_wide.csv')
if not os.path.exists(SRC):
    alt = os.path.join(os.sep, 'mnt', 'user-data', 'uploads', 'outcomes data',
                       'ug_outcomes_gpa_groups_summary_api_full', 'vizql_wide.csv')
    if os.path.exists(alt):
        SRC = alt

fails = 0
checks = 0


def ok(label, cond, extra=''):
    global fails
    if cond:
        print('PASS  ' + label)
    else:
        fails += 1
        print('FAIL  ' + label + ('  ' + str(extra) if extra else ''))


def num(v):
    v = (v or '').strip()
    if v == '' or v.lower() in ('null', 'nan', 'none'):
        return None
    return float(v)


def edges(rng):
    lo, hi = rng.split(' - ')
    return float(lo.strip()), float(hi.strip().lstrip('<'))


def md_table(header, rows):
    cols = [str(c) for c in header]
    rows = [[str(v) for v in r] for r in rows]
    w = [max(len(c), *(len(r[i]) for r in rows)) for i, c in enumerate(cols)]
    out = ['| ' + ' | '.join(c.ljust(w[i]) for i, c in enumerate(cols)) + ' |',
           '| ' + ' | '.join('-' * w[i] for i in range(len(cols))) + ' |']
    for r in rows:
        out.append('| ' + ' | '.join(r[i].ljust(w[i]) for i in range(len(cols))) + ' |')
    return '\n'.join(out)


def load_payload():
    p = os.path.join(SITE, 'data_bands.js')
    with open(p, encoding='utf-8') as fh:
        t = fh.read()
    i = t.index('{', t.index('window.GIB'))
    j = t.rindex('}') + 1
    return json.loads(t[i:j])


def main():
    global checks
    if not os.path.exists(SRC):
        sys.exit('source not found: %s  (set BANDS_WIDE)' % SRC)
    print('independent source: %s\n' % SRC)
    with open(SRC, encoding='utf-8', newline='') as fh:
        rows = [r for r in csv.DictReader(fh)
                if r['student_level'] == 'Freshman' and r['gpa_field'] == 'Tier_HSGPA_Range']
    main_rows = [r for r in rows if r['worksheet'] == 'a. HS GPAs']
    over_rows = [r for r in rows if r['worksheet'] == 'a. HS GPAs Overall']
    print('%d freshman band rows (%d on the Overall sheet)\n' % (len(main_rows), len(over_rows)))

    P = load_payload()
    M = P['meta']
    years, camps = M['years'], M['campuses']
    yi = {y: i for i, y in enumerate(years)}
    ci = {c: i for i, c in enumerate(camps)}

    # ---- boundaries --------------------------------------------------------
    ed = {}
    for r in main_rows:
        ed.setdefault(int(r['cohort_year']), set()).add(r['gpa_range'])
    rebuilt = {}
    for y, s in ed.items():
        iv = sorted(edges(x) for x in s)
        rebuilt[y] = [iv[0][0], iv[0][1], iv[1][1], iv[2][1]]
    ok('boundaries: the wide file reproduces every stored band edge',
       all(rebuilt[y] == P['edges'][yi[y]] for y in years),
       {y: (rebuilt[y], P['edges'][yi[y]]) for y in years if rebuilt[y] != P['edges'][yi[y]]})

    def tier_of(y, rng):
        lo = edges(rng)[0]
        e = rebuilt[y]
        return 0 if abs(lo - e[0]) < 1e-9 else (1 if abs(lo - e[1]) < 1e-9 else 2)

    # ---- every cell, rebuilt ----------------------------------------------
    # group_value -> (ci, yi, tier) -> [n, d4, d5, d6]
    grp = {}
    pub = {}                       # UC's own cumulative rates, for the same key
    for r in main_rows:
        y, c = int(r['cohort_year']), r['campus']
        n = num(r['cohort_denominator_inferred'])
        if n is None or n <= 0:
            continue
        k = (ci[c], yi[y], tier_of(y, r['gpa_range']))
        d4 = num(r['count_4yr']) or 0.0
        d5 = d4 + (num(r['count_5yr_only']) or 0.0)
        d6 = d5 + (num(r['count_6yr_only']) or 0.0)
        grp.setdefault(r['group_value'], {})[k] = [int(round(n)), int(round(d4)),
                                                   int(round(d5)), int(round(d6))]
        pub.setdefault(r['group_value'], {})[k] = [
            num(r['rate_grad_4yr_freshman_cumulative']),
            num(r['rate_grad_5yr_freshman_cumulative']),
            num(r['rate_grad_6yr_freshman_cumulative'])]

    mature = {int(k): v for k, v in M['mature'].items()}

    # (a) the stored group cubes
    bad = []
    for g, cube in P['grp'].items():
        for a in range(len(camps)):
            for b in range(len(years)):
                for t in range(3):
                    got = cube[a][b][t]
                    want = grp.get(g, {}).get((a, b, t))
                    if want is None:
                        if got is not None:
                            bad.append((g, camps[a], years[b], t, 'payload has a cell the source does not'))
                        continue
                    y = years[b]
                    exp = [want[0], want[1],
                           None if y > mature[5] else want[2],
                           None if y > mature[6] else want[3]]
                    checks += 4
                    if got != exp:
                        bad.append((g, camps[a], years[b], t, got, exp))
    ok('cells: every stored group cell matches the wide file', not bad, bad[:4])

    # (b) totals are the Pell split, summed
    pell = [g['key'] for s in M['splits'] if s['key'] == 'pell' for g in s['groups']]
    badt = []
    for a in range(len(camps)):
        for b in range(len(years)):
            for t in range(3):
                parts = [grp[g].get((a, b, t)) for g in pell]
                parts = [p for p in parts if p]
                got = P['tot'][a][b][t]
                if not parts:
                    if got is not None:
                        badt.append((camps[a], years[b], t, 'unexpected total'))
                    continue
                y = years[b]
                exp = [sum(p[0] for p in parts), sum(p[1] for p in parts),
                       None if y > mature[5] else sum(p[2] for p in parts),
                       None if y > mature[6] else sum(p[3] for p in parts)]
                checks += 4
                if got != exp:
                    badt.append((camps[a], years[b], t, got, exp))
    ok('totals: every total is the Pell split summed', not badt, badt[:4])

    # (c) the stored counts reproduce UC's own published cumulative rates
    worst = 0.0
    for g, cube in P['grp'].items():
        for a in range(len(camps)):
            for b in range(len(years)):
                for t in range(3):
                    cell = cube[a][b][t]
                    pr = pub.get(g, {}).get((a, b, t))
                    if not cell or not pr:
                        continue
                    for h, k in ((4, 1), (5, 2), (6, 3)):
                        if cell[k] is None or pr[h - 4] is None:
                            continue
                        checks += 1
                        worst = max(worst, abs(cell[k] / cell[0] - pr[h - 4]))
    ok('rates: stored counts reproduce UC\'s published cumulative rates (max |diff| %.2e)' % worst,
       worst < 1e-6, worst)

    # ---- cross-footing the denominators ------------------------------------
    # campus "All" against the sum of the nine named campuses
    off = []
    for b, y in enumerate(years):
        for t in range(3):
            allc = P['tot'][0][b][t]
            nine = [P['tot'][a][b][t] for a in range(1, len(camps))]
            if not allc or any(x is None for x in nine):
                continue
            checks += 1
            if allc[0] != sum(x[0] for x in nine):
                off.append((y, t, allc[0], sum(x[0] for x in nine)))
    ok('cross-foot: "All" equals the nine campuses summed, every cohort and tier', not off, off[:4])

    # the three splits against each other
    split_den = {}
    for s in M['splits']:
        keys = [g['key'] for g in s['groups']]
        d = {}
        for g in keys:
            for k, v in grp.get(g, {}).items():
                d[k] = d.get(k, 0) + v[0]
        split_den[s['key']] = d
    shortfall = []
    for k, v in split_den['pell'].items():
        for other in ('fgen', 'eth'):
            o = split_den[other].get(k)
            if o is None:
                continue
            checks += 1
            if o > v:
                shortfall.append((other, k, o, v))
    ok('cross-foot: no split ever exceeds the Pell split (so Pell is the least lossy total)',
       not shortfall, shortfall[:4])

    # against the dashboard's own Overall sheet, where UC publishes one
    ovr = {}
    for r in over_rows:
        y, c = int(r['cohort_year']), r['campus']
        n = num(r['cohort_denominator_inferred'])
        if n is None:
            continue
        ovr[(ci[c], yi[y], tier_of(y, r['gpa_range']))] = int(round(n))
    diff = []
    for k, n in ovr.items():
        got = P['tot'][k[0]][k[1]][k[2]]
        checks += 1
        if not got or got[0] != n:
            diff.append((camps[k[0]], years[k[1]], k[2], got and got[0], n))
    ok('cross-foot: totals equal UC\'s own Overall sheet in the %d cells it publishes'
       % len(ovr), not diff, diff[:4])
    if not ovr:
        print('      (note: the Overall sheet covers only some cohort years)')

    # ---- maturity ----------------------------------------------------------
    inc5 = {y: 0.0 for y in years}
    inc6 = {y: 0.0 for y in years}
    for r in main_rows:
        y = int(r['cohort_year'])
        inc5[y] += num(r['count_5yr_only']) or 0.0
        inc6[y] += num(r['count_6yr_only']) or 0.0
    ok('maturity: five-year observed through %d and six-year through %d' % (mature[5], mature[6]),
       mature[5] == max(y for y in years if inc5[y] > 0)
       and mature[6] == max(y for y in years if inc6[y] > 0))
    masked = all(P['tot'][a][yi[y]][t] is None or P['tot'][a][yi[y]][t][3] is None
                 for a in range(len(camps)) for y in years if y > mature[6] for t in range(3))
    ok('maturity: no six-year number survives for a cohort past %d' % mature[6], masked)

    # ---- the systemwide tier table and the pinned checks --------------------
    print('\nSYSTEMWIDE TIER TABLE  (all campuses, Pell-split totals, freshmen)')
    tab, expected = [], {}
    for b, y in enumerate(years):
        cells = P['tot'][0][b]
        r4 = [100 * c[1] / c[0] for c in cells]
        r6 = [None if c[3] is None else 100 * c[3] / c[0] for c in cells]
        r5 = [None if c[2] is None else 100 * c[2] / c[0] for c in cells]
        expected[str(y)] = {'n': [c[0] for c in cells], 'r4': r4, 'r5': r5, 'r6': r6,
                            'cut1': P['edges'][b][1], 'cut2': P['edges'][b][2]}
        tab.append([y, '%.2f' % P['edges'][b][1], '%.2f' % P['edges'][b][2],
                    '%.2f' % (4.00 - P['edges'][b][2]),
                    '%.1f' % r4[0], '%.1f' % r4[2], '%.1f' % (r4[2] - r4[0]),
                    '-' if r6[0] is None else '%.1f' % r6[0],
                    '-' if r6[2] is None else '%.1f' % r6[2],
                    '-' if r6[0] is None else '%.1f' % (r6[2] - r6[0]),
                    '{:,}'.format(sum(c[0] for c in cells))])
    print(md_table(['entering', 'lower cut', 'upper cut', 'top width',
                    'bottom 4yr', 'top 4yr', 'gap 4yr',
                    'bottom 6yr', 'top 6yr', 'gap 6yr', 'cohort n'], tab))

    p2010 = expected['2010']['r4'][2]
    ok('PIN: 2010 top-tier four-year rate is 74.1%% (got %.1f%%)' % p2010,
       abs(p2010 - 74.1) < 0.05, p2010)
    p2021 = expected['2021']['cut2']
    ok('PIN: the 2021 upper cut point is 3.92 (got %.2f)' % p2021, abs(p2021 - 3.92) < 1e-9, p2021)
    # The pin is stated at the precision the site prints (one decimal), which is
    # what "within 13.4 to 14.5" means: 2010 is 14.5204 and 2015 is 13.4417 (13.4531
    # before UCOP's September 2026 revision, when the pin read 13.5), and
    # both display as the endpoints. The raw extremes are printed so nothing hides.
    g6 = {y: expected[str(y)]['r6'][2] - expected[str(y)]['r6'][0]
          for y in years if y <= mature[6]}
    bad6 = [(y, round(v, 4)) for y, v in g6.items() if not 13.4 <= round(v, 1) <= 14.5]
    ok('PIN: the six-year top-minus-bottom gap is 13.4-14.5 points in all %d mature '
       'cohorts (raw range %.4f to %.4f)' % (len(g6), min(g6.values()), max(g6.values())),
       not bad6, bad6)

    # the headline both figures must state together
    g0 = expected[str(years[0])]['r4'][2] - expected[str(years[0])]['r4'][0]
    gl = expected[str(years[-1])]['r4'][2] - expected[str(years[-1])]['r4'][0]
    w0 = 4.00 - expected[str(years[0])]['cut2']
    wl = 4.00 - expected[str(years[-1])]['cut2']
    print('\nTHE TWO FINDINGS, STATED TOGETHER')
    print('  the top third narrowed from %.2f to %.2f of a grade point (%.0f%% of its width)'
          % (w0, wl, 100 * wl / w0))
    print('  the four-year top-minus-bottom gap went %.1f -> %.1f points over the same classes'
          % (g0, gl))
    print('  the six-year gap held at %.1f-%.1f points in every cohort old enough to measure'
          % (min(expected[str(y)]['r6'][2] - expected[str(y)]['r6'][0]
                 for y in years if y <= mature[6]),
             max(expected[str(y)]['r6'][2] - expected[str(y)]['r6'][0]
                 for y in years if y <= mature[6])))

    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, 'bands_expected.json'), 'w', encoding='utf-8') as fh:
        json.dump(expected, fh, indent=1)
    print('\nwrote %s' % os.path.join(OUT, 'bands_expected.json'))
    print('%d values checked, %d failures' % (checks, fails))
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()
