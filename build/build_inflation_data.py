#!/usr/bin/env python3
"""
build_inflation_data.py — one payload for the four grade-inflation tools.

Sources (all staged from Hart's disk):
  dv_admissions_all9.csv      UC funnel + GPA, per CEEB x campus x admission year, 1994-2025
                              (GPA columns are the 2026-07-30 offset-REPAIRED ones)
  dv_admissions_uw.csv        the SAME funnel for UC's own Universitywide aggregate, in which
                              an applicant to several campuses is counted ONCE. Built by
                              make_uw_csv.py from the raw consolidated dump; kept OUT of the
                              nine-campus arrays so every existing campus index is unmoved.
  panel_all9_by_year.csv      CAASPP (already lagged Y-1 = the class's own grade-11 spring),
                              A-G eligible counts, 9-12 enrollment, UPP; 2015-2025
  star_cahsee_panel.csv.gz    STAR CST grade-11 ELA and CAHSEE grade-10 ELA, test springs 2001-2015
  test_context_panel.csv      SAT / ACT / AP, college-bound, academic years 1998-99 -> 2019-20

COHORT DATING (Hart's standing convention): every series is placed on the
GRADUATING CLASS year, which equals the UC admission year.
  CAASPP        grade 11, spring S      -> class S+1   (panel already lagged: use panel year as-is)
  STAR CST ELA  grade 11, spring S      -> class S+1
  CAHSEE ELA    grade 10, spring S      -> class S+2
  SAT/ACT/AP    grade 12, senior-weighted -> class S   (= uc_cycle_year in the test panel)

Output: JS payloads under out/.  Encoding is fixed-width base64url pairs:
  each value 0..4094 -> 2 chars;  4095 ("__") = missing.
"""
import pandas as pd, numpy as np, json, os, sys

# Override with environment variables of the same name, or edit the defaults.
UP  = os.environ.get('GI_UPLOADS', '/mnt/user-data/uploads/')
DV  = os.environ.get('DV_NEW', UP + 'Svetlana/uc-merit-admissions/data/dv_admissions_all9.csv')
DVUW = os.environ.get('DV_UW', os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                            'out', 'dv_admissions_uw.csv'))
PAN = os.environ.get('PAN', UP + 'Svetlana/uc-merit-admissions/data/panel_all9_by_year.csv')
SC  = os.environ.get('SC', UP + 'hs data/star-scores/panel/star_cahsee_panel.csv.gz')
TC  = os.environ.get('TC', UP + 'hs data/ap-sat-act-refined/panel/test_context_panel.csv')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
os.makedirs(OUT, exist_ok=True)

B64 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_"
NULL = "__"

def enc(v):
    """v -> 2 base64url chars; None/NaN -> '__'."""
    if v is None:
        return NULL
    try:
        if isinstance(v, float) and not np.isfinite(v):
            return NULL
    except TypeError:
        return NULL
    i = int(round(v))
    if i < 0 or i > 4094:
        return NULL
    return B64[i >> 6] + B64[i & 63]

def encz(z, scale=250, off=2048):
    """signed z -> 2 chars around an offset."""
    if z is None or (isinstance(z, float) and not np.isfinite(z)):
        return NULL
    return enc(off + z * scale)

CAMPUS = ['Berkeley','Davis','Irvine','Los Angeles','Merced',
          'Riverside','San Diego','Santa Barbara','Santa Cruz']
CI = {c: i for i, c in enumerate(CAMPUS)}

# ----------------------------------------------------------------- 1. funnel
print('reading dv ...', flush=True)
dv = pd.read_csv(DV, dtype={'ceeb': str}, encoding='utf-8')
dv = dv[dv.campus.isin(CI)]
Y0, Y1 = int(dv.year.min()), int(dv.year.max())
NY = Y1 - Y0 + 1
print(f'  {len(dv):,} rows, {dv.ceeb.nunique():,} CEEBs, classes {Y0}-{Y1}')

# school directory: most recent name/city/county per CEEB
last = dv.sort_values('year').groupby('ceeb').tail(1).set_index('ceeb')
ceebs = sorted(dv.ceeb.unique())
SIDX = {c: i for i, c in enumerate(ceebs)}
NS = len(ceebs)

print('reading Universitywide pool ...', flush=True)
uw = pd.read_csv(DVUW, dtype={'ceeb': str}, encoding='utf-8')
uw = uw[uw.ceeb.isin(SIDX)]                 # nine-campus school universe only: NS is unmoved
print(f'  {len(uw):,} rows, {uw.ceeb.nunique():,} CEEBs, classes '
      f'{int(uw.year.min())}-{int(uw.year.max())}')

