import { createClient } from 'npm:@supabase/supabase-js@2.117.1'
import { cleanupSellerSafeFiles } from './cleanup.ts'

// Only this generated seller-safe prefix is eligible for deletion. Original
// sales uploads and the settlement snapshots are never touched.
const BUCKET = 'seller-documents'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const expected = Deno.env.get('AUTOMATIC_SYNC_CRON_TOKEN')
  if (!expected || request.headers.get('x-sync-token') !== expected) return json({ error: 'Unauthorized' }, 401)
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) return json({ error: 'Server configuration unavailable' }, 503)

  try {
    const { action } = await request.json()
    if (action !== 'cleanup' && action !== 'inspect') return json({ error: 'Invalid action' }, 400)
    const bucket = createClient(url, key).storage.from(BUCKET)
    return json(await cleanupSellerSafeFiles(bucket, action))
  } catch (error) {
    console.error('Seller-safe cleanup failed', error)
    return json({ error: 'Cleanup failed' }, 500)
  }
})
