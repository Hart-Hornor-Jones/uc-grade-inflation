#!/usr/bin/env python3
"""
twin.py — independent Python recomputation of every number the tools display.

It reads the ORIGINAL CSVs, not the encoded payload, and applies the cohort-dating
rules from scratch.  dump_js.js runs the built HTML in a headless browser and writes
the browser's answers; compare.py asserts the two agree.

It also proves, as a side result, the campus-label diagnosis: running the published
2026-07-09 estimator on the PRE-repair extract reproduces that study's headline
numbers, which the repaired extract does not.
"""
import json, os, numpy as np, pandas as pd

# Source CSVs. Override any of them with an environment variable of the same
# name, or edit the defaults to your local layout (Windows paths are fine).
UP = os.environ.get('GI_UPLOADS', '/mnt/user-data/uploads/')
DV_NEW = os.environ.get('DV_NEW', UP + 'Svetlana/uc-merit-admissions/data/dv_admissions_all9.csv')
DV_OLD = os.environ.get('DV_OLD', UP + 'Svetlana/uc-merit-admissions/data/dv_admissions_all9_pre_gpa_repair_20260730.csv')
DV_UW = os.environ.get('DV_UW', os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                             'out', 'dv_admissions_uw.csv'))
PAN = os.environ.get('PAN', UP + 'Svetlana/uc-merit-admissions/data/panel_all9_by_year.csv')
SC = os.environ.get('SC', UP + 'hs data/star-scores/panel/star_cahsee_panel.csv.gz')
TC = os.environ.get('TC', UP + 'hs data/ap-sat-act-refined/panel/test_context_panel.csv')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')

CAMPUS = ['Berkeley', 'Davis', 'Irvine', 'Los Angeles', 'Merced',
          'Riverside', 'San Diego', 'Santa Barbara', 'Santa Cruz']

def wmean(x, w):
    x = np.asarray(x, float); w = np.asarray(w, float)
    return float(np.average(x, weights=w)) if w.sum() else float('nan')

def wslope(x, y, w):
    x = np.asarray(x, float); y = np.asarray(y, float); w = np.asarray(w, float)
    W = w / w.mean(); X = np.column_stack([np.ones(len(x)), x])
    return float(np.linalg.solve(X.T @ (X * W[:, None]), X.T @ (W * y))[1])

print('reading sources ...', flush=True)
dv = pd.read_csv(DV_NEW, dtype={'ceeb': str})
# the Universitywide pool, restricted to the nine-campus school universe exactly as the
# payload builder restricts it, so the browser and this file see the same schools
uwdf = pd.read_csv(DV_UW, dtype={'ceeb': str})
uwdf = uwdf[uwdf.ceeb.isin(set(dv.ceeb.unique()))]
dvu = pd.concat([dv, uwdf], ignore_index=True)
pan = pd.read_csv(PAN, dtype={'ceeb': str}, usecols=['ceeb', 'year', 'avg_pct_met'])
cov = pan.groupby(['ceeb', 'year']).avg_pct_met.max().rename('caaspp').reset_index()

sc = pd.read_csv(SC, dtype={'ceeb': str}, usecols=[
    'test_year', 'ceeb', 'is_high_school',
    'star_ela_g11_pct_prof_plus', 'star_ela_g11_tested',
    'cahsee_ela_pct_passed', 'cahsee_ela_tested'])
sc = sc[(sc.is_high_school == True) & sc.ceeb.notna()]

def wagg(df, val, wt):
    d = df.dropna(subset=[val]).copy()
    d['_w'] = d[wt].fillna(1.0).clip(lower=1e-9)
    return (d.groupby(['ceeb', 'test_year'])
             .apply(lambda t: np.average(t[val], weights=t['_w']), include_groups=False)
             .rename('v').reset_index())

star = wagg(sc, 'star_ela_g11_pct_prof_plus', 'star_ela_g11_tested'); star['cls'] = star.test_year + 1
cah = wagg(sc, 'cahsee_ela_pct_passed', 'cahsee_ela_tested');         cah['cls'] = cah.test_year + 2