# ----------------------------------------------------------- 2. school-year covariates
print('reading panel (CAASPP / A-G / UPP) ...', flush=True)
pan = pd.read_csv(PAN, dtype={'ceeb': str, 'cds14': str}, encoding='utf-8',
                  usecols=['ceeb','cds14','campus','year','avg_pct_met','ag_cohort',
                           'ag_met_uccsu_count','enroll_9_12','upp_pct'])
# these covariates are identical across the 9 campus rows of a (ceeb,year) — collapse
cov = (pan.groupby(['ceeb','year'])
          .agg(caaspp=('avg_pct_met','max'), agc=('ag_cohort','max'),
               agm=('ag_met_uccsu_count','max'), h912=('enroll_9_12','max'),
               upp=('upp_pct','max'), cds14=('cds14','first'))
          .reset_index())
cov['cls'] = cov.year                      # panel year IS the class year (CAASPP pre-lagged)
print(f'  {len(cov):,} school-years, CAASPP present in {cov.caaspp.notna().sum():,}')

# CEEB <-> CDS14 map from the repo crosswalk as carried on the panel
ceeb_of_cds = (pan.dropna(subset=['cds14'])[['cds14','ceeb']]
                  .drop_duplicates().set_index('cds14').ceeb.to_dict())

# ------------------------------------------------------ 3. census rulers (STAR / CAHSEE)
print('reading star/cahsee panel ...', flush=True)
sc = pd.read_csv(SC, dtype={'ceeb': str, 'cds14': str}, encoding='utf-8',
                 usecols=['cds14','test_year','ceeb','is_high_school',
                          'star_ela_g11_pct_prof_plus','star_ela_g11_tested',
                          'cahsee_ela_pct_passed','cahsee_ela_tested'])
sc = sc[(sc.is_high_school == True) & sc.ceeb.notna()]

def wagg(df, key, val, wt):
    """tested-weighted mean of val within key; falls back to plain mean."""
    d = df.dropna(subset=[val]).copy()
    d['_w'] = d[wt].fillna(1.0).clip(lower=1e-9)
    g = d.groupby(key).apply(
        lambda t: np.average(t[val], weights=t['_w']), include_groups=False)
    return g

star = wagg(sc, ['ceeb','test_year'], 'star_ela_g11_pct_prof_plus', 'star_ela_g11_tested')
cah  = wagg(sc, ['ceeb','test_year'], 'cahsee_ela_pct_passed',      'cahsee_ela_tested')
star = star.rename('v').reset_index(); star['cls'] = star.test_year + 1   # grade 11 -> class S+1
cah  = cah.rename('v').reset_index();  cah['cls']  = cah.test_year  + 2   # grade 10 -> class S+2
print(f'  STAR g11: {len(star):,} school-classes {star.cls.min()}-{star.cls.max()}')
print(f'  CAHSEE  : {len(cah):,} school-classes {cah.cls.min()}-{cah.cls.max()}')

# ------------------------------------------------ 4. college-bound rulers (SAT / ACT / AP)
print('reading test-context panel ...', flush=True)
tc = pd.read_csv(TC, dtype={'ceeb': str, 'cds14': str}, encoding='utf-8',
                 usecols=['cds14','uc_cycle_year','ceeb','grade_12_enrollment',
                          'sat_takers','sat_pct_tested','z_sat_primary',
                          'act_pct_ge_21','act_takers','ap_exams_ge_3','ap_pass_share',
                          'ap_exams','ap_exams_per_g12'])
tc = tc[tc.ceeb.notna()].copy()
tc['cls'] = tc.uc_cycle_year                              # senior-year test -> class S
tc['g12w'] = tc.grade_12_enrollment.fillna(1.0).clip(lower=1e-9)
tc['ap_ge3_per_g12'] = np.where(tc.grade_12_enrollment > 0,
                                tc.ap_exams_ge_3 / tc.grade_12_enrollment, np.nan)

def cbagg(val, wt='g12w'):
    return wagg(tc, ['ceeb','cls'], val, wt).rename(val).reset_index()

cb = cbagg('z_sat_primary')
for v, w in [('act_pct_ge_21','act_takers'), ('ap_pass_share','ap_exams'),
             ('ap_ge3_per_g12','g12w'), ('sat_pct_tested','g12w'),
             ('grade_12_enrollment','g12w')]:
    cb = cb.merge(cbagg(v, w), on=['ceeb','cls'], how='outer')
print(f'  college-bound: {len(cb):,} school-classes {cb.cls.min()}-{cb.cls.max()}')

