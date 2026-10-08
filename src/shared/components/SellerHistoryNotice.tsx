import { campaignService } from '../services/campaignService'
import type { SellerMaster } from '../services/sellerMasterService'

export const sellerSearchKey = (value: string) => value.normalize('NFKC').replace(/[\s@]/g, '').toLowerCase()
export function historicalSellers(sellers: SellerMaster[]) {
  const ids = new Set(sellers.map(seller => seller.id))
  const missing = new Map<string, { id: string; name: string }>()
  for (const campaign of campaignService.getCampaigns()) {
    if (campaign.sellerName && !ids.has(campaign.sellerId)) missing.set(`${campaign.sellerId}:${campaign.sellerName}`, { id: campaign.sellerId, name: campaign.sellerName })
  }
  return [...missing.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
}
export function SellerHistoryNotice({ sellers, query = '' }: { sellers: SellerMaster[]; query?: string }) {
  const missing = historicalSellers(sellers).filter(seller => sellerSearchKey(seller.name).includes(sellerSearchKey(query)))
  if (!missing.length) return null
  return <details className="campaign-policy-warning"><summary>기존 일정에만 있는 셀러 · {missing.length}명 · Master 연결 확인 필요</summary><p>아래 셀러는 기존 일정에 기록되어 있지만 셀러 DB와 연결되지 않았습니다. 신규 등록 전에 기존 정보를 확인해주세요. 자동 통합하거나 재등록하지 않습니다.</p><ul>{missing.map(seller => <li key={`${seller.id}:${seller.name}`}>{seller.name} · {seller.id || '셀러 ID 없음'}</li>)}</ul></details>
}
