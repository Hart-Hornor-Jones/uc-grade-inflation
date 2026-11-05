# Grade-inflation site — build and verification

One consolidated site: `..\index.html` (six hash-routed tabs) + `..\methods.html`
+ two payloads beside them, `..\data_inflation.js` (4.9 MB) and `..\data_bands.js`
(73 KB) — keep all four files together. Tabs: 1 What changed, 2 Same school,
different doors, 3 The crowded top, 4 The shrinking top third, 5 The yardstick
bench, 6 One school at a time. All six are built. The four standalone tools in
`grade-inflation-tools\` are untouched; this folder supersedes nothing there.

## Tab 1 and the Universitywide pool

Tab 1 is the staged triptych: panel A the within-school grade change, panel B that
change against an achievement anchor with two selectable references, panel C the
distance from whichever reference is chosen (red above, blue below). One population
runs through all three, and any dot or row opens that school on tab 6.

Its default pool is UC's own **Universitywide** aggregate, in which a student who
applies to several campuses is counted once. That pool is NOT in
`dv_admissions_all9.csv` — the nine-campus extract drops it — so it is rebuilt here:

    python make_uw_csv.py            # out\uw_*_raw.csv + out\dim.csv -> out\dv_admissions_uw.csv

The three inputs it reads are slices of the ~558 MB consolidated dump, cut with
`extract_dv_uw.py` (which runs the full extract straight from the dump if you have it
mounted). `build_inflation_data.py` then encodes that pool into the payload under the
key `uw`, deliberately OUTSIDE the nine-campus arrays, so every campus index in
`core.js` is exactly where it always was and tabs 2, 3, 5 and 6 cannot move. Code
reaches the pool by passing a pool index of **-1** wherever a campus index is expected.

Two checks worth keeping: the nine-campus arrays of the rebuilt payload are
byte-identical to the previous one, and the Universitywide pool reproduces the
9 July 2026 study's headline change of +0.0955 (it gets +0.0958) — that study read the
grade tab's campus control one position out and published this pool under Berkeley's
name.

## Tab 4 and the graduation payload

Tab 4 is the only section that does not read `data_inflation.js`. It reads
`data_bands.js`, built from the University's own Graduation Dashboard harvest
(`outcomes data\ug_outcomes_gpa_groups_summary_api_full\`):

    python build_bands_data.py       # vizql_long.csv -> out\gi_bands.js AND ..\data_bands.js

That harvest is one row per (state x worksheet x group x GPA band x measure).
Three rules govern reading it, and the script states each one where it applies:

  * ANCHOR on `measure_period == '4yr'` AND on `student_level == 'Freshman'`.
    Freshmen and transfers use different period vocabularies (4/5/6 against
    2/3/4), so filtering on the period alone silently drops every transfer. The
    anchor row already carries the whole degree ladder for its cell, so one row
    per cell gives everything.
  * `cohort_denominator_inferred` repeats across the measures of a cell. Sum it
    ONCE, on the anchor row.
  * THREE SPLITS, THREE TOTALS. No total-only view covers 2010-2021 and each
    split drops its own unknowns. Totals are the Pell split summed (the least
    lossy) and are called a lower bound wherever they appear. The build measures
    the shortfall of the other two splits (first-generation recovers 97.9% of
    the Pell total, ethnicity 97.2%) and ships it in the payload so the page can
    state it.

Maturity is derived, not assumed: a horizon is immature for a cohort when every
"only" increment for that year is exactly zero. On the June 2026 vintage that is
six years through the class entering 2019 and five years through 2020, and the
payload stores `null` there so no figure can draw a number that does not exist.

## Opening the site

Double-click `index.html` (or open it in any browser). No server, no network.
`#doors`, `#crowded`, `#bench`, `#school`, `#changed`, `#bands` are linkable.

## Rebuilding (PowerShell, from this `build\` folder)

    python build_site.py            # src\ -> ..\index.html + ..\methods.html

`data_inflation.js` is the payload from `build_inflation_data.py` (its
`out\gi_data.js`, copied up unchanged). You only need to re-run that if the source
CSVs change:

    python build_inflation_data.py
    copy out\gi_data.js ..\data_inflation.js

`build_inflation_data.py` and `twin.py` read the source CSVs. Their defaults are the
sandbox staging paths; on this machine either edit the constants at the top or set
environment variables before running:

    $env:DV_NEW = "C:\Users\harth\svetlana\Svetlana\uc-merit-admissions\data\dv_admissions_all9.csv"
    $env:DV_OLD = "C:\Users\harth\svetlana\Svetlana\uc-merit-admissions\data\dv_admissions_all9_pre_gpa_repair_20260730.csv"
    $env:PAN   = "C:\Users\harth\svetlana\Svetlana\uc-merit-admissions\data\panel_all9_by_year.csv"
    $env:SC    = "C:\Users\harth\svetlana\hs data\star-scores\panel\star_cahsee_panel.csv.gz"
    $env:TC    = "C:\Users\harth\svetlana\hs data\ap-sat-act-refined\panel\test_context_panel.csv"

(`twin.py` reads the environment variables; `build_inflation_data.py` still uses its
top-of-file constants — edit those in place.)

## Tab 3 and the derived denied pool

The headline series on tab 3 is the separation between the admitted group and the
group the same school had turned away. UC publishes the applicant mean, the admitted
mean and both counts; the denied mean is the arithmetic remainder, so the estimator
library derives it cell by cell:

    A applicants at mean g_A, D admitted at mean g_D
    R = A - D denied, at mean  g_R = (A*g_A - D*g_D) / R
    and therefore, exactly:    g_D - g_A = (1 - p) * (g_D - g_R),   p = D/A

