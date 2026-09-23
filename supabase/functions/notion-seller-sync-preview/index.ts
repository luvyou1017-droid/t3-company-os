import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json; charset=utf-8' } })
const text = (property: any) => Array.isArray(property?.rich_text) ? property.rich_text.map((item: any) => item?.plain_text ?? '').join('') : ''
const title = (property: any) => Array.isArray(property?.title) ? property.title.map((item: any) => item?.plain_text ?? '').join('') : ''
const select = (property: any) => property?.select?.name ?? ''
const phone = (property: any) => property?.phone_number ?? ''
const relations = (property: any) => Array.isArray(property?.relation) ? property.relation.map((item: any) => item.id).filter(Boolean) : []

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  try {
    const auth = request.headers.get('Authorization') ?? ''
    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
    const { data: userData, error: userError } = await client.auth.getUser(auth.replace(/^Bearer\s+/i, ''))
    if (userError || !userData.user) return json({ error: 'Unauthorized' }, 401)
    const { data: profile } = await client.from('profiles').select('role,active,approval_status').eq('id', userData.user.id).maybeSingle()
    if (!profile?.active || profile.approval_status !== 'approved' || !['ceo', 'admin', 'settlement_cs'].includes(profile.role)) return json({ error: 'Forbidden' }, 403)

    const notionToken = Deno.env.get('NOTION_API_TOKEN')
    const dataSourceId = Deno.env.get('NOTION_SELLER_DATA_SOURCE_ID')
    if (!notionToken || !dataSourceId) return json({ error: 'Notion secure connection is not configured' }, 503)
    const body = await request.json().catch(() => ({})) as { action?: 'preview' | 'ack'; decisions?: Array<{ pageId: string; decision: 'applied' | 'excluded' }> }
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    if (body.action === 'ack') {
      for (const decision of body.decisions ?? []) {
        if (!decision.pageId || !['applied', 'excluded'].includes(decision.decision)) return json({ error: 'Invalid decision' }, 400)
        const { error } = await admin.from('notion_seller_sync_inbox').update({ status: decision.decision, decided_at: new Date().toISOString(), decided_by: userData.user.id }).eq('notion_page_id', decision.pageId)
        if (error) throw error
      }
      return json({ ok: true })
    }
    const { data: syncState, error: stateError } = await admin.from('notion_seller_sync_state').select('last_scanned_at').eq('id', true).maybeSingle()
    if (stateError) throw stateError
    const scanStartedAt = new Date().toISOString()
    const filter = syncState?.last_scanned_at ? { timestamp: 'last_edited_time', last_edited_time: { after: syncState.last_scanned_at } } : undefined
    let cursor: string | undefined
    const records: any[] = []
    do {
      const response = await fetch(`https://api.notion.com/v1/data_sources/${encodeURIComponent(dataSourceId)}/query`, {
        method: 'POST', headers: { Authorization: `Bearer ${notionToken}`, 'Notion-Version': '2025-09-03', 'Content-Type': 'application/json' },
        body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}), ...(filter ? { filter } : {}) }),
      })
      if (!response.ok) return json({ error: `Notion query failed (${response.status})` }, 502)
      const page = await response.json() as any
      for (const item of page.results ?? []) {
        const properties = item.properties ?? {}
        const rawIdentifier = text(properties['사업자등록번호 / 주민등록번호'])
        const digits = rawIdentifier.replace(/\D/g, '')
        records.push({
          pageId: item.id, lastEditedTime: item.last_edited_time, name: title(properties['이름']),
          instagramId: text(properties['인스타아이디']), managerPageIds: relations(properties['담당 DB']),
          contact: phone(properties['연락처']), shippingText: text(properties['샘플발송 정보']),
          businessType: select(properties['형태']), businessNumberOrResidentId: digits.length === 10 ? rawIdentifier : '', sensitiveIdentifierOmitted: Boolean(digits && digits.length !== 10),
          businessName: text(properties['사업자명']), bankAccount: text(properties['계좌번호']),
        })
      }
      cursor = page.has_more ? page.next_cursor : undefined
    } while (cursor)
    if (records.length) {
      const { error } = await admin.from('notion_seller_sync_inbox').upsert(records.map((record) => ({ notion_page_id: record.pageId, last_edited_time: record.lastEditedTime, payload: record, status: 'pending', decided_at: null, decided_by: null })), { onConflict: 'notion_page_id' })
      if (error) throw error
    }
    const { error: cursorError } = await admin.from('notion_seller_sync_state').upsert({ id: true, last_scanned_at: scanStartedAt }, { onConflict: 'id' })
    if (cursorError) throw cursorError
    const { data: pending, error: pendingError } = await admin.from('notion_seller_sync_inbox').select('payload').eq('status', 'pending').order('last_edited_time', { ascending: false })
    if (pendingError) throw pendingError
    return json({ workspace: '와이즈벤더', dataSourceTitle: '셀러DB', records: (pending ?? []).map((item: any) => item.payload), fetchedAt: scanStartedAt, incremental: Boolean(syncState?.last_scanned_at) })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unexpected error' }, 500)
  }
})
