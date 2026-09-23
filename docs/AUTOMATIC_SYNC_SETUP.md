# Automatic sync: production setup still required

The production206 checkout contains a static Notion schedule snapshot/manual importer and manual proposal import review. No Monday runner exists in that source. Connected ChatGPT automations do not contain this schedule. Actual production pg_cron/third-party jobs could not be inspected: no Supabase management credential or authenticated session is available. Do not report that the production database was inspected.

Implemented:
- Admin/CEO-only status UI under 가져오기/내보내기; independent manual buttons, counts, histories, before/after differences.
- Admin failure banner for latest failure, including reason and last success.
- Prepared service-only Edge runner and two new RLS tables; exclusive per-kind lease; atomic success cursor update; failures do not advance cursor.
- Monday09:00 Asia/Seoul (00:00UTC) schedule script. Schedule not automatically activated by table migration.
- Source reads bounded by (last successful scan start, current scan start]. First read full selected source, thereafter incremental.
- Proposal Excel parser and reviewBatch reused; no product/SKU creation, merge, disable or snapshot writes.
- Campaign source-ID/date comparison generates review candidates only. Actual campaign auto-application is NOT implemented because source mapping and preservation/conflict behavior have not been verified against the live source. This remains incomplete, not a completed update job.

Required, in the EXISTING Supabase project:
1. Select exact Notion campaign data source and Drive proposal folder. Do not guess scopes or scan all files/workspaces.
2. Apply docs/AUTOMATIC_SYNC.sql using an authorized management session.
3. Configure server-only secrets (never in chat or VITE):
   NOTION_API_TOKEN (reuse existing), NOTION_CAMPAIGN_DATA_SOURCE_ID,
   NOTION_CAMPAIGN_FIELD_MAP = JSON with verified title and period property names;
   PROPOSAL_DRIVE_FOLDER_ID;
   existing authorized GOOGLE_DRIVE_REFRESH_TOKEN, GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET;
   AUTOMATIC_SYNC_CRON_TOKEN (high-entropy server secret).
   The ChatGPT Drive connector does not automatically provide an app-server OAuth refresh token.
4. Deploy automatic-sync with --no-verify-jwt. The function itself verifies every interactive JWT and active approved ceo/admin profile; cron requires its secret header. Keep default Supabase service-role secrets server-only.
   deno.json pins existing xlsx version; frontend parser and review modules are reused.
5. Validate status and manual run, source field mapping, known existing SKU IDs and expected differences.
6. Store endpoint URL and same cron token as Vault t3_sync_endpoint / t3_sync_cron_token.
   Enable pg_cron and pg_net if absent; inspect their existing configuration, then apply docs/AUTOMATIC_SYNC_SCHEDULE.sql.
7. Verify real cron.job, automatic_sync_runs and success cursors. Test a failed source read and ensure cursor unchanged and admin failure alert visible.
   Cron enqueue success is not proof of successful source sync; the run history is authoritative.

No SQL or Edge Function deployment has been performed by this task. No actual schedule has been enabled. Dashboard deployment alone does not activate the automation. Tables contain only source comparison/run history; campaign/product/settlement tables remain unchanged.

Tests: Monday KST boundaries; lower/upper timestamp query bounds; classification counts; reuse parser/review regression; Edge syntax and static admin/lock/cursor guards; frontend build. These are local checks, NOT live cron/Notion/Drive/RLS verification.