tc = pd.read_csv(TC, dtype={'ceeb': str}, usecols=[
    'uc_cycle_year', 'ceeb', 'grade_12_enrollment', 'z_sat_primary'])
tc = tc[tc.ceeb.notna()].copy()
tc['g12w'] = tc.grade_12_enrollment.fillna(1.0).clip(lower=1e-9)
sat = (tc.dropna(subset=['z_sat_primary'])
         .groupby(['ceeb', 'uc_cycle_year'])
         .apply(lambda t: np.average(t.z_sat_primary, weights=t.g12w), include_groups=False)
         .rename('v').reset_index().rename(columns={'uc_cycle_year': 'cls'}))

# one census instrument per class, exactly as the builder does
universe = set(dv.ceeb.unique())
cs = pd.concat([
    cov.dropna(subset=['caaspp']).rename(columns={'year': 'cls', 'caaspp': 'v'}).assign(src=3)[['ceeb', 'cls', 'v', 'src']],
    star[['ceeb', 'cls', 'v']].assign(src=2),
    cah[['ceeb', 'cls', 'v']].assign(src=1)], ignore_index=True)
cs = cs[cs.ceeb.isin(universe)]
keep = {}
for cls, t in cs.groupby('cls'):
    n = t.groupby('src').size()
    big = [s for s in sorted(n.index, reverse=True) if n[s] >= 500]
    keep[cls] = big[0] if big else max(n.index)
cs = cs[[keep[c] == s for c, s in zip(cs.cls, cs.src)]].drop_duplicates(subset=['ceeb', 'cls'])
CEN = cs.set_index(['ceeb', 'cls']).v.to_dict()
SAT = sat.set_index(['ceeb', 'cls']).v.to_dict()

# ---------------------------------------------------------------- estimators
def era_school(df, camp, years, gate, gser='app'):
    cnt = {'app': 'applicants', 'adm': 'admits', 'enr': 'enrollees'}[gser]
    gpa = {'app': 'app_gpa', 'adm': 'adm_gpa', 'enr': 'enr_gpa'}[gser]
    d = df[(df.campus == camp) & (df.year.isin(years))]
    A = d.groupby('ceeb').applicants.sum()
    g = d.dropna(subset=[gpa, cnt])
    G = g.groupby('ceeb').apply(lambda t: np.average(t[gpa], weights=t[cnt]), include_groups=False)
    out = pd.DataFrame({'G': G}).join(A.rename('A'), how='inner')
    return out[out.A >= gate]

def ruler_era(tbl, years):
    acc = {}
    for (ce, cl), v in tbl.items():
        if cl in years:
            acc.setdefault(ce, []).append(v)
    return {k: float(np.mean(v)) for k, v in acc.items()}

def panel(df, camp, pre, post, ruler, gate=30, gser='app', beta_mode='pre'):
    P = era_school(df, camp, pre, gate, gser); Q = era_school(df, camp, post, gate, gser)
    m = P.join(Q, how='inner', lsuffix='_pre', rsuffix='_post')
    if ruler is not None:
        RP = ruler_era(ruler, set(pre)); RQ = ruler_era(ruler, set(post))
        m['Cp'] = [RP.get(c) for c in m.index]; m['Cq'] = [RQ.get(c) for c in m.index]
        m = m.dropna(subset=['Cp', 'Cq'])
        m['dC'] = m.Cq - m.Cp
    else:
        m['dC'] = 0.0
    m['dG'] = m.G_post - m.G_pre
    m['w'] = (m.A_pre + m.A_post) / 2
    if ruler is None or beta_mode == 'zero' or len(m) < 3:
        beta = 0.0
    elif beta_mode == 'post':
        beta = wslope(m.Cq, m.G_post, m.A_post)
    else:
        beta = wslope(m.Cp, m.G_pre, m.A_pre)
    m['I'] = m.dG - beta * m.dC
    return m, beta

