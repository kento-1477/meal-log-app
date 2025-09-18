# ADR-0002 Never‑Zero Mode (2025‑09‑18)

## Context

Auto generic on schema failure causes false intake. Trust requires user consent.

## Decision

- Default mode = **safe**: no auto generic; show warning + "Add generic" button
- Detect skip keywords → event=skip (totals=null, non-aggregated)

## Consequences

- Lower false positives; slight extra click when ambiguous
