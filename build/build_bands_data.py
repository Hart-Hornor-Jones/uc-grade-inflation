#!/usr/bin/env python3
"""Build the small payload behind tab 4, "The shrinking top third".

    python build_bands_data.py

Reads the tidy VizQL-API harvest of the University of California's
"Grad. rates by GPA groups" dashboard and writes

    out/gi_bands.js          window.GIB = {...}

which is copied up to ../data_bands.js beside index.html.

WHAT THE SOURCE IS
------------------
One row per (dashboard state x worksheet x group x GPA band x measure).
Freshmen live on worksheet "a. HS GPAs" and their measure vocabulary is
4yr / 5yr_only / 6yr_only; transfers live on "b. Transfer GPA" with
2yr / 3yr_only / 4yr_only.  Filtering on '4yr' alone would silently drop
every transfer, so the level is filtered explicitly as well.  Freshmen
only at launch.

THE THREE RULES THIS SCRIPT OBEYS  (memory: gpa-groups-ca-resident-run)
----------------------------------------------------------------------
1. ANCHOR on measure_period == '4yr'.  That row already carries the whole
   degree ladder for its cell (sum_uc_deg_4yr / _5yr_only / _6yr_only), so
   one anchor row per cell gives everything and nothing is double counted.
2. cohort_denominator_inferred repeats across the measures of a cell.  Sum
   it ONCE, on the anchor row.
3. THREE SPLITS, THREE TOTALS.  No total-only view covers 2010-2021, and
   each split drops its own unknowns.  Totals here are the Pell split
   (least lossy) and are labeled a lower bound everywhere they appear.
   The script measures the shortfall of the other two splits and records
   it in the payload so the site can state it.

MATURITY is derived, not assumed: a horizon is marked immature for a
cohort year when every "only" increment for that year is exactly zero.
On the June 2026 vintage that gives 6-year <= 2019 and 5-year <= 2020.
"""
import csv
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(HERE)
OUT = os.path.join(HERE, 'out')

# Source. Override with the BANDS environment variable.
SRC = os.environ.get('BANDS') or os.path.join(
    'C:' + os.sep, 'Users', 'harth', 'svetlana', 'outcomes data',
    'ug_outcomes_gpa_groups_summary_api_full', 'vizql_long.csv')
if not os.path.exists(SRC):                      # sandbox staging path
    alt = os.path.join(os.sep, 'mnt', 'user-data', 'uploads', 'outcomes data',
                       'ug_outcomes_gpa_groups_summary_api_full', 'vizql_long.csv')
    if os.path.exists(alt):
        SRC = alt

LEVEL = 'Freshman'
SHEET = 'a. HS GPAs'
ANCHOR = '4yr'
TOTAL_SPLIT = 'Pell Grant'

CAMPUS_ORDER = ['All', 'Berkeley', 'Davis', 'Irvine', 'Los Angeles', 'Merced',
                'Riverside', 'San Diego', 'Santa Barbara', 'Santa Cruz']

# split key -> (control label in the source, display label, member group values)
SPLITS = [
    ('pell', 'Pell Grant', 'Pell Grant status',
     [('Pell Recipient', 'Pell recipients'),
      ('Non-Pell Recipeint', 'not Pell recipients')]),
    ('fgen', 'First-generation', 'First generation in college',
     [('First-generation', 'first generation'),
      ('Not first-generation', 'not first generation')]),
    ('eth', 'Ethnicity', 'Ethnicity',
     [('African American', 'African American'),
      ('American Indian', 'American Indian'),
      ('Asian', 'Asian'),
      ('Chicano/Latino', 'Chicano/Latino'),
      ('International', 'International'),
      ('White', 'White')]),
]


def num(v):
    """A source field to a float, or None. The harvest writes '' and 'null'."""
    v = (v or '').strip()
    if v == '' or v.lower() in ('null', 'nan', 'none'):
        return None
    return float(v)


def band_edges(rng):
    """'3.47 - <3.79' or '3.79 - 4.00' -> (3.47, 3.79)."""
    lo, hi = rng.split(' - ')
    return float(lo.strip()), float(hi.strip().lstrip('<'))