def gap_within(df, camp, year, gate):
    d = df[(df.campus == camp) & (df.year == year) & (df.applicants >= gate)]
    d = d.dropna(subset=['app_gpa', 'adm_gpa', 'admits'])
    d = d[d.admits > 0]
    if len(d) < 5: return None, 0
    return wmean(d.adm_gpa - d.app_gpa, d.admits), len(d)

def denied_cells(df, camp, years, gate, min_r):
    """The denied pool, rebuilt from the published means and counts.

    A applicants averaging g_A, D admitted averaging g_D  =>  the A-D denied
    students average (A*g_A - D*g_D)/(A-D), and, exactly,
        g_D - g_A = (1 - D/A) * (g_D - g_R).
    Cells with fewer than min_r denied students are withheld: the published means
    carry two decimals and the subtraction amplifies that rounding by A/(A-D).
    """
    d = df[(df.campus == camp) & (df.year.isin(years)) & (df.applicants >= gate)]
    d = d.dropna(subset=['app_gpa', 'adm_gpa', 'admits', 'applicants']).copy()
    d['R'] = d.applicants - d.admits
    d = d[d.R >= min_r]
    d['rg'] = (d.applicants * d.app_gpa - d.admits * d.adm_gpa) / d.R
    d['sep'] = d.adm_gpa - d.rg
    d['gap'] = d.adm_gpa - d.app_gpa
    d['err'] = 0.005 * (1 + (d.applicants + d.admits) / d.R)   # worst-case rounding
    return d

def sep_year(df, camp, year, gate, min_r):
    """(within-school separation, pooled separation, n cells, admission rate,
    weighted rounding bound), all read off the denied-valid cells only."""
    d = denied_cells(df, camp, [year], gate, min_r)
    if len(d) < 5:
        return None, None, 0, None, None
    within = wmean(d.sep, d.admits)
    pooled = (float((d.admits * d.adm_gpa).sum() / d.admits.sum())
              - float((d.R * d.rg).sum() / d.R.sum()))
    rate = 100.0 * float(d.admits.sum()) / float(d.applicants.sum())
    return within, pooled, int(len(d)), rate, wmean(d.err, d.admits)

def sep_period(df, camp, years, gate, min_r, school_gate=None):
    d = denied_cells(df, camp, years, gate, min_r)
    roll = lambda t: dict(n=int(len(t)), sep=wmean(t.sep, t.admits), gap=wmean(t.gap, t.admits),
                          err=wmean(t.err, t.admits),
                          rate=100.0 * float(t.admits.sum()) / float(t.applicants.sum()),
                          A=float(t.applicants.sum()))
    if school_gate is None:
        return roll(d) if len(d) >= 20 else None
    return {ce: roll(t) for ce, t in d.groupby('ceeb') if t.applicants.sum() >= school_gate}

def survival_curve(df, camp, years, gate, thresholds):
    """Share of applicant mass at schools whose era-pooled pool average is at or
    above each threshold, schools weighted by their total applicants."""
    d = df[(df.campus == camp) & (df.year.isin(years))]
    A = d.groupby('ceeb').applicants.sum()
    g = d.dropna(subset=['app_gpa', 'applicants'])
    G = g.groupby('ceeb').apply(lambda t: np.average(t.app_gpa, weights=t.applicants),
                                include_groups=False)
    m = pd.DataFrame({'G': G}).join(A.rename('A'), how='inner')
    m = m[m.A >= gate]
    tot = float(m.A.sum())
    return [dict(t=float(t),
                 share=(100.0 * float(m.A[m.G >= t - 1e-12].sum()) / tot) if tot else None,
                 nSchools=int((m.G >= t - 1e-12).sum()), nTotal=int(len(m)))
            for t in thresholds]

