# LESSONS - auto-maintained by scripts/lessons.py

> Machine-owned. Do NOT hand-edit. Changes are overwritten on the next `lessons.py` write.
> Canonical state lives in `.specs/lessons.json`. Edit lessons only via the script.
> promote_threshold=2 distinct features · window_days=45 · quarantine_threshold=2

## Confirmed (load these at Plan/Checks)

Corroborated across multiple features. Safe to apply as guidance.

_none_

## Candidates (under observation - do NOT load as guidance yet)

Seen once or not yet corroborated. Tracked, not trusted.

### L-001 - Test pagination with several rows per joined relation; ordering by a joined column makes take/limit count joined rows instead of parent entities
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `pagination` · harmful: 0
- features: app-hardening
- evidence: verification.md finding 1; src/controller/PostGetAllAction.ts (pagination)
- last seen: 2026-10-29T05:21:27Z

### L-002 - Bound a timing assertion close to the value the criterion fixes, not at double it
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `timeouts` · harmful: 0
- features: app-hardening
- evidence: verification.md finding 2; tests/integration/health.test.ts (timeouts)
- last seen: 2026-10-29T05:21:27Z

### L-003 - Send shutdown signals twice in lifecycle tests; register handlers with on, not once, so a repeated signal cannot reach the default handler
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `lifecycle` · harmful: 0
- features: app-hardening
- evidence: verification.md finding 3; src/server.ts (lifecycle)
- last seen: 2026-10-29T05:21:27Z

### L-004 - Parse numeric environment variables as decimal digits with explicit bounds; z.coerce.number accepts hex, exponent and timer-overflowing values
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `config` · harmful: 0
- features: app-hardening
- evidence: verification.md finding 4; src/config.ts (config)
- last seen: 2026-10-29T05:21:28Z

### L-005 - After changing a technology decision, grep code, comments and package metadata for the replaced name
- signal: `spec_deviation` · recurrence: 1 feature(s) · scope: `docs` · harmful: 0
- features: app-hardening
- evidence: verification.md finding 5 (docs)
- last seen: 2026-10-29T05:21:28Z

### L-006 - Run session-scoped SQL settings such as FOREIGN_KEY_CHECKS on one dedicated connection, never through the pool
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `tests` · harmful: 0
- features: app-hardening
- evidence: verification.md finding 6; tests/helpers.ts (tests)
- last seen: 2026-10-29T05:21:28Z

### L-007 - Exercise a release script's publish path against a throwaway local registry; inspecting what is already published proves nothing about the next push
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `release` · harmful: 0
- features: container-image
- evidence: verification.md finding 1; scripts/image.sh (release)
- last seen: 2026-10-29T06:23:22Z

### L-008 - Assert each severity a scan must catch separately; an alternation regex passes when only one of them is scanned
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `scanning` · harmful: 0
- features: container-image
- evidence: verification.md finding 2; tests/image/scripts.test.ts (scanning)
- last seen: 2026-10-29T06:23:22Z

### L-009 - Run tests of clean-tree guards in a committed snapshot clone so mutations and local edits cannot satisfy the guard for the wrong reason
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `release` · harmful: 0
- features: container-image
- evidence: verification.md finding 3; tests/image/scripts.test.ts (release)
- last seen: 2026-10-29T06:23:22Z

### L-010 - Tie a commit tag to the revision recorded in the image, not to a tag-name pattern
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `release` · harmful: 0
- features: container-image
- evidence: verification.md finding 4; tests/image/registry.test.ts (release)
- last seen: 2026-10-29T06:23:22Z

### L-011 - Test a minimum bound with the value just below it and the value at it, not only with a far-off value
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `chart` · harmful: 0
- features: helm-chart
- evidence: verification.md finding 1; values.schema.json (chart)
- last seen: 2026-10-29T06:33:39Z

### L-012 - Render optional sources that combine together in one case and assert the merged result
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `chart` · harmful: 0
- features: helm-chart
- evidence: verification.md finding 2; templates/_helpers.tpl (chart)
- last seen: 2026-10-29T06:33:39Z

### L-013 - Test each condition of a compound template guard on its own
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `chart` · harmful: 0
- features: helm-chart
- evidence: verification.md finding 3; templates/ratelimit.yaml (chart)
- last seen: 2026-10-29T06:33:39Z

### L-014 - Give long-running workloads a component label in every selector so hook Jobs of the same release are never selected
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `chart` · harmful: 0
- features: helm-chart
- evidence: verification.md finding 4; templates/deployment.yaml (chart)
- last seen: 2026-10-29T06:33:40Z

### L-015 - Keep release configuration as tracked resources; give pre-install hook Jobs their own hook-scoped copies
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `chart` · harmful: 0
- features: helm-chart
- evidence: verification.md finding 5; templates/_helpers.tpl (chart)
- last seen: 2026-10-29T06:33:40Z

### L-016 - Fail the render when values that must agree with each other contradict, not only when a single value is out of range
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `chart` · harmful: 0
- features: helm-chart
- evidence: verification.md finding 6; templates/_helpers.tpl (chart)
- last seen: 2026-10-29T06:33:40Z

## Quarantined (failed when applied - ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
