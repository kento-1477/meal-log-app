# RUNBOOK — Ops & Migration (v1.4)

## 1. Phases

- **P0 Measure**: Legacy only; shadow compute+write to `meal_logs_v2_shadow`; no user impact
- **P1 Dual Write**: Legacy save + shadow save; read = legacy; monitor diffs
- **P2 Dual Read**: Read via adapter(new→old view); compare outputs; visual regression
- **P3 Switch**: New path only; keep shadow 90 days

## 2. Flip/Flags

- Enable: `NORMALIZE_V2_SHADOW` → `DUAL_WRITE_V2` → `DUAL_READ_V2`
- Keep: `NEVER_ZERO_MODE='safe'`, `SET_PROPOSAL_UI=true`
- Optional: `ATWATER_SIMPLE_SCALE`

## 3. Rollback

- Trigger: §19.3 any condition or NPS −3pts
- Action: step back one phase; disable flag; keep shadow; page SRE

## 4. Alerts (Pager)

- ai_parse_fail ≥10% (5m MA) / retry_success ≤50%
- Day diff P90 breach 15m
- unknown\_\* surge +200% / 10m

## 5. Shadow Ops

- Monthly partition; 02:30 archive to object storage; VACUUM weekly
- Nightly cleanup (02:45 JST): `ingest_requests` から `created_at < now() - interval '90 days'` の行を削除

## 6. On-call Quick Commands

- Toggle flags via env/feature service
- Query diffs: `SELECT ... FROM diffs WHERE ts > now()-interval '15 min'`
- Restore log: `POST /logs/:id/restore`
