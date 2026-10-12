import { useEffect, useState } from 'react'
import type { Campaign } from '../types/campaign'
import { sellerMasterService, type SellerMaster } from '../services/sellerMasterService'
import { SupabaseCampaignRepository } from '../repositories/campaignRepository'
import { campaignService } from '../services/campaignService'
import { cloudSyncService } from '../services/cloudSyncService'
import { STORAGE_KEYS } from '../services/storageService'
import { managerDirectoryService } from '../services/managerDirectoryService'
import { QuickSellerModal } from './QuickSellerModal'

export function CampaignSellerLink({ campaign, blocked, onSaved }: { campaign: Campaign; blocked: boolean; onSaved: () => void }) {
  const [sellers, setSellers] = useState<SellerMaster[]>([])
  const [sellerId, setSellerId] = useState('')
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { let active = true; void sellerMasterService.loadSellers().then(items => { if (active) setSellers(items) }).catch(() => { if (active) setError('셀러 목록을 불러오지 못했습니다.') }); void managerDirectoryService.load().catch(() => {}); return () => { active = false } }, [])
  async function save() {
    const seller = sellers.find(item => item.id === sellerId)
    if (!seller || blocked) return
    setBusy(true); setError('')
    try {
      const saved = await new SupabaseCampaignRepository().linkPendingSeller(campaign.id, seller)
      campaignService.saveCampaigns(campaignService.getCampaigns().map(item => item.id === saved.id ? saved : item))
      await cloudSyncService.syncKeys([STORAGE_KEYS.campaigns])
      onSaved()
    } catch (e) { setError(e instanceof Error ? e.message : '셀러 연결 실패') }
    finally { setBusy(false) }
  }
  return <section className="workspace-card"><h3>셀러 연결 필요 · {campaign.sellerName}</h3><p>일정은 등록된 상태입니다. 셀러 Master를 선택해 이 일정에 연결해주세요. 일정 ID와 기존 상품·정산 Snapshot은 유지됩니다.</p>
    {blocked ? <p role="alert">삭제·확정 또는 지급요청 중인 일정은 셀러 연결을 변경할 수 없습니다.</p> : <><label>연결할 셀러 <select value={sellerId} disabled={busy} onChange={event => setSellerId(event.target.value)}><option value="">셀러 선택</option>{sellers.map(seller => <option key={seller.id} value={seller.id}>{seller.name}</option>)}</select></label><button type="button" disabled={busy} onClick={() => setCreating(true)}>+ 신규 셀러 간편등록</button><p>선택한 셀러가 ‘{campaign.sellerName}’와 같은 셀러인지 확인한 뒤 연결해주세요.</p><button type="button" disabled={busy || !sellerId} onClick={() => void save()}>{busy ? '연결 중…' : '같은 셀러 확인 · 연결'}</button></>}
    {error && <p role="alert">{error}</p>}
    {creating && <QuickSellerModal name={campaign.sellerName} managerId={campaign.managerId} managers={managerDirectoryService.list()} onClose={() => setCreating(false)} onSaved={seller => { setSellers(items => [...items.filter(item => item.id !== seller.id), seller]); setSellerId(seller.id); setCreating(false) }} />}
  </section>
}
