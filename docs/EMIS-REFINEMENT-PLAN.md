# DNEMIS portal — refinement plan (round 2)

Agreed approach for the 10-item change request against the `agent-emis-ng` instance.
Decisions captured via interview; data coverage verified live on 2026-06-17.

## Data reality (verified on agent-emis-ng, pe=2025)

The instance carries a complete **"MD:" (Minister's Dashboard) indicator set** matching the
requested taxonomy. Coverage in the current test data is uneven — features are wired anyway
so they populate once the data team fills the gaps:

| Metric | Federal | State | LGA |
|---|---|---|---|
| MD Total learners / teachers / female | ✅ | ✅ | ✅ (774) |
| MD school counts (by type) | ✅ | ⚠️ 15/37 | ❌ 0 rows |
| MD "actual reports" / reporting rate | ❌ empty | ❌ | ❌ (only *expected* populated) |
| MD Learner-Classroom / Teacher ratios | ⚠️ broken values | — | — |
| MD % useable toilets | ✅ | — | — |

Instance note: indicators were renamed **Pupil → Learner** (e.g. "MD: IQS/IQTE Learner
Classroom Ratio"). Totals are inflated (test data ≈ 150 M learners) — not a portal concern.

## Items

1. **Pupils → Learners** — rename every "Pupil" label to "Learner" in `template.mjs`
   (`Learner–teacher ratio`, `Learner–toilet ratio`, `Learner-stream ratio`, …) + components.

2. **Strip OU name prefixes** — names carry a 2-letter lowercase code + space
   (`fg Nigeria`, `ri Rivers State`, `ke Zuru LGA`). Normalise once at the source: strip
   `^[a-z]{2}\s` when writing `ou.csv` (extractor) **and** in `generate.mjs` reading it, so
   page titles, breadcrumbs, search index, map tooltips and the compare table are all clean.

3. **Merge Pre-Primary + Primary → "Primary"** — sum the additive counts (enrolment, boys,
   girls, special needs). Female % on the merged row is **recomputed** from merged girls ÷
   (boys+girls). The stream-ratio column is **dropped on the merged Primary row** (a rate,
   not summable).

4. **Minister's level/type order, applied to enrolment too** — order
   **Primary, IQS, JSS, SSS, Tech/Voc**. Mapping from the working ASC by-level set:
   Primary = Pre-Primary+Primary (merged), **IQS = the ANFE / "Adult & Non-Formal (IQS/IQTE)"
   form** (relabel ANFE→IQS), JSS, SSS. **No Tech/Voc enrolment indicator exists**, so that
   bar is absent from the enrolment chart (present only in the #schools chart). Applies to the
   enrolment-by-level chart, sex-by-level chart, and the compare-table tabs.

5. **# schools by type** — new chart from MD school-count indicators, order
   **Primary, IQS, JSS, SSS, Tech/Voc, Total Private, Total Public**. Shown on **all** pages
   (blank on LGA until LGA-level counts are populated). IDs:
   - Primary `v31dkf4PhmH` · IQS/IQTE `CKMgwHERBfg` · JSS `I8JeN23lKHn` · SSS `tuku316VSXL`
   - Tech/Voc `uDBB1WrCkST` · Private `BXTUMWSq4zQ` · Public `U8ytqWQMFwD` · (Total `wVjDYI2HuQb`)

6. **Reporting (top KPI + section)** — replace the Female-learners% KPI with **Reporting rate**
   (= completeness = Σ actual ÷ Σ expected × 100). Add a small **Submitted / Expected /
   Completeness** block. Sum across the 6 census types; blank/0 until actuals are populated.
   - actual: `QLfdf8Jd9dc` `Yr6FePoHpHP` `OTZHZUXsMeN` `zH11dcmH2Pg` `SYwA4fNOprM` `Jx7wWJI1WpR`
   - expected: `dh9fliYibms` `S2cH9F1T7MU` `jZtYw0T5xJl` `jSbbKIsSvK3` `stoCrMx0ED1` `q5mnwKasEpF`

7. **Remove LGA footnote** — delete the "lowest level of detail … no ward- or school-level
   data" line from `leafSection`.

8. **Coat of arms** — replace the `fa-landmark` crest in the DNEMIS header with
   `coat_of_arms.png` (official Nigerian arms; copy into `evidence/static/`). White chip behind
   it so it reads on the green bar.

9. **Title** — "Digital National Education Management Information System (DNEMIS)" in the green
   header (was "Education Statistics").

10. **Print button** — top-right of the green header. Uses Evidence's built-in mechanism:
    dispatch `export-beforeprint`, `window.print()`, `export-afterprint` (charts/maps render
    correctly for paper). No new dependency.

## Pipeline impact

- `asc.yaml` `dx`: **+20 MD indicators** (8 school-count, 6 actual, 6 expected reports).
- Requires re-run: `npm run extract:asc` → `npm run sources` → `npm run build` → `npm run deploy`.
- Validation: capped build (`ASC_MAX_STATES=1 ASC_MAX_LGAS=2`) in the sandbox first to catch
  SQL/template errors before the full ~812-page render (run on host with large heap).

## Files touched

`scripts/dhis2-extract/config/asc.yaml` · `scripts/dhis2-extract/` (prefix strip on ou.csv) ·
`scripts/asc-pages/template.mjs` · `scripts/asc-pages/generate.mjs` ·
`evidence/components/KpiRow.svelte` (+ new reporting/schools components) ·
`evidence/scripts/patch-evidence.mjs` (arms, title, print) · `evidence/static/coat_of_arms.png`.
