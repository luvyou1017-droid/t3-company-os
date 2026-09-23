import type { Change } from './model'
import type { Campaign } from '../../shared/types/campaign'
import { appUsers } from '../../shared/data/users'
import { campaignService } from '../../shared/services/campaignService'
import { sellerMasterService } from '../../shared/services/sellerMasterService'
import { productService } from '../productMaster/services/productService'
import { notionCampaignMigrationService } from '../../shared/services/notionCampaignMigrationService'
import { SupabaseCampaignRepository } from '../../shared/repositories/campaignRepository'
import { cloudSyncService } from '../../shared/services/cloudSyncService'
import { STORAGE_KEYS } from '../../shared/services/storageService'
import { mergeNotionCampaign, scheduleRequiredErrors } from '../../shared/utils/campaignReadiness'

const key = (value?: string) => (value ?? '').normalize('NFKC').replace(/^[^\p{L}\p{N}]+/u, '').trim().replace(/\s+/g, ' ').toLowerCase()
const pageId = (id?: string) => (id ?? '').replace(/-/g, '').toLowerCase()
const unique = <T,>(items: T[]) => items.length === 1 ? items[0] : undefined

export async function candidateContext() {
  const [sellers, products] = await Promise.all([sellerMasterService.loadSellers(), productService.listProducts()])
  const campaigns = campaignService.getCampaigns()
  const managers = [...new Map([...appUsers.map(u => ({ id: u.id, name: u.name })), ...campaigns.map(c => ({ id: c.managerId, name: c.managerName }))].filter(m => m.id).map(m => [m.id, m])).values()]
  return { sellers, products, campaigns, managers }
}
export type CandidateContext = Awaited<ReturnType<typeof candidateContext>>

export function prepareCandidate(change: Change, context: CandidateContext, selectedId?: string) {
  const source = change.source
  if (!source) throw new Error('원본 일정 상세가 없습니다. 다시 동기화해주세요.')
  const matches = context.campaigns.filter(c => pageId(c.notionImportMetadata?.sourceId) === pageId(change.id))
  if (matches.length > 1) throw new Error('중복된 Notion 연결입니다.')
  const linked = matches[0] ?? context.campaigns.find(c => c.id === (selectedId || change.scheduleId))
  if (change.state === '조건변경' && (!linked || linked.id !== change.scheduleId)) throw new Error('기존 일정 연결을 확인해주세요.')
  if (linked?.deletedAt || linked?.status === 'settled') throw new Error('삭제/확정 일정은 변경할 수 없습니다.')
  if (linked?.notionImportMetadata?.sourceId && pageId(linked.notionImportMetadata.sourceId) !== pageId(change.id)) throw new Error('다른 Notion 일정과 연결된 일정입니다.')
  const seller = unique(context.sellers.filter(s => key(s.name) === key(source.sellerName) && key(source.sellerName)))
  const manager = unique(context.managers.filter(m => key(m.name) === key(source.managerName) && key(source.managerName)))
  const product = unique(context.products.filter(p => key(p.productName) === key(source.productName) && key(source.productName)))
  const sellerConflict = Boolean(linked?.sellerName && source.sellerName && key(linked.sellerName) !== key(source.sellerName))
  const managerConflict = Boolean(linked?.managerName && source.managerName && key(linked.managerName) !== key(source.managerName))
  const original = { sourceId: change.id, title: source.title, startDate: source.startDate, endDate: source.endDate,
    sellerId: seller?.id ?? '', sellerName: seller?.name ?? source.sellerName,
    managerId: manager?.id ?? '', managerName: manager?.name ?? source.managerName,
    productId: product?.id ?? '', productName: product?.productName ?? source.productName ?? '',
    landingPage: (['공급사', '와이즈(스룩)', '와이즈(네이버)', '셀러'].includes(source.landingPage ?? '') ? source.landingPage : undefined) as '공급사' | '와이즈(스룩)' | '와이즈(네이버)' | '셀러' | undefined,
    supplyAudience: linked?.supplyAudience ?? source.supplyAudience ?? 'seller' as const }
  const imported = notionCampaignMigrationService.preview([original])[0].campaign
  const draft = linked ?? imported
  const next: Campaign = { ...draft, campaignName: source.title, notionImportMetadata: { provider: 'notion', sourceId: change.id, importedAt: new Date().toISOString() },
    startDate: source.startDate, endDate: source.endDate,
    sellerId: linked?.sellerId || seller?.id || '', sellerName: linked?.sellerName || seller?.name || source.sellerName,
    managerId: linked?.managerId || manager?.id || '', managerName: linked?.managerName || manager?.name || source.managerName,
    supplyAudience: linked?.supplyAudience ?? source.supplyAudience ?? 'seller',
    salesChannelType: linked?.salesChannelType ?? imported.salesChannelType,
    landingPageType: linked?.landingPageType ?? imported.landingPageType,
    linkOwner: linked?.linkOwner ?? imported.linkOwner }
  if (linked) next.id = linked.id
  if (!linked && product) Object.assign(next, { productId: product.id, productName: product.productName, brandId: product.brandId, brandName: product.brandName, supplierId: product.vendorId, supplierName: product.vendorName })
  const resolved = {
    seller: !sellerConflict && Boolean(seller || linked?.sellerId), manager: !managerConflict && Boolean(manager || linked?.managerId), product: Boolean(product || linked?.productId),
    dates: Boolean(source.startDate && source.endDate), audience: Boolean(linked?.supplyAudience || source.supplyAudience || !source.landingPage || original.landingPage),
  }
  const errors = scheduleRequiredErrors(next)
  const safe = (change.state === '조건변경' || change.state === '신규') && !source.cancelled && !change.reason?.includes('변경 감지') && resolved.seller && resolved.manager && resolved.dates && resolved.audience && !errors.length && (!linked || change.state === '조건변경')
  return { candidate: next, resolved, safe, errors, linked }
}

export async function saveCandidate(change: Change, candidate: Campaign) {
  const errors = scheduleRequiredErrors(candidate)
  if (errors.length) throw new Error(errors.join(' · '))
  const result = await new SupabaseCampaignRepository().upsertNotionSnapshot([candidate])
  if (result.failed) throw new Error(result.errors.join(' · '))
  const saved = result.campaigns?.[0] ?? candidate
  const current = campaignService.getCampaigns()
  const existing = current.find(c => c.id === saved.id || pageId(c.notionImportMetadata?.sourceId) === pageId(change.id))
  campaignService.saveCampaigns(existing ? current.map(c => c.id === existing.id ? mergeNotionCampaign(c, saved) : c) : [...current, saved])
  await cloudSyncService.syncKeys([STORAGE_KEYS.campaigns])
}
