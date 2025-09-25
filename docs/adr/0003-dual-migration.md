# ADR-0003 Dual Migration (2025‑09‑18)

## Context

Need zero‑downtime switch with measurable safety.

## Decision

- Phase0 measure → Phase1 dual write → Phase2 dual read → Phase3 switch
- Numeric thresholds & auto rollback per spec §19, §21

## Consequences

- Longer overlap but reversible at any time