# ------------------------------------------------------------- 5. one census column
# priority per class: CAASPP (2016-2020, 2023-2025) > STAR g11 (2004-2014) > CAHSEE (fill)
caaspp = cov.dropna(subset=['caaspp'])[['ceeb','cls','caaspp']].rename(columns={'caaspp':'v'})
caaspp['src'] = 3
star2 = star[['ceeb','cls','v']].copy(); star2['src'] = 2
cah2  = cah [['ceeb','cls','v']].copy(); cah2 ['src'] = 1
census = pd.concat([caaspp, star2, cah2], ignore_index=True)
census = census[census.ceeb.isin(SIDX)]
# ONE instrument per class: the highest-priority source that covers >=500 schools that
# class (else the highest-priority source available).  Keeps every class internally
# comparable and confines the instrument break to the seams between classes.
keep = {}
for cls, t in census.groupby('cls'):
    n = t.groupby('src').size()
    big = [s for s in sorted(n.index, reverse=True) if n[s] >= 500]
    keep[cls] = big[0] if big else max(n.index)
census = census[[keep[c] == s for c, s in zip(census.cls, census.src)]]
census = census.drop_duplicates(subset=['ceeb','cls'], keep='first')
# z within (class x instrument), over the UC-applicant universe only
g = census.groupby(['cls','src']).v
census['z'] = (census.v - g.transform('mean')) / g.transform('std')
census.loc[g.transform('count') < 25, 'z'] = np.nan     # too thin to standardise
SRCNAME = {1: 'CAHSEE grade 10 ELA (% passed)',
           2: 'STAR CST grade 11 ELA (% proficient or above)',
           3: 'CAASPP grade 11 (mean of ELA and math % met or exceeded)'}
print('  census coverage by class:')
t = census.pivot_table(index='cls', columns='src', values='v', aggfunc='size')
print(t.to_string())

# --------------------------------------------------------------- 6. encode
print('encoding ...', flush=True)

# 6a funnel: per (school, campus) a dense run over [y0..y1] of A D E agpa dgpa egpa
dv['si'] = dv.ceeb.map(SIDX)
dv['ci'] = dv.campus.map(CI)
dv = dv.sort_values(['si','ci','year'])
FUN = [[None]*len(CAMPUS) for _ in range(NS)]
for (si, ci), t in dv.groupby(['si','ci'], sort=False):
    y0 = int(t.year.min()); y1 = int(t.year.max())
    idx = {int(y): k for k, y in enumerate(t.year)}
    A = t.applicants.to_numpy(); D = t.admits.to_numpy(); E = t.enrollees.to_numpy()
    ag = t.app_gpa.to_numpy(); dg = t.adm_gpa.to_numpy(); eg = t.enr_gpa.to_numpy()
    buf = []
    for y in range(y0, y1+1):
        k = idx.get(y)
        if k is None:
            buf.append(NULL*6)
        else:
            buf.append(enc(A[k]) + enc(D[k]) + enc(E[k]) +
                       enc(ag[k]*100) + enc(dg[k]*100) + enc(eg[k]*100))
    FUN[si][ci] = [y0, ''.join(buf)]

# 6a' the Universitywide pool: one dense run per school, same six fields as 6a.
UW = [None]*NS
uw['si'] = uw.ceeb.map(SIDX)
uw = uw.sort_values(['si', 'year'])
for si, t in uw.groupby('si', sort=False):
    y0 = int(t.year.min()); y1 = int(t.year.max())
    idx = {int(y): k for k, y in enumerate(t.year)}
    A = t.applicants.to_numpy(); D = t.admits.to_numpy(); E = t.enrollees.to_numpy()
    ag = t.app_gpa.to_numpy(); dg = t.adm_gpa.to_numpy(); eg = t.enr_gpa.to_numpy()
    buf = []
    for y in range(y0, y1+1):
        k = idx.get(y)
        if k is None:
            buf.append(NULL*6)
        else:
            buf.append(enc(A[k]) + enc(D[k]) + enc(E[k]) +
                       enc(ag[k]*100) + enc(dg[k]*100) + enc(eg[k]*100))
    UW[int(si)] = [y0, ''.join(buf)]
print(f'  Universitywide encoded for {sum(1 for e in UW if e):,} of {NS:,} schools')

# 6b rulers: per school a dense run over [RY0..RY1] of
#   census*10, csrc, z_sat, act%>=21 *10, ap pass share *10, ap>=3 per g12 *100,
#   g12 enrolment, A-G completers, UPP*10, applicants-all-campus
RY0, RY1 = Y0, Y1
cen = census.set_index(['ceeb','cls'])
cbi = cb.set_index(['ceeb','cls'])
covi = cov.set_index(['ceeb','cls'])