def chain(df, camp, gate, upto):
    d = df[(df.campus == camp) & (df.applicants >= gate)].dropna(subset=['app_gpa', 'applicants'])
    by = {y: t.set_index('ceeb')[['app_gpa', 'applicants']] for y, t in d.groupby('year')}
    lvl = 0.0
    for y in range(1995, upto + 1):
        a, b = by.get(y - 1), by.get(y)
        if a is None or b is None: continue
        j = b.join(a, how='inner', rsuffix='_p')
        if len(j) < 5: continue
        lvl += wmean(j.app_gpa - j.app_gpa_p, (j.applicants + j.applicants_p) / 2)
    return lvl

# ------------------------------------------------------------------ battery
exp = {'ladder': {}, 'paired': {}, 'gap': {}, 'chain': {}, 'bench': {}}
PRE = [2016, 2017, 2018, 2019]; POST = [2023, 2024, 2025]
print('battery: nine-campus ladder ...', flush=True)
base = None
for c in CAMPUS:
    m, beta = panel(dv, c, PRE, POST, CEN)
    w = m.w.to_numpy()
    exp['ladder'][c] = dict(n=int(len(m)), Gp=wmean(m.G_pre, m.A_pre), Gq=wmean(m.G_post, m.A_post),
                            dG=wmean(m.dG, w), beta=beta, I=wmean(m.I, w),
                            pos=100 * wmean((m.I > 0).astype(float), w))
    if c == 'Berkeley':
        base, _ = panel(dv, c, PRE, POST, None, beta_mode='zero')

print('battery: paired contrasts ...', flush=True)
for c in CAMPUS:
    if c == 'Berkeley': continue
    o, _ = panel(dv, c, PRE, POST, None, beta_mode='zero')
    j = base.join(o, how='inner', lsuffix='_b', rsuffix='_o')
    ww = ((j.A_pre_b + j.A_post_b + j.A_pre_o + j.A_post_o) / 4).to_numpy()
    exp['paired'][c] = dict(n=int(len(j)), d=wmean(j.dG_o - j.dG_b, ww))

print('battery: margins ...', flush=True)
for c in ['Berkeley', 'San Diego', 'Merced']:
    for y in [1995, 2005, 2015, 2020, 2025]:
        v, n = gap_within(dv, c, y, 20)
        exp['gap'][f'{c}|{y}'] = dict(v=v, n=n)

print('battery: chain index ...', flush=True)
for c in ['Berkeley', 'Merced', 'San Diego']:
    exp['chain'][c] = chain(dv, c, 30, 2025)

print('battery: bench configurations ...', flush=True)
cfgs = [
    ('berk_census_1619_2325', 'Berkeley', PRE, POST, CEN, 'pre'),
    ('berk_none_1619_2325', 'Berkeley', PRE, POST, None, 'zero'),
    ('merced_census_1619_2325', 'Merced', PRE, POST, CEN, 'pre'),
    ('berk_sat_0508_1619', 'Berkeley', [2005, 2006, 2007, 2008], PRE, SAT, 'pre'),
    ('sd_sat_9902_1720', 'San Diego', [1999, 2000, 2001, 2002], [2017, 2018, 2019, 2020], SAT, 'pre'),
    ('berk_census_post', 'Berkeley', PRE, POST, CEN, 'post'),
]
for key, c, pre, post, R, bm in cfgs:
    m, beta = panel(dv, c, pre, post, R, beta_mode=bm)
    w = m.w.to_numpy()
    exp['bench'][key] = dict(n=int(len(m)), beta=beta, dG=wmean(m.dG, w),
                             dC=(wmean(m.dC, w) if R is not None else 0.0),
                             I=wmean(m.I, w), pos=100 * wmean((m.I > 0).astype(float), w))

print('battery: tab 1, the opening triptych ...', flush=True)

# The payload stores each anchor as a fixed-width integer code, so the browser reads a
# ROUNDED anchor while the batteries above read the raw CSV value.  For the grade
# averages that is lossless (the source already carries two decimals); for the anchors
# it is not.  These reproduce the encoder's rounding exactly, so the triptych battery
# and the browser are compared on identical inputs and the 2e-5 bar means what it says.
def q_pct(v, k):                      # enc(v * k) -> code / k
    c = int(round(v * k))
    return None if c < 0 or c > 4094 else c / k

