# Quality Guidelines

> Code quality standards for frontend development.

---

## Overview

<!--
Document your project's quality standards here.

Questions to answer:
- What patterns are forbidden?
- What linting rules do you enforce?
- What are your testing requirements?
- What code review standards apply?
-->

(To be filled by the team)

---

## Forbidden Patterns

<!-- Patterns that should never be used and why -->

(To be filled by the team)

---

## Required Patterns

<!-- Patterns that must always be used -->

### SBI Fingerprint Data Contract

SBI fingerprint generation and runtime loading must stay in sync:

* `scripts/generate-sbi-data.js` owns `SBI_FINGERPRINT_VERSION`.
* `assets/js/sbi.js` must use the same `SBI_FINGERPRINT_VERSION`.
* `sbi/index.html` must bump the `assets/js/sbi.js?v=` cache buster when SBI runtime or data format changes.
* `hist` values in generated pack fingerprints are Uint8 bins (`0..255`); runtime comparison must normalize pack-side hist values back to `0..1`.
* `data/sbi-fp/*.json` shard payloads use `{ version, type, keys, packs, _index }`.
* `_index` is a best-effort prefilter only; runtime must fall back to full scan when the candidate set is too small.
* After changing SBI generation or runtime matching, run `node scripts/generate-sbi-data.js` and `python test_sbi.py`.

---

## Testing Requirements

<!-- What level of testing is expected -->

(To be filled by the team)

---

## Code Review Checklist

<!-- What reviewers should check -->

(To be filled by the team)
