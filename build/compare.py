#!/usr/bin/env python3
"""Assert the browser's answers equal the independent Python recomputation."""
import json, os, sys

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
with open(os.path.join(OUT, 'twin_expected.json'), encoding='utf-8') as fh:
    E = json.load(fh)
with open(os.path.join(OUT, 'js_actual.json'), encoding='utf-8') as fh:
    A = json.load(fh)
fails = 0; checks = 0

TOL = {'n': 0.5, 'pos': 0.06, 'posG': 0.06, 'posres_fit': 0.06, 'posres_eq': 0.06,
       'beta': 5e-6, 'dC': 3e-4,
       'nGap': 0.5, 'nTotal': 0.5, 'nSchools': 0.5, 'maxdev': 1e-12,
       'default': 2e-5}

def cmp(path, e, a):
    global fails, checks
    if isinstance(e, dict):
        for k in e:
            if k in a:
                cmp(path + '.' + k, e[k], a[k])
            else:
                fails += 1
                print(f'FAIL {path}.{k}: missing from the browser dump')
        return
    if isinstance(e, list):
        if not isinstance(a, list) or len(e) != len(a):
            fails += 1
            print(f'FAIL {path}: list length {len(e)} vs {len(a) if isinstance(a, list) else type(a)}')
            return
        for i, (ev, av) in enumerate(zip(e, a)):
            cmp(f'{path}[{i}]', ev, av)
        return
    checks += 1
    if e is None and a is None: return
    if e is None or a is None:
        fails += 1; print(f'FAIL {path}: python {e!r} vs browser {a!r}'); return
    key = path.split('.')[-1]
    tol = TOL.get(key, TOL['default'])
    if abs(e - a) > tol:
        fails += 1
        print(f'FAIL {path}: python {e:.6f} vs browser {a:.6f}  (tol {tol})')

for sec in ['ladder', 'paired', 'gap', 'chain', 'bench', 'changed',
            'sep', 'identity', 'surv', 'scat', 'scat_school']:
    cmp(sec, E[sec], A[sec])

print(f'\n{checks} values compared, {fails} disagreements '
      f'(tolerance {TOL["default"]:g}; counts exact; percentages 0.05)')

print('\n' + '=' * 88)
print('TAB 1 -- THE OPENING TRIPTYCH, Universitywide pool, classes 2016-19 vs 2023-25')
t = E['changed']['uw_census_default']
print(f'  panel A   {t["n"]} schools, grade change {t["mdG"]:+.4f}, {t["posG"]:.1f}% above zero')
print(f'  panel B   anchor change {t["mdC"]:+.2f} points; fitted slope {t["b"]:+.4f}, '
      f'correlation {t["r"]:+.3f}; at no anchor movement {t["a"]:+.4f}')
print(f'  panel C   against the fit: mean {t["mres_fit"]:+.5f} (zero by construction), '
      f'{t["posres_fit"]:.1f}% above')
print(f'            against equal standardized movement: mean {t["mres_eq"]:+.4f}, '
      f'{t["posres_eq"]:.1f}% above')
if abs(t['mres_fit']) > 1e-9:
    print('  -> WARNING: the fitted-line residual should be centered at zero'); fails += 1

print('\n' + '=' * 88)
print('THE IDENTITY  gap = (1 - p) x separation,  cell by cell')
for nm, v in E['identity'].items():
    b = A['identity'][nm]
    print(f'  {nm:16s} {v["n"]:6d} cells   largest deviation  python {v["maxdev"]:.2e}  '
          f'browser {b["maxdev"]:.2e}   mean separation {v["meansep"]:+.4f}  mean gap {v["meangap"]:+.4f}')
    if v['maxdev'] > 1e-12 or b['maxdev'] > 1e-12:
        fails += 1
        print('    -> the identity does not hold to machine precision')

print('\n' + '=' * 88)
print('SURVIVAL CURVES, classes 2016-19 vs 2023-25, share of applicant mass at or above')
for c in ['Universitywide', 'Berkeley', 'Merced', 'San Diego']:
    a, b = E['surv'][f'{c}|e1619'], E['surv'][f'{c}|e2325']
    line = f'  {c:15s}'
    for t in [3.60, 3.80, 4.00]:
        i = a['t'].index(t)
        line += f'   {t:.2f}: {a["share"][i]:5.1f}% -> {b["share"][i]:5.1f}%'
    print(line)

print('\n' + '=' * 88)
print('SEPARATION AGAINST SELECTIVITY, four-class blocks')
xs = [v['rate'] for v in E['scat'].values()]
ys = [v['sep'] for v in E['scat'].values()]
mx = sum(xs) / len(xs); my = sum(ys) / len(ys)
num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
den = (sum((x - mx) ** 2 for x in xs) * sum((y - my) ** 2 for y in ys)) ** .5
print(f'  {len(xs)} pool-periods; correlation of admission rate with separation r = {num / den:+.3f}')
for c in ['Universitywide', 'Berkeley', 'Merced']:
    ks = [k for k in E['scat'] if k.startswith(c + '|')][-4:]
    print(f'  {c:15s} ' + '  '.join(
        f'{k.split("|")[1]}: {E["scat"][k]["sep"]:+.3f} at {E["scat"][k]["rate"]:.0f}%'
        f' (+-{E["scat"][k]["err"]:.3f})' for k in ks))

print('\n' + '=' * 88)
print('CAMPUS-LABEL DIAGNOSIS')
print('Running the published 2026-07-09 estimator on the PRE-repair extract:')
pub = E['published_2026_07_09']; pre = E['prerepair']
bad = 0
for c, want in pub.items():
    got = pre[c]
    line = f'  label "{c:12s}"  n {got["n"]:4d} (published {want["n"]:4d})   dG {got["dG"]:+.4f} (published {want["dG"]:+.4f})'
    if 'I' in want: line += f'   I {got["I"]:+.4f} (published {want["I"]:+.4f})'
    print(line)
    if abs(got['dG'] - want['dG']) > 0.002: bad += 1   # dG is the diagnostic; n moves with the July crosswalk repair
print(f'  -> {"REPRODUCED" if bad == 0 else str(bad) + " mismatches"}: the published study read the pre-repair labels.')
print('\nThe same estimator on the REPAIRED extract, correct labels:')
for c in ['Berkeley', 'Los Angeles', 'San Diego', 'Riverside', 'Merced']:
    g = E['ladder'][c]
    print(f'  {c:14s} n {g["n"]:4d}   dG {g["dG"]:+.4f}   I {g["I"]:+.4f}   {g["pos"]:.1f}% of schools above zero')
fails += bad

print('\n' + '=' * 88)
print('NINE-CAMPUS LADDER, repaired labels, classes 2016-19 vs 2023-25')
rows = sorted(E['ladder'].items(), key=lambda kv: kv[1]['Gp'])
mono = all(rows[i][1]['dG'] <= rows[i - 1][1]['dG'] + 1e-9 for i in range(1, len(rows)))
for c, g in rows:
    print(f'  {c:14s} pool average {g["Gp"]:.3f} -> {g["Gq"]:.3f}   change {g["dG"]:+.4f}   estimate {g["I"]:+.4f}')
print(f'  -> strictly ordered by starting level: {"YES" if mono else "NO"}')
if not mono: fails += 1

print('\n' + ('ALL CHECKS PASSED' if fails == 0 else f'{fails} PROBLEM(S)'))
sys.exit(1 if fails else 0)