def gv(fr, key, col):
    try:
        v = fr.at[key, col]
    except KeyError:
        return None
    if isinstance(v, pd.Series):
        v = v.iloc[0]
    return None if (v is None or (isinstance(v, float) and not np.isfinite(v))) else float(v)

RUL = [None]*NS
for ce, si in SIDX.items():
    buf = []
    any_ = False
    for y in range(RY0, RY1+1):
        k = (ce, y)
        c  = gv(cen, k, 'v');   s = gv(cen, k, 'src'); cz = gv(cen, k, 'z')
        zs = gv(cbi, k, 'z_sat_primary')
        ac = gv(cbi, k, 'act_pct_ge_21')
        ap = gv(cbi, k, 'ap_pass_share')
        a3 = gv(cbi, k, 'ap_ge3_per_g12')
        g12= gv(cbi, k, 'grade_12_enrollment')
        agm= gv(covi, k, 'agm'); up = gv(covi, k, 'upp')
        grp = (enc(None if c is None else c*40) + enc(s) + encz(cz) + encz(zs) +
               enc(None if ac is None else ac*40) + enc(None if ap is None else ap*40) +
               enc(None if a3 is None else a3*400) + enc(g12) + enc(agm) +
               enc(None if up is None else up*40))
        if grp != NULL*10:
            any_ = True
        buf.append(grp)
    RUL[si] = ''.join(buf) if any_ else ''

# 6c school directory
SCH = []
for ce in ceebs:
    r = last.loc[ce]
    SCH.append([ce,
                str(r.school_name).title() if pd.notna(r.school_name) else ce,
                str(r.city) if pd.notna(r.city) else '',
                str(r.county) if pd.notna(r.county) else ''])

meta = dict(y0=Y0, y1=Y1, ry0=RY0, ry1=RY1, campus=CAMPUS,
            srcname=SRCNAME, nschools=NS,
            uw_label='Universitywide',
            built='2026-08-08',
            fun_fields=['A','D','E','app_gpa','adm_gpa','enr_gpa'],
            scale=dict(gpa=100, census_pct=40, z=250, zoff=2048, act=40,
                       ap_pass_share=40, ap_ge3_per_g12=400, upp=40),
            rul_fields=['census_pct','census_src','census_z','z_sat','act_pct_ge21',
                        'ap_pass_share','ap_ge3_per_g12','g12','ag_completers','upp'])

def dump(path, obj):
    with open(path, 'w', encoding='utf-8') as f:
        f.write(obj)
    print(f'  {path}  {os.path.getsize(path)/1e6:.2f} MB')

core = ('window.GI={"meta":' + json.dumps(meta, separators=(',',':')) +
        ',"sch":' + json.dumps(SCH, separators=(',',':')) +
        ',"fun":' + json.dumps(FUN, separators=(',',':')) +
        ',"uw":' + json.dumps(UW, separators=(',',':')) +
        ',"rul":' + json.dumps(RUL, separators=(',',':')) + '};')
dump(os.path.join(OUT, 'gi_data.js'), core)

# a slim variant: funnel only, applicants + applicant GPA (fields 0 and 3)
FUN_S = [[None]*len(CAMPUS) for _ in range(NS)]
for si in range(NS):
    for ci in range(len(CAMPUS)):
        e = FUN[si][ci]
        if e is None: continue
        y0, s = e
        out = []
        for k in range(0, len(s), 12):
            out.append(s[k:k+2] + s[k+6:k+8])
        FUN_S[si][ci] = [y0, ''.join(out)]
UW_S = [None]*NS
for si in range(NS):
    e = UW[si]
    if e is None: continue
    y0, t = e
    UW_S[si] = [y0, ''.join(t[k:k+2] + t[k+6:k+8] for k in range(0, len(t), 12))]
slim = ('window.GI={"meta":' + json.dumps({**meta, 'fun_fields':['A','app_gpa']},
                                        separators=(',',':')) +
        ',"sch":' + json.dumps(SCH, separators=(',',':')) +
        ',"fun":' + json.dumps(FUN_S, separators=(',',':')) +
        ',"uw":' + json.dumps(UW_S, separators=(',',':')) +
        ',"rul":' + json.dumps(RUL, separators=(',',':')) + '};')
dump(os.path.join(OUT, 'gi_data_slim.js'), slim)

with open(os.path.join(OUT, 'meta.json'), 'w', encoding='utf-8') as fh:
    json.dump(meta, fh, indent=1)
print('done')
