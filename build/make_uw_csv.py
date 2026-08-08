#!/usr/bin/env python3
"""Assemble dv_admissions_uw.csv from the pre-filtered raw slices.

The Universitywide pool is UC's own aggregate over all nine campuses, in which a
student who applies to several campuses is counted ONCE. The nine-campus extract
(uc-merit-admissions/build/extract_dv_all9.py) drops it; this rebuilds it with the
identical logic and the identical GPA relabel.
"""
import csv, sys, json, os
from collections import defaultdict, Counter

OUT = os.path.dirname(os.path.abspath(__file__)) + '/out'
K = json.load(open(OUT + '/uw_keys.json', encoding='utf-8'))
eth, gpa = K['eth'], K['gpa']            # state_key -> fall_term

dim = {}
for r in csv.DictReader(open(OUT + '/dim.csv', encoding='utf-8')):
    dim[r['school_id']] = (r['source_school_code_6'], r['school_name'],
                           r['city'], r['county_state_country'])

counts = defaultdict(lambda: defaultdict(float)); meta = {}; miss = 0
for line in open(OUT + '/uw_counts_raw.csv', encoding='utf-8'):
    p = line.rstrip('\n').split(',')
    if len(p) != 8: continue
    if p[0] not in eth: continue
    if p[5] != 'race_ethnicity' or p[6] != 'All': continue
    d = dim.get(p[1])
    if not d: miss += 1; continue
    key = (d[0], 'Universitywide', eth[p[0]])
    counts[key][p[4]] += float(p[7]); meta[key] = (d[1], d[2], d[3])

gpaval = defaultdict(dict)
for line in open(OUT + '/uw_gpa_raw.csv', encoding='utf-8'):
    p = line.rstrip('\n').split(',')
    if len(p) != 6: continue
    if p[0] not in gpa: continue
    d = dim.get(p[1])
    if not d: continue
    try: gpaval[(d[0], 'Universitywide', gpa[p[0]])][p[4]] = float(p[5])
    except ValueError: pass

out = []
for k, sc in counts.items():
    ceeb, campus, year = k; nm, city, county = meta[k]; g = gpaval.get(k, {})
    out.append([ceeb, campus, year,
                int(sc.get('applicants', 0)) or '', int(sc.get('admits', 0)) or '',
                int(sc.get('enrollees', 0)) or '',
                g.get('applicants', ''), g.get('admits', ''), g.get('enrollees', ''),
                nm, city, county])
out.sort(key=lambda r: (r[1], r[2], r[0]))
with open(OUT + '/dv_admissions_uw.csv', 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    w.writerow(['ceeb','campus','year','applicants','admits','enrollees',
                'app_gpa','adm_gpa','enr_gpa','school_name','city','county'])
    w.writerows(out)
yrs = sorted({r[2] for r in out})
print('rows=%d  ceebs=%d  classes %s-%s  dim_miss=%d' %
      (len(out), len({r[0] for r in out}), yrs[0], yrs[-1], miss))
print('with applicant GPA: %d   with admit GPA: %d' %
      (sum(1 for r in out if r[6] != ''), sum(1 for r in out if r[7] != '')))
