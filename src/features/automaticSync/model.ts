export type SyncKind = 'campaign' | 'proposal'
export type Change = { id: string; name: string; state: '기존' | '신규' | '조건변경' | '확인필요' | '등록제외'; entity: '일정' | '상품' | 'SKU'; reason?: string; differences: { label: string; before: unknown; after: unknown }[]; scheduleId?: string; source?: { title: string; startDate: string; endDate: string; sellerName: string; sellerId?: string; managerName: string; managerId?: string; productName?: string; productNotionId?: string; landingPage?: string; supplyAudience?: 'seller' | 'vendor'; exclusionSignature?: string; cancelled?: boolean } }
export type SyncRun = { id: string; kind: SyncKind; trigger: 'manual' | 'scheduled'; status: 'running' | 'succeeded' | 'failed'; started_at: string; finished_at?: string; error?: string; counts: Record<string, number>; changes: Change[] }
export type SyncJob = { kind: SyncKind; last_success_at?: string; cursor?: string; configured: boolean; configuration_error?: string; scheduled: boolean; next_run?: string; runs: SyncRun[] }
export function nextMonday(now: Date) {
  const day = now.getUTCDay()
  const next = new Date(now)
  next.setUTCHours(0, 0, 0, 0) // Monday 09:00 Asia/Seoul
  next.setUTCDate(next.getUTCDate() + ((8 - day) % 7))
  if (next <= now) next.setUTCDate(next.getUTCDate() + 7)
  return next.toISOString()
}
export function summarizeChanges(changes: Change[], checked: number) {
  return {
    checked, unchanged: changes.filter(x => x.state === '기존').length,
    newCampaigns: changes.filter(x => x.entity === '일정' && x.state === '신규').length,
    changedCampaigns: changes.filter(x => x.entity === '일정' && x.state === '조건변경').length,
    newProducts: changes.filter(x => x.entity === '상품' && x.state === '신규').length,
    newSkus: changes.filter(x => x.entity === 'SKU' && x.state === '신규').length,
    terms: changes.filter(x => x.entity === 'SKU' && x.state === '조건변경').length,
    review: changes.filter(x => x.state === '확인필요').length,
  }
}
export function notionWindow(cursor: string | undefined, until: string) {
  return { and: [
    ...(cursor ? [{ timestamp: 'last_edited_time', last_edited_time: { after: cursor } }] : []),
    { timestamp: 'last_edited_time', last_edited_time: { on_or_before: until } },
  ] }
}
export function driveWindow(folder: string, cursor: string | undefined, until: string) {
  const quote = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  return "'" + quote(folder) + "' in parents and trashed = false and modifiedTime <= '" + quote(until) + "'" + (cursor ? " and modifiedTime > '" + quote(cursor) + "'" : '')
}
