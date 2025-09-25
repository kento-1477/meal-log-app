# ADR-0001 Atwater Policy (2025‑09‑18)

## Context

Single-scale is simple but may distort protein. Legacy policy (fat adjust → scale) is proven in prod.

## Decision

- Default: **legacy finalizeTotals**; ensure ≤15% error guarantee
- Flag: `ATWATER_SIMPLE_SCALE=true` to A/B (±12% clip)

## Consequences

- Stable diffs vs legacy; simpler path available for future
