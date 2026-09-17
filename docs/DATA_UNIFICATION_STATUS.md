# Data preservation and shared storage — 2026-09-09

## Verified in this checkout

- SupplierMasterPage reads and writes `t3-suppliers-v1` directly in localStorage. Signing in through Supabase does not synchronize that data.
- Other operational data also uses storageService. Some repositories support Supabase, so each domain must be traced before migration; changing a single provider flag is insufficient.
- The Sites hosting manifest is static, with no D1 or R2 bindings.
- The Sites environment-variable response had no entries during this review. The currently served bundle may have build-time configuration that is absent here. Do not deploy a replacement until the existing Supabase URL and public client key are supplied through the appropriate configuration mechanism. Never put a service-role key in Vite variables.
- Employee browser contents, remote database rows, live row-level security, and attachment bytes have NOT been backed up or verified in this environment.

## Prepared changes

- Supplier JSON backup accessible to supplier editors; broader browser backup restricted in the UI to CEO/admin.
- Backups keep original raw values (including malformed JSON), identify their source origin and timestamp, and do not modify storage. They exclude unrelated keys and authentication/session keys.
- Invalid JSON reads in storageService no longer replace the original value with defaults. This is preservation on read, not complete protection against later writes.
- Backups cover localStorage only. Remote files, IndexedDB, server rows, and data in other browsers require separate inventories.

## Remaining work before calling this unified

1. Restore existing build configuration from the authorized Supabase project; verify approved-user login before deployment.
2. Publish backup UI to the old origin. Obtain backups from the employee's original browser/profile and the owner's original browser/profile. Keep originals unchanged.
3. Inspect actual Supabase schema, role policies, row counts, and private file storage. The checked-in schema alone is not evidence of production state; do not execute the full historical schema or seed data blindly.
4. Implement server-backed CRUD domain by domain with approval and role enforcement, error reporting, stable IDs, conflict checks, and no silent local success on failed writes.
5. Preview migration differences. Insert missing records, review collisions, preserve documents and relationships, and verify counts/fields before selecting the shared store as authoritative.
6. Verify that an authorized MD-created supplier is visible to the owner in a separate session, that reload preserves it, and that unapproved users and unauthorized roles cannot access it. Test concurrent edits and failed saves.
7. Confirm the final custom domain serves the same approved implementation. Retire the old entry point only after preservation and shared-data verification.

No production data was deleted, imported, or overwritten by this change. No database migration was executed.
