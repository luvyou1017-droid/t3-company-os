import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type SyncKind = 'campaign' | 'proposal'
type Change = {
  id: string
  name: string
  state: '기존' | '신규' | '조건변경' | '확인필요'
  entity: '일정' | '상품' | 'SKU'
  reason?: string
  differences: { label: string; before: unknown; after: unknown }[]
}

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info,x-sync-token',
  'Content-Type': 'application/json',
}
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers })
const env = (name: string) => Deno.env.get(name)
const errorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) return String(error.message)
  return '동기화 실패'
}

function nextMonday(now: Date) {
  const day = now.getUTCDay()
  const next = new Date(now)
  next.setUTCHours(0, 0, 0, 0)
  next.setUTCDate(next.getUTCDate() + ((8 - day) % 7))
  if (next <= now) next.setUTCDate(next.getUTCDate() + 7)
  return next.toISOString()
}

function summarizeChanges(changes: Change[], checked: number) {
  return {
    checked,
    unchanged: changes.filter((x) => x.state === '기존').length,
    newCampaigns: changes.filter((x) => x.entity === '일정' && x.state === '신규').length,
    changedCampaigns: changes.filter((x) => x.entity === '일정' && x.state === '조건변경').length,
    newProducts: 0,
    newSkus: 0,
    terms: 0,
    review: changes.filter((x) => x.state === '확인필요').length,
  }
}

function notionWindow(cursor: string | undefined, until: string) {
  return {
    and: [
      ...(cursor ? [{ timestamp: 'last_edited_time', last_edited_time: { after: cursor } }] : []),
      { timestamp: 'last_edited_time', last_edited_time: { on_or_before: until } },
    ],
  }
}

function configuration(kind: SyncKind) {
  if (kind === 'proposal') return ['제안서 Drive 원본 위치 확인 필요']
  return ['NOTION_API_TOKEN', 'NOTION_CAMPAIGN_DATA_SOURCE_ID', 'NOTION_CAMPAIGN_FIELD_MAP'].filter((key) => !env(key))
}

async function fetchJson(url: string, init?: RequestInit) {
  const result = await fetch(url, { ...init, signal: AbortSignal.timeout(30000) })
  if (!result.ok) throw new Error(`원본 서비스 응답 오류: ${result.status}`)
  return result.json()
}

