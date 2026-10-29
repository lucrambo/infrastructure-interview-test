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

## Quarantined (failed when applied - ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
