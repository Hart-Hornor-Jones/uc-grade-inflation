#!/usr/bin/env python3
"""
extract_dv_uw.py - the UNIVERSITYWIDE pool, one row per (CEEB, year).

Same source and same logic as build/extract_dv_all9.py in uc-merit-admissions, but
keeping the pool the nine-campus extract throws away: UC's own Universitywide
aggregate, in which a student who applies to several campuses is counted ONCE.

Counts come from the fr-eth-by-yr tab, whose reconstructed `campus` labels are
correct as published ("Universitywide" is last in that tab's campus control).
Grade averages come from fr-gpa-by-yr, whose control lists Universitywide FIRST,
so on that tab the coverage file's "Berkeley" label is in fact Universitywide
(the 2026-07-25 diagnosis, repaired 2026-07-30).

Usage: python extract_dv_uw.py <lean_dump_dir> <out.csv>
"""
import csv, sys
from collections import defaultdict, Counter

LEAN = sys.argv[1]
OUT = sys.argv[2]

COUNTS_ORDER = ["Berkeley","Davis","Irvine","Los Angeles","Merced",
                "Riverside","San Diego","Santa Barbara","Santa Cruz","Universitywide"]
GPA_ORDER = ["Universitywide"] + COUNTS_ORDER[:-1]
GPA_RELABEL = dict(zip(COUNTS_ORDER, GPA_ORDER))
WANT = "Universitywide"

def load_keys(tab, relabel=None):
    keys = {}
    for r in csv.DictReader(open(f"{LEAN}/admissions_freshman_state_coverage.csv", encoding="utf-8")):
        if (r["source_tab"] == tab and r["school_type"] == "California public high school"
                and r["present"] == "True"):
            campus = relabel[r["campus"]] if relabel else r["campus"]
            if campus == WANT:
                keys[r["state_key"]] = (campus, r["fall_term"])
    return keys

eth = load_keys("fr-eth-by-yr")
gpa = load_keys("fr-gpa-by-yr", relabel=GPA_RELABEL)
sys.stderr.write(f"eth_keys={len(eth)} gpa_keys={len(gpa)}\n")

dim = {}
for r in csv.DictReader(open(f"{LEAN}/admissions_freshman_school_dimension.csv", encoding="utf-8")):
    dim[r["school_id"]] = (r["source_school_code_6"], r["school_name"], r["city"], r["county_state_country"])

counts = defaultdict(lambda: defaultdict(float))
meta = {}; miss = 0
with open(f"{LEAN}/admissions_freshman_counts_observed_long.csv", encoding="utf-8") as f:
    next(f)
    for line in f:
        p = line.rstrip("\n").split(",")
        if len(p) != 8: continue
        sk = p[0]
        if sk not in eth: continue
        if p[5] != "race_ethnicity" or p[6] != "All": continue
        d = dim.get(p[1])
        if not d: miss += 1; continue
        ceeb = d[0]; campus, year = eth[sk]
        counts[(ceeb, campus, year)][p[4]] += float(p[7])
        meta[(ceeb, campus, year)] = (d[1], d[2], d[3])

gpaval = defaultdict(dict)
with open(f"{LEAN}/admissions_freshman_gpa_observed_long.csv", encoding="utf-8") as f:
    next(f)
    for line in f:
        p = line.rstrip("\n").split(",")
        if len(p) != 6: continue
        sk = p[0]
        if sk not in gpa: continue
        d = dim.get(p[1])
        if not d: continue
        campus, year = gpa[sk]
        try: gpaval[(d[0], campus, year)][p[4]] = float(p[5])
        except: pass

out = []
for k, sc in counts.items():
    ceeb, campus, year = k; nm, city, county = meta[k]; g = gpaval.get(k, {})
    out.append([ceeb, campus, year,
                int(sc.get("applicants", 0)) or "", int(sc.get("admits", 0)) or "",
                int(sc.get("enrollees", 0)) or "",
                g.get("applicants", ""), g.get("admits", ""), g.get("enrollees", ""),
                nm, city, county])
out.sort(key=lambda r: (r[1], r[2], r[0]))
with open(OUT, "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["ceeb","campus","year","applicants","admits","enrollees",
                "app_gpa","adm_gpa","enr_gpa","school_name","city","county"])
    w.writerows(out)
sys.stderr.write(f"dim_miss={miss} rows={len(out)}\n")
yrs = Counter(r[2] for r in out)
sys.stderr.write("years=%s..%s\n" % (min(yrs), max(yrs)))
sys.stderr.write("rows_with_app_gpa=%d\n" % sum(1 for r in out if r[6] != ""))