async function campaigns(db: any, cursor: string | undefined, until: string) {
  const map = JSON.parse(env('NOTION_CAMPAIGN_FIELD_MAP')!)
  if (!map.title || !map.period) throw new Error('공구명/공구기간 노션 필드 매핑 확인 필요')

  const { data, error } = await db
    .from('workspace_state')
    .select('payload')
    .eq('workspace_id', 'wisevendor')
    .eq('storage_key', 't3_company_os_campaigns')
    .maybeSingle()
  if (error) throw error
  const existing = Array.isArray(data?.payload) ? data.payload : []
  let next: string | undefined
  const changes: Change[] = []

  do {
    const page = await fetchJson(
      `https://api.notion.com/v1/data_sources/${encodeURIComponent(env('NOTION_CAMPAIGN_DATA_SOURCE_ID')!)}/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env('NOTION_API_TOKEN')}`,
          'Notion-Version': '2025-09-03',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          page_size: 100,
          filter: notionWindow(cursor, until),
          ...(next ? { start_cursor: next } : {}),
        }),
      },
    )

    for (const item of page.results ?? []) {
      const properties = item.properties ?? {}
      const name = (properties[map.title]?.title ?? [])
        .map((text: any) => text.plain_text ?? text.text?.content ?? '')
        .join('')
      const period =
        properties[map.period]?.date ??
        Object.values(properties).find((property: any) => property?.date?.start)?.date
      const sourceId = String(item.id).replace(/-/g, '')
      const matches = existing.filter(
        (campaign: any) => campaign.notionImportMetadata?.sourceId?.replace(/-/g, '') === sourceId,
      )
      const match = matches.length === 1 ? matches[0] : undefined
      const values = {
        campaignName: name,
        startDate: period?.start?.slice(0, 10),
        endDate: (period?.end ?? period?.start)?.slice(0, 10),
      }
      const differences = match
        ? Object.entries(values)
            .filter(([key, value]) => match[key] !== value)
            .map(([label, after]) => ({ label, before: match[label], after }))
        : []
      const reason =
        matches.length > 1
          ? '같은 노션 ID에 여러 일정이 연결됨'
          : !name || !period?.start
            ? '공구명/기간 확인 필요'
            : !match
              ? '신규 일정의 셀러·상품·담당 매니저 연결 확인 필요'
              : match.deletedAt || match.status === 'settled'
                ? '삭제/확정 이력 보호: 사용자 확인 필요'
                : undefined

      changes.push({
        id: item.id,
        name: name || '이름 확인 필요',
        entity: '일정',
        state: reason ? '확인필요' : differences.length ? '조건변경' : '기존',
        reason,
        differences,
      })
    }
    next = page.has_more ? page.next_cursor : undefined
  } while (next)

  return { changes, checked: changes.length }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return response({})
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405)

  try {
    const admin = createClient(env('SUPABASE_URL')!, env('SUPABASE_SERVICE_ROLE_KEY')!)
    const cronSecret = env('AUTOMATIC_SYNC_CRON_TOKEN')
    const provided = request.headers.get('x-sync-token')
    const isScheduled = Boolean(cronSecret && provided === cronSecret)

    if (!isScheduled) {
      const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
      const { data, error } = await admin.auth.getUser(token)
      if (error || !data.user) return response({ error: 'Unauthorized' }, 401)
      const { data: profile } = await admin
        .from('profiles')
        .select('role,active,approval_status')
        .eq('id', data.user.id)
        .maybeSingle()
      if (!profile?.active || profile.approval_status !== 'approved' || !['ceo', 'admin'].includes(profile.role)) {
        return response({ error: 'Forbidden' }, 403)
      }
    }

    const body = await request.json()
    if (body.action === 'status' && !isScheduled) {
      const { data: states, error } = await admin.from('automatic_sync_jobs').select('*')
      if (error) throw error
      const { data: schedules, error: scheduleError } = await admin.rpc('automatic_sync_schedule_status')
      if (scheduleError) throw scheduleError
      const jobs = []

      for (const job of states ?? []) {
        if (job.active_run && job.lock_until && Date.parse(job.lock_until) < Date.now()) {
          await admin.rpc('finish_automatic_sync', {
            p_kind: job.kind,
            p_id: job.active_run,
            p_cursor: job.cursor,
            p_error: '실행 제한시간 초과. 변경분은 다음 실행에서 재처리됩니다.',
            p_counts: {},
            p_changes: [],
          })
        }
        const { data: runs, error: runError } = await admin
          .from('automatic_sync_runs')
          .select('*')
          .eq('kind', job.kind)
          .order('started_at', { ascending: false })
          .limit(10)
        if (runError) throw runError
        const missing = configuration(job.kind)
        const scheduled = Boolean(
          (schedules ?? []).some(
            (schedule: any) =>
              schedule.name === `t3-sync-${job.kind}` && schedule.active && schedule.schedule === '0 0 * * 1',
          ),
        )
        jobs.push({
          ...job,
          runs,
          configured: missing.length === 0,
          configuration_error: missing.length ? `서버 연결 설정 필요: ${missing.join(', ')}` : undefined,
          scheduled,
          next_run: scheduled && !missing.length ? nextMonday(new Date()) : undefined,
        })
      }
      return response({ jobs })
    }

    if (body.action !== 'run' || body.kind !== 'campaign') return response({ error: 'Invalid action' }, 400)
    const { data: claimed, error: claimError } = await admin.rpc('claim_automatic_sync', {
      p_kind: 'campaign',
      p_trigger: isScheduled ? 'scheduled' : 'manual',
    })
    if (claimError) return response({ error: '실행 상태를 확인해주세요. 이미 실행 중이거나 서버 설정이 필요합니다.' }, 409)

    let changes: Change[] = []
    let checked = 0
    let message: string | null = null
    try {
      const missing = configuration('campaign')
      if (missing.length) throw new Error(`연결 설정 누락: ${missing.join(', ')}`)
      const result = await campaigns(admin, claimed.cursor, claimed.run.started_at)
      changes = result.changes
      checked = result.checked
    } catch (error) {
      message = errorMessage(error)
    }

    const { error: finishError } = await admin.rpc('finish_automatic_sync', {
      p_kind: 'campaign',
      p_id: claimed.run.id,
      p_cursor: claimed.run.started_at,
      p_error: message,
      p_counts: summarizeChanges(changes, checked),
      p_changes: changes,
    })
    if (finishError) throw finishError
    return response(message ? { error: message } : { ok: true }, message ? 502 : 200)
  } catch {
    return response({ error: '자동 동기화 서버/DB 설정을 확인해주세요.' }, 500)
  }
})
