# Settlement summary and manager account input

Scope: production205 settlement calculation display and manager-account editor only.

- Removed the separate deduction-summary row. Existing cost row now includes explicit pre-distribution deductions so displayed arithmetic remains complete.
- Payment row renders only for positive saved payment total, at the same table level, green text/background.
- Calculation algorithm and tax rules unchanged. Details collapsed; legacy reflected company costs now included in detail rows.
- Manager editor owns draft state. Keystrokes do not update SettlementDetail state, save, query profiles, validate settlement, or format account numbers.
- Validation and normalization on Save. Only fields changed from opening values are submitted.
- Account save reads only the existing manager workspace key; merges account fields into the latest profile; compare-and-set on updated_at retries conflicts. This preserves other managers and business fields.
- Server acknowledgement precedes local update. No settlement/evidence/Snapshot writes, reload, broad settlement refetch, or second background save. Existing workspace_state schema/RLS retained; no migration.
- The shared payload is still one manager array, as in the existing storage structure; this change does not introduce a new manager table.

Tests:
- User fixture 293715 - 146858 - 30155 + 3000 =119702; manager50%=59851.
- Payment absent/removed =116702. Render test verifies zero row absent and positive green class.
- Existing direction/confirmed Snapshot regression passes.
- Account mock server: changed fields only, preservation of other fields/profiles, concurrent remote changes retained, validation and server failure.
- Build TypeScript/Vite passed.
- Browser preview attempted via supervised preview and approved browser. Both fixture and root blocked with ERR_BLOCKED_BY_CLIENT. Continuous typing latency/actual operating UI not measured. No live account changes made.