`core.js` gains five shared entry points, all of them exercised by both verification
paths and all of them available to any tab:

    deniedCell(si, ci, y, minR)   the derived denied pool for one school-campus-class,
                                  withheld below minR denied students (default 10),
                                  carrying err = 0.005 * (1 + (A+D)/R)
    survival(ci, years, gate, thresholds, ser, filter)
                                  share of applicant mass at or above each threshold
    separation(ci, years, gate, minR, filter[, schoolGate])
                                  separation, gap, rounding bound and admission rate at
                                  pool-period or school-pool-period grain
    periods(len)                  fixed-width class blocks spanning 1994-2025
    logit(p)                      the log-odds selectivity axis

`err` matters. The published means carry two decimals, so the derived denied mean
inherits a rounding error amplified by A/R, and the separation a worst-case bound of
0.005 * (1 + (A+D)/R). The tab draws that bound as a band around every line, prints it
in the summary strip, and in the scatter draws any point above 0.10 grade points hollow
and leaves it out of the fit rather than dropping it silently. Weighted mean bound,
classes 2020-25: Berkeley 0.012, Merced 0.099.

The identity is asserted at machine precision in `twin.py` (`exp['identity']`) and again
in `test_tools.js`: largest deviation 7.5e-16 over 18,553 Universitywide cells, 9.7e-16
over 12,427 Berkeley cells, 6.7e-16 over 7,499 Merced cells.

One reading caution is built into the figure rather than left to the text. Because
separation = gap / (1 - p), it climbs with the admission rate even if nothing about the
grades changes, so the separation-against-selectivity scatter draws the curve the
arithmetic alone would produce (the gap held at its weighted mean) beside the fitted
tilt, and the subtitle reports both the separation tilt and the gap tilt.

## Verification chain (run in this order)

    npm i jsdom                     # once, in this folder
    python twin.py                  # independent Python recomputation -> out\twin_expected.json
    node   dump_js.js               # the browser's answers from ..\index.html -> out\js_actual.json
    python compare.py               # asserts the two agree: 2,359 values, 0 disagreements expected
    python verify_bands.py          # tab 4, checked against a SECOND source file:
                                    # 26,344 values, 0 failures expected
    node   test_tools.js            # 219 headless assertions: shell routing, style tokens,
                                    # the tab 1 triptych and its deep link, tab 4's
                                    # controls and masking, tab 3's separation measure,
                                    # survival curves and scatter, and all ported tools

`verify_bands.py` is a separate chain on purpose: `build_bands_data.py` reads the
harvest's LONG file and anchors on the 4yr measure row, while `verify_bands.py`
reads the WIDE file, which carries the University's OWN published cumulative rates
beside the counts. Two files, two column sets, one answer. It also cross-foots the
denominators three ways (campus "All" against the nine campuses summed; the Pell
split against the other two; and, in the 40 cells where UC publishes one, against
the dashboard's own Overall sheet), pins 2010 top-tier four-year = 74.1%, the 2021
upper cut = 3.92, and the six-year top-minus-bottom gap inside 13.4-14.5 points (13.5 before UCOP's September 2026 data revision) in
every mature cohort, and writes `out\bands_expected.json`, which `test_tools.js`
then compares against what the browser actually computes.

`twin.py` also needs `DV_UW` (it defaults to `out\dv_admissions_uw.csv`). Its tab 1
battery rounds each anchor exactly as the payload encoder rounds it — the payload stores
anchors as fixed-width integer codes, so without that step the browser and the twin are
being asked to agree on different inputs and the 2e-5 bar would be meaningless.

Optional screenshots (needs Playwright):

    npm i playwright
    npx playwright install chromium
    node shot.js                    # full-page shots of every tab, at 1360px and
                                    # at 390px, -> shots\ ; exits nonzero on any
                                    # page error

All scripts use paths relative to this folder and UTF-8 explicitly; they run the same
under PowerShell and in the sandbox.

## Layout

    ..\index.html            the site (built — do not edit by hand)
    ..\methods.html          methods and sources page (built)
    ..\data_inflation.js     shared payload (built by build_inflation_data.py)
    build_site.py            assembler: src\ -> the two pages
    src\shell.html           site frame: header, tab nav, placeholders, router
    src\style.css            house design tokens (light, sans, sidebar cards)
    src\*.body.html          one section body per tool (ids get prefixed at build)
    src\core.js              decoder + estimators + THE campus color map (CCOL)
    src\doors|margin|bands|bench|card.js   per-tool logic (wrapped in IIFEs at build)
    src\methods.src.html     methods page source
    build_inflation_data.py  CSVs -> out\gi_data.js
    build_bands_data.py      the graduation harvest -> ..\data_bands.js
    verify_bands.py          the independent check on that payload
    twin.py / dump_js.js / compare.py / test_tools.js / shot.js   the chain

## Notes carried over

- Cohort dating: CAASPP +1, STAR grade 11 +1, CAHSEE grade 10 +2, SAT/ACT/AP +0.
- Payload encoding: fixed-width base64url pairs, 4095 ("__") = missing; scale
  factors in meta.scale. Campus labels as repaired 2026-07-30.
- The "Cannot tell you" blocks were removed in the port: their substance now lives
  in the hover definitions on the relevant controls/figures and in methods.html.
- The doors tab's caption was recast per the 2026-08-08 plan §1.3 (ceiling-aware:
  compression measures lost resolution regardless of cause).