def main():
    if not os.path.exists(SRC):
        sys.exit('source not found: %s  (set the BANDS environment variable)' % SRC)
    print('reading %s' % SRC)
    with open(SRC, encoding='utf-8', newline='') as fh:
        rows = [r for r in csv.DictReader(fh)
                if r['student_level'] == LEVEL
                and r['worksheet'] == SHEET
                and r['measure_period'] == ANCHOR]
    print('  %d freshman anchor rows' % len(rows))

    years = sorted({int(r['cohort_year']) for r in rows})
    campuses = [c for c in CAMPUS_ORDER if c in {r['campus'] for r in rows}]
    assert len(campuses) == 10, campuses

    # ---- band boundaries, per cohort year -----------------------------------
    # The bands are per-cohort terciles of the entering class: the SAME cut
    # points are applied at every campus, so the edges are a property of the
    # year alone. Assert that before relying on it.
    edges_by_year = {}
    for y in years:
        seen = {r['gpa_range'] for r in rows if int(r['cohort_year']) == y}
        assert len(seen) == 3, (y, sorted(seen))
        iv = sorted((band_edges(s) for s in seen))
        assert abs(iv[0][1] - iv[1][0]) < 1e-9 and abs(iv[1][1] - iv[2][0]) < 1e-9, (y, iv)
        edges_by_year[y] = [iv[0][0], iv[0][1], iv[1][1], iv[2][1]]
    # and the same three ranges really are used at every campus and in every split
    by_state = {}
    for r in rows:
        by_state.setdefault(
            (int(r['cohort_year']), r['campus'], r['group_selection']), set()
        ).add(r['gpa_range'])
    for (y, c, g), seen in by_state.items():
        want = {r['gpa_range'] for r in rows if int(r['cohort_year']) == y}
        assert seen == want, ('band edges differ within a cohort year', y, c, g,
                              sorted(seen), sorted(want))
    print('  band edges are campus-invariant in all %d cohort years' % len(years))
    print('  band edges: %s -> %s' % (edges_by_year[years[0]], edges_by_year[years[-1]]))

    # tier index 0 bottom, 1 middle, 2 top, from the band's lower edge
    def tier_of(y, rng):
        lo, _ = band_edges(rng)
        e = edges_by_year[y]
        return 0 if abs(lo - e[0]) < 1e-9 else (1 if abs(lo - e[1]) < 1e-9 else 2)

    NY, NC, NT = len(years), len(campuses), 3
    yi = {y: i for i, y in enumerate(years)}
    ci = {c: i for i, c in enumerate(campuses)}

    def empty():
        return [[[None] * NT for _ in range(NY)] for _ in range(NC)]

    # ---- maturity, derived --------------------------------------------------
    inc5 = {y: 0.0 for y in years}
    inc6 = {y: 0.0 for y in years}
    for r in rows:
        y = int(r['cohort_year'])
        inc5[y] += num(r['sum_uc_deg_5yr_only']) or 0.0
        inc6[y] += num(r['sum_uc_deg_6yr_only']) or 0.0
    mature5 = max(y for y in years if inc5[y] > 0)
    mature6 = max(y for y in years if inc6[y] > 0)
    print('  maturity derived from the data: 5-year <= %d, 6-year <= %d' % (mature5, mature6))

    # ---- the cells ----------------------------------------------------------
    # group_value -> [ci][yi][ti] = [n, d4, d5, d6] cumulative graduate counts
    per_group = {}
    split_tot = {k: empty() for k, _, _, _ in SPLITS}   # denominators, per split
    dropped = 0
    for r in rows:
        y, c = int(r['cohort_year']), r['campus']
        t = tier_of(y, r['gpa_range'])
        n = num(r['cohort_denominator_inferred'])
        if n is None or n <= 0:
            dropped += 1
            continue
        d4 = num(r['sum_uc_deg_4yr']) or 0.0
        d5 = d4 + (num(r['sum_uc_deg_5yr_only']) or 0.0)
        d6 = d5 + (num(r['sum_uc_deg_6yr_only']) or 0.0)
        cell = [int(round(n)), int(round(d4)),
                None if y > mature5 else int(round(d5)),
                None if y > mature6 else int(round(d6))]
        g = r['group_value']
        per_group.setdefault(g, empty())[ci[c]][yi[y]][t] = cell
        # denominator by split, for the three-splits-three-totals comparison
        skey = {lab: k for k, lab, _, _ in SPLITS}[r['group_selection']]
        acc = split_tot[skey][ci[c]][yi[y]][t]
        split_tot[skey][ci[c]][yi[y]][t] = (acc or 0) + int(round(n))
    print('  %d zero/suppressed cells dropped (all tiny ethnicity cells)' % dropped)

    # ---- totals: the Pell split, summed, and called a lower bound -----------
    tot = empty()
    members = [g for g, _ in SPLITS[0][3]]      # the two Pell groups
    for a in range(NC):
        for b in range(NY):
            for t in range(NT):
                parts = [per_group[g][a][b][t] for g in members if per_group[g][a][b][t]]
                if not parts:
                    continue
                tot[a][b][t] = [
                    sum(p[0] for p in parts),
                    sum(p[1] for p in parts),
                    None if any(p[2] is None for p in parts) else sum(p[2] for p in parts),
                    None if any(p[3] is None for p in parts) else sum(p[3] for p in parts),
                ]

    # how lossy the other two splits are, against the Pell split
    loss = {}
    for k, _, _, _ in SPLITS:
        num_, den_, worst = 0, 0, 0.0
        for a in range(NC):
            for b in range(NY):
                for t in range(NT):
                    p = split_tot['pell'][a][b][t]
                    q = split_tot[k][a][b][t]
                    if not p or not q:
                        continue
                    num_ += q
                    den_ += p
                    worst = max(worst, (p - q) / p)
        loss[k] = {'share_of_pell': round(num_ / den_, 5), 'worst_cell': round(worst, 5)}
    print('  split coverage against the Pell split: %s' % json.dumps(loss))

    # ---- payload ------------------------------------------------------------
    payload = {
        'meta': {
            'built': '2026-08-08',
            'source': 'University of California, Graduation Dashboard (final rates), '
                      '"Grad. rates by GPA groups"; harvested 29 June 2026',
            'level': 'Freshman',
            'years': years,
            'campuses': campuses,
            'tiers': ['bottom third', 'middle third', 'top third'],
            'horizons': [4, 5, 6],
            'mature': {'4': years[-1], '5': mature5, '6': mature6},
            'pandemic': [2020, 2021],
            'totals_from': 'Pell Grant',
            'totals_note': 'a lower bound: no total-only view covers these cohorts, so '
                           'totals are the Pell Grant split summed, and that split drops '
                           'its own unknowns',
            'split_coverage': loss,
            'splits': [{'key': k, 'label': lab,
                        'groups': [{'key': g, 'label': d} for g, d in ms]}
                       for k, _src, lab, ms in SPLITS],
        },
        'edges': [edges_by_year[y] for y in years],
        'tot': tot,
        'grp': {g: per_group[g] for _k, _s, _l, ms in SPLITS for g, _d in ms},
    }

    os.makedirs(OUT, exist_ok=True)
    js = ('/* Tab 4 payload: University of California entering-class GPA thirds and\n'
          '   their graduation rates, freshman cohorts %d-%d. Built by\n'
          '   build_bands_data.py -- do not edit by hand. */\n'
          'window.GIB = %s;\n' % (years[0], years[-1],
                                  json.dumps(payload, separators=(',', ':'))))
    p = os.path.join(OUT, 'gi_bands.js')
    with open(p, 'w', encoding='utf-8') as fh:
        fh.write(js)
    print('  wrote %s  (%.0f KB)' % (p, os.path.getsize(p) / 1024))

    up = os.path.join(SITE, 'data_bands.js')
    with open(up, 'w', encoding='utf-8') as fh:
        fh.write(js)
    print('  wrote %s  (%.0f KB)' % (up, os.path.getsize(up) / 1024))

    # ---- the headline table, printed for the record ------------------------
    print('\nSYSTEMWIDE TIER TABLE (all campuses, Pell-split totals, freshmen)')
    print('  year   top cut   bottom 4yr  top 4yr  gap4    bottom 6yr  top 6yr  gap6')
    for b, y in enumerate(years):
        cells = tot[0][b]
        r4 = [c[1] / c[0] * 100 for c in cells]
        r6 = [None if c[3] is None else c[3] / c[0] * 100 for c in cells]
        g6 = '' if r6[0] is None else '%9.1f %8.1f %6.1f' % (r6[0], r6[2], r6[2] - r6[0])
        print('  %d   %6.2f   %9.1f %8.1f %6.1f   %s'
              % (y, edges_by_year[y][2], r4[0], r4[2], r4[2] - r4[0], g6))


if __name__ == '__main__':
    main()
