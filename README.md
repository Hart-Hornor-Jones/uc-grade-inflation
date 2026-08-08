# Reading high-school grades — California, classes 1994–2025

An interactive, fully offline site asking what a rising high-school grade point
average still communicates. It is built from the University of California's
published grade point averages for every California high school — applicants,
admitted students and enrolled students, by campus and Universitywide, graduating
classes 1994 to 2025 — set beside every school-level testing program the state
has run since 1999, and beside the University's own graduation records.

The organizing frame is information loss, split into five questions: whether the
scale has crowded against its cap until one grade point distinguishes very little
(compression); whether grades moved away from independent measures of the same
students (criterion divergence); whether admission decisions now express
distinctions the scale no longer states (selection divergence); whether a grade
means the same thing at different schools and in different years (calibration);
and whether the grade a student enters with still predicts what happens afterward
(prediction). Each tab poses one of these as a question and hands the judgments
that drive the answer — periods, populations, anchors, thresholds — to the reader
as controls.

## The site

Four files make the site; keep them together and open `index.html` in any
browser. No server, no network, nothing loaded from elsewhere.

    index.html           six hash-routed tabs (#changed #doors #crowded #bands #bench #school)
    methods.html         the linked methods-and-sources page
    data_inflation.js    the shared high-school payload (4.9 MB)
    data_bands.js        the payload behind tab 4 (73 KB)

Tabs, in argument order:

1. **What changed** — within-school grade change beside achievement change, and
   the residual, one dot per school.
2. **Same school, different doors** — the nine campus slices of the same schools,
   ordered by depth; change against starting level; the 1994–2025 chain index.
3. **The crowded top** — the separation between admitted and denied students
   (denied means derived exactly from the published figures), crowding at the
   top of the scale, and separation against selectivity.
4. **The shrinking top third** — the University's own thirds of each entering
   class: the band boundaries' march toward the cap, and the graduation rates
   the thirds still predict.
5. **The yardstick bench** — the anchored estimate under every contestable
   choice: two periods, seven anchors, the rate control, the waterfall.
6. **One school at a time** — one school's grade record beside every independent
   measure of its students, with an optional comparison school.

Tabs 1, 2, 3, 5 and 6 read `data_inflation.js`. Tab 4 reads `data_bands.js`; the
two payloads share no records and no identifiers, so either can be rebuilt on its
own.

## Rebuilding and verifying

The `build/` folder holds the sources, the assembler, and a verification chain
that recomputes the site's numbers independently. From `build\` (PowerShell):

    python build_site.py            # src\ -> ..\index.html + ..\methods.html

    npm i jsdom                     # once
    python twin.py                  # independent recomputation from the source CSVs
    node   dump_js.js               # the browser's answers from ..\index.html
    python compare.py               # 2,359 values, 0 disagreements expected
    python verify_bands.py          # tab 4 against a second source file; 26,344 values
    node   test_tools.js            # 219 headless assertions, all expected to pass

`twin.py` reads the high-school source CSVs; set the environment variables listed
in `build/README.md` (or edit the constants at the top of the script) before
running it. `verify_bands.py` needs none of those and reads the graduation
harvest directly. The optional screenshot pass (`node shot.js`, after
`npm i playwright`) renders every tab at desktop and 390-pixel widths and fails
on any page error.

`build/README.md` is the full runbook, including regenerating both data payloads
from their sources and the reading rules each source requires.

## Data

Sources, vintages and estimator definitions are documented on the site itself:
`methods.html`, including the data inventory and the provenance of the campus
labels (as repaired 30 July 2026). Nothing on the site is framed as evidence
about test policy in either direction.

## License and credit

Code is MIT-licensed; the data payloads are derived from public records and
remain subject to their sources' terms — see `LICENSE`. Authorship and citation
line: to be added.
