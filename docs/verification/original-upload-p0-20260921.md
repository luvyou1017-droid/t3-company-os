# P0 upload unblock (base 197)

Confirmed regression: 197 changed original upload catch from warning to throw, aborting parsed sales persistence. Original and shared Excel use existing private seller-documents bucket, settlement-exports/campaigns/<campaign UUID>/sales-imports/<import UUID>/<random>-<name>. No bucket/RLS migration was made in 197. The reported message maps to MIME/content-type rejection, not proof of an RLS rejection. Browser-supplied MIME was previously trusted; now canonical MIME is derived from accepted extension.

Fix: independently attempt original storage, persist honest retention warning on failure, continue sales validation/settlement drafting without signing calls. Never reuse prior original path for new failed upload. Old objects and snapshots remain. Source retention failure prevents misleading aggregate Excel generation; sharing remains separate at confirmation. Successful later original upload clears warning.

Verified: existing supplied Otomo Excel parsed using production parser; mocked upload success preserves bytes; MIME rejection still permits actual salesDataService validation/confirmation and settlementService draft with expected gross sales. Historical snapshot remains equal. Build and diff check pass.

Limit: Supabase dashboard opened but session is signed out; no advertised browser authentication capability. Live bucket allowed_mime_types/RLS could not be read or changed. No live data written/deleted, no migration. Actual server original retention and share upload remain unverified. This release restores operational continuity, not a claim that missing Storage configuration was applied.