def q_z(v, scale=250, off=2048):      # encz(v) -> (code - off) / scale
    c = int(round(off + v * scale))
    return None if c < 0 or c > 4094 else (c - off) / scale

def quantize(tbl, fn):
    out = {}
    for k, v in tbl.items():
        q = fn(v)
        if q is not None:
            out[k] = q
    return out

CENQ = quantize(CEN, lambda v: q_pct(v, 40))     # census_pct, scale 40
SATQ = quantize(SAT, q_z)                        # z_sat, scale 250 about 2048


def wsd(x, w):
    x = np.asarray(x, float); w = np.asarray(w, float)
    m = np.average(x, weights=w)
    return float(np.sqrt(np.average((x - m) ** 2, weights=w)))

def wcorr(x, y, w):
    x = np.asarray(x, float); y = np.asarray(y, float); w = np.asarray(w, float)
    mx = np.average(x, weights=w); my = np.average(y, weights=w)
    a = np.sum(w * (x - mx) * (y - my))
    b = np.sum(w * (x - mx) ** 2); c = np.sum(w * (y - my) ** 2)
    return float(a / np.sqrt(b * c)) if b > 0 and c > 0 else float('nan')

def triptych(camp, pre, post, ruler, gate=30, gser='app', weight='a'):
    """Panels A, B and C of tab 1, recomputed from the CSVs.

    A: the within-school grade change.  B: that change against the change in the
    anchor, with two references -- the weighted least-squares fit (which carries an
    intercept, so its residuals are centered by construction) and a line through the
    origin whose slope matches the two spreads.  C: the residual from whichever
    reference is chosen.
    """
    m, _ = panel(dvu, camp, pre, post, ruler, gate=gate, gser=gser, beta_mode='zero')
    w = ((m.A_pre + m.A_post) / 2).to_numpy() if weight == 'a' else np.ones(len(m))
    dG = m.dG.to_numpy(); dC = m.dC.to_numpy()
    b = wslope(dC, dG, w)
    a = wmean(dG, w) - b * wmean(dC, w)
    sx, sy = wsd(dC, w), wsd(dG, w)
    sl = sy / sx if sx > 0 else 0.0
    res_fit = dG - (a + b * dC)
    res_eq = dG - sl * dC
    return dict(n=int(len(m)), mdG=wmean(dG, w), posG=100 * wmean((dG > 0).astype(float), w),
                mdC=wmean(dC, w), a=a, b=b, s=sl, r=wcorr(dC, dG, w),
                mres_fit=wmean(res_fit, w),
                posres_fit=100 * wmean((res_fit > 0).astype(float), w),
                mres_eq=wmean(res_eq, w),
                posres_eq=100 * wmean((res_eq > 0).astype(float), w))

SAT0508 = [2005, 2006, 2007, 2008]
tri = [
    ('uw_census_default',   'Universitywide', PRE, POST, CENQ, 30, 'app', 'a'),
    ('uw_census_unweighted','Universitywide', PRE, POST, CENQ, 30, 'app', 's'),
    ('uw_census_gate60',    'Universitywide', PRE, POST, CENQ, 60, 'app', 'a'),
    ('uw_census_admitted',  'Universitywide', PRE, POST, CENQ, 30, 'adm', 'a'),
    ('berk_census_default', 'Berkeley',       PRE, POST, CENQ, 30, 'app', 'a'),
    ('merced_census_default','Merced',        PRE, POST, CENQ, 30, 'app', 'a'),
    ('uw_sat_0508_1619',    'Universitywide', SAT0508, PRE, SATQ, 30, 'app', 'a'),
]
exp['changed'] = {k: triptych(c, pre, post, R, g, ser, wt)
                  for k, c, pre, post, R, g, ser, wt in tri}

