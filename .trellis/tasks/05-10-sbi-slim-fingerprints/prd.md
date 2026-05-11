# Slim SBI Fingerprints

## Goal

Slim the SBI image-search fingerprint payload according to `docs/SBI_SLIM_PLAN.md` while preserving the existing material-pack matching behavior for screenshots in `test_img/`.

## Requirements

* Follow `docs/SBI_SLIM_PLAN.md` as the source of truth.
* Remove only unused/zero-contribution SBI fingerprint fields and adapt matching code only where required by the plan.
* Quantize histogram data as planned if it can be done without changing match results.
* Keep changes scoped to SBI fingerprint generation, SBI runtime loading/comparison, generated fingerprint data, and cache busting.
* Do not alter unrelated site behavior, unrelated assets, or unrelated documentation.

## Acceptance Criteria

* [ ] `python test_sbi.py` passes all screenshots in `test_img/`.
* [ ] Each `test_img/` screenshot still ranks the expected material pack at top 1.
* [ ] SBI fingerprint payload is smaller than the current baseline.
* [ ] SBI page cache buster is updated for changed runtime/data assets.
* [ ] No unrelated files are intentionally changed.

## Definition of Done

* Implementation follows local project patterns.
* Targeted verification is run and recorded.
* Changes are committed and pushed after successful verification.

## Technical Approach

Implement the low-risk slimming phases from `docs/SBI_SLIM_PLAN.md`: remove fields not consumed by `assets/js/sbi.js`, regenerate `data/sbi-fingerprints.json`, adapt histogram comparison for quantized arrays, and update the SBI cache buster. Validate against the existing browser-driven SBI test harness.

## Decision

Context: The current SBI fingerprint JSON contains feature data that the runtime either never reads or gives zero score contribution.

Decision: Apply the documented slim plan directly and keep runtime behavior compatible with the existing matcher.

Consequences: The payload should shrink without expected ranking loss. Any higher-risk architectural step, such as new server-side matching or ANN indexing, stays outside this task.

## Out of Scope

* Changing matching weights except where required for compatibility.
* Changing `test_img/` expectations.
* Introducing new dependencies or backend services.
* Modifying unrelated pages, styles, admin tools, or pack metadata.

## Technical Notes

* Plan: `docs/SBI_SLIM_PLAN.md`.
* Generator: `scripts/generate-sbi-data.js`.
* Runtime matcher: `assets/js/sbi.js`.
* Data: `data/sbi-fingerprints.json`.
* Page entry/cache buster: `sbi/index.html`.
* Verification: `python test_sbi.py`.
