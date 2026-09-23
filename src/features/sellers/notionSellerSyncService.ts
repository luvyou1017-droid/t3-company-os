import { supabase } from '../../shared/lib/supabase'
import { sellerMasterService, type SellerMaster } from '../../shared/services/sellerMasterService'
import { buildImportedSeller, previewNotionSeller, type NotionSellerDecision, type NotionSellerPreview, type NotionSellerRecord } from './notionSellerSyncModel'

type PreviewResponse = { workspace: string; dataSourceTitle: string; records: NotionSellerRecord[]; fetchedAt: string; incremental: boolean }

export const notionSellerSyncService = {
  async preview(sellers: SellerMaster[]) {
    if (!supabase) throw new Error('운영 데이터베이스 연결을 확인해주세요.')
    const { data, error } = await supabase.functions.invoke<PreviewResponse>('notion-seller-sync-preview', { body: { action: 'preview' } })
    if (error) {
      if (/404|not found|Failed to send/i.test(error.message)) throw new Error('노션 보안 연결 함수가 아직 운영환경에 설치되지 않았습니다.')
      throw new Error(error.message)
    }
    if (!data || !Array.isArray(data.records)) throw new Error('노션 셀러 응답 형식을 확인해주세요.')
    return { ...data, previews: data.records.map((record) => previewNotionSeller(record, sellers)) }
  },

  async apply(items: Array<{ preview: NotionSellerPreview; decision: NotionSellerDecision; sellerId?: string }>) {
    const current = await sellerMasterService.loadSellers(true)
    const now = new Date().toISOString()
    const saved: SellerMaster[] = []
    for (const item of items) {
      if (item.decision === 'exclude') continue
      let existing = item.sellerId ? current.find((seller) => seller.id === item.sellerId) : undefined
      const latestPreview = previewNotionSeller(item.preview.source, current)
      if (!existing && latestPreview.matchedSellerId) {
        if (item.preview.status === 'new') throw new Error(`${item.preview.source.name}: 반영 전에 기존 셀러 후보가 발견되었습니다. 미리보기를 다시 확인해주세요.`)
        existing = current.find((seller) => seller.id === latestPreview.matchedSellerId)
      }
      const target = buildImportedSeller(latestPreview, existing, item.decision, now)
      if (!target) continue
      const duplicatePage = current.find((seller) => seller.notionPageId === target.notionPageId && seller.id !== target.id)
      if (duplicatePage) throw new Error(`${target.name}: 같은 노션 페이지가 이미 다른 셀러에 연결되어 있습니다.`)
      const result = await sellerMasterService.saveSellerProfile(target)
      saved.push(result)
      const index = current.findIndex((seller) => seller.id === result.id)
      if (index >= 0) current[index] = result
      else current.push(result)
    }
    const decisions = items.map((item) => ({ pageId: item.preview.source.pageId, decision: item.decision === 'exclude' ? 'excluded' : 'applied' }))
    const { error } = await supabase?.functions.invoke('notion-seller-sync-preview', { body: { action: 'ack', decisions } }) ?? { error: new Error('운영 데이터베이스 연결을 확인해주세요.') }
    if (error) throw new Error(`셀러 ${saved.length}건은 저장됐지만 동기화 상태 기록에 실패했습니다. 다시 불러오면 중복 여부를 확인해주세요.`)
    return saved
  },
}