print('battery: derived denied means and separation ...', flush=True)
exp['sep'] = {}
for c in ['Universitywide', 'Berkeley', 'San Diego', 'Merced', 'Riverside']:
    for y in [1995, 2005, 2015, 2020, 2025]:
        v, vp, n, rate, err = sep_year(dvu, c, y, 20, 10)
        gap, ng = gap_within(dvu, c, y, 20)
        exp['sep'][f'{c}|{y}'] = dict(sep=v, sepPooled=vp, gap=gap, err=err,
                                      n=n, nGap=ng, rate=rate)

print('battery: the identity ...', flush=True)
exp['identity'] = {}
for nm, camp, gate, min_r in [('Universitywide', 'Universitywide', 20, 10),
                              ('Berkeley', 'Berkeley', 20, 10),
                              ('Merced', 'Merced', 1, 3)]:
    t = denied_cells(dvu, camp, list(range(1994, 2026)), gate, min_r)
    dev = t.gap - (1 - t.admits / t.applicants) * t.sep
    exp['identity'][nm] = dict(n=int(len(t)), maxdev=float(np.max(np.abs(dev))),
                               meansep=wmean(t.sep, t.admits), meangap=wmean(t.gap, t.admits))

print('battery: survival curves ...', flush=True)
THR = [round(2.50 + 0.05 * i, 2) for i in range(37)]      # 2.50 .. 4.30
exp['surv'] = {}
for c in ['Universitywide', 'Berkeley', 'Merced', 'San Diego']:
    for nm, yrs in [('e1619', PRE), ('e2325', POST), ('e0508', SAT0508)]:
        cur = survival_curve(dvu, c, yrs, 20, THR)
        exp['surv'][f'{c}|{nm}'] = dict(
            t=[r['t'] for r in cur], share=[r['share'] for r in cur],
            nSchools=[r['nSchools'] for r in cur], nTotal=cur[0]['nTotal'])

print('battery: separation against selectivity ...', flush=True)
exp['scat'] = {}
for c in ['Universitywide'] + CAMPUS:
    for a in range(1994, 2026, 4):
        r = sep_period(dvu, c, list(range(a, min(2025, a + 3) + 1)), 20, 10)
        if r: exp['scat'][f'{c}|{a}'] = r
exp['scat_school'] = {}
for c in ['Berkeley', 'Merced']:
    r = sep_period(dvu, c, [2022, 2023, 2024, 2025], 20, 10, school_gate=100)
    exp['scat_school'][c] = {k: r[k] for k in sorted(r)[:12]}
    exp['scat_school'][c + '|count'] = len(r)

# ------------------------------------------------- the campus-label diagnosis
print('label diagnosis ...', flush=True)
old = pd.read_csv(DV_OLD, dtype={'ceeb': str})
diag = {}
for c in ['Berkeley', 'Los Angeles', 'San Diego', 'Riverside', 'Merced']:
    m, beta = panel(old, c, PRE, POST, CEN)
    w = m.w.to_numpy()
    diag[c] = dict(n=int(len(m)), beta=beta, dG=wmean(m.dG, w), I=wmean(m.I, w),
                   pos=100 * wmean((m.I > 0).astype(float), w))
exp['prerepair'] = diag
exp['published_2026_07_09'] = {
    'Berkeley': dict(n=969, beta=0.00377, dG=0.0955, I=0.1074, pos=94.3),
    'Los Angeles': dict(n=997, dG=0.1170), 'San Diego': dict(n=871, dG=0.1792),
    'Riverside': dict(n=754, dG=0.2148), 'Merced': dict(n=766, dG=0.0600)}

os.makedirs(OUT, exist_ok=True)
with open(os.path.join(OUT, 'twin_expected.json'), 'w', encoding='utf-8') as fh:
    json.dump(exp, fh, indent=1)
print('wrote', os.path.join(OUT, 'twin_expected.json'))
