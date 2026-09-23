import { supabase } from '../lib/supabase'
import type { AccountingRow } from '../utils/accountingRows'
import { ACCOUNTING_LINK_SECONDS } from '../utils/accountingRows'

export type MonthClose = { month: string; status: 'closed' | 'reported' | 'paid' | 'open'; rows: AccountingRow[]; updated_at: string }
export type DetailShare = { id: string; settlement_id: string; object_path: string; created_at: string; expires_at: string; signed_url: string | null }
const failure = (error: {message: string}) => new Error(`회계 관리 저장소 확인이 필요합니다. ${error.message}`)
function client() { if (!supabase) throw new Error('기존 Supabase 연결이 필요합니다.'); return supabase }
export const accountingWorkflowService = {
  async month(month: string) {
    const {data,error} = await client().from('accounting_month_closes').select('month,status,rows,updated_at').eq('month',month).maybeSingle()
    if (error) throw failure(error)
    return data as MonthClose | null
  },
  async close(month: string, rows: AccountingRow[], expected: string | null, action: string) {
    const {data,error} = await client().rpc('accounting_change_month', {p_month:month,p_rows:rows,p_expected:expected,p_action:action})
    if (error) throw failure(error)
    return data as MonthClose
  },
  async shares(settlementId: string) {
    const {data,error} = await client().from('seller_detail_shares').select('id,settlement_id,object_path,created_at,expires_at,signed_url').eq('settlement_id',settlementId).order('created_at',{ascending:false})
    if (error) throw failure(error)
    return data as DetailShare[]
  },
  async createShare(settlementId: string, image: Blob) {
    if (image.type !== 'image/png' || !image.size) throw new Error('셀러 정산서 이미지가 올바르지 않습니다.')
    // RPC authorizes the current user and verifies the existing bucket is PRIVATE.
    const {data,error} = await client().rpc('accounting_reserve_seller_share',{p_settlement_id:settlementId})
    if (error) throw failure(error)
    const share = data as DetailShare
    const bucket = client().storage.from('seller-documents')
    const upload = await bucket.upload(share.object_path,image,{contentType:'image/png',upsert:false,cacheControl:'0'})
    if (upload.error) throw failure(upload.error)
    const signed = await bucket.createSignedUrl(share.object_path,ACCOUNTING_LINK_SECONDS)
    if (signed.error) throw failure(signed.error)
    // Use the storage server's token expiry, not the operator's device clock.
    const token = new URL(signed.data.signedUrl).searchParams.get('token')
    const encoded = token?.split('.')[1]?.replace(/-/g,'+').replace(/_/g,'/')
    if (!encoded) throw new Error('서버 링크 만료 시간을 확인하지 못했습니다.')
    const claims = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4,'='))) as {exp?:number}
    if (!Number.isFinite(claims.exp)) throw new Error('서버 링크 만료 시간이 올바르지 않습니다.')
    const saved = await client().rpc('accounting_finalize_seller_share',{p_id:share.id,p_url:signed.data.signedUrl,p_expires_at:new Date(claims.exp! * 1000).toISOString()})
    if (saved.error) throw failure(saved.error)
    return saved.data as DetailShare
  },
}
