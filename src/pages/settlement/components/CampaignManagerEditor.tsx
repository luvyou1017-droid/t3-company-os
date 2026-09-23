import { useState } from 'react'
import { appUsers } from '../../../shared/data/users'
import type { Campaign } from '../../../shared/types/campaign'
import { createCampaignRepository } from '../../../shared/repositories/campaignRepository'
import { campaignService } from '../../../shared/services/campaignService'
import { settlementService } from '../../../shared/services/settlementService'

export function CampaignManagerEditor({ campaign, allowed, onSaved }: { campaign: Campaign; allowed: boolean; onSaved: () => void }) {
  const [managerId, setManagerId] = useState(campaign.managerId)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  async function save() {
    if (!allowed || busy) return
    const manager = appUsers.find(user => user.id === managerId)
    if (!manager) { setMessage('등록된 담당자를 선택해주세요.'); return }
    setBusy(true); setMessage('')
    try {
      const linked = settlementService.getSettlements().filter(item => item.campaignId === campaign.id)
      if (linked.some(item => item.settlementConfirmedAt || item.settlementConfirmedVersion || item.sellerPaymentCompleted || item.managerPaymentCompleted || item.sellerPaymentRequestStatus || item.managerPaymentRequestStatus)) throw new Error('확정 또는 지급요청 이력이 있는 공구는 여기서 담당자를 변경할 수 없습니다.')
      const repo = createCampaignRepository()
      const current = await repo.getById(campaign.id)
      if (!current || current.managerId !== campaign.managerId) throw new Error('담당자 정보가 변경되었습니다. 화면을 다시 열어주세요.')
      const updated = await repo.update({ ...current, managerId: manager.id, managerName: manager.name, updatedAt: new Date().toISOString() })
      campaignService.saveCampaigns(campaignService.getCampaigns().map(item => item.id === updated.id ? updated : item))
      setMessage('현재 공구 담당자를 저장했습니다. 정산 금액과 Snapshot은 변경하지 않았습니다.'); onSaved()
    } catch (error) { setMessage(error instanceof Error ? error.message : '담당자를 저장하지 못했습니다.') }
    finally { setBusy(false) }
  }
  return <section><label>담당 매니저<select disabled={!allowed || busy} value={managerId} onChange={event => setManagerId(event.target.value)}><option value={campaign.managerId}>{campaign.managerName} · 현재</option>{appUsers.filter(user => user.id !== campaign.managerId && ['대표','팀장','매니저','MD'].includes(user.role)).map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label><button type="button" className="primary-button" disabled={!allowed || busy || managerId === campaign.managerId} onClick={() => void save()}>{busy ? '저장 중…' : '담당 매니저 저장'}</button>{!allowed && <p>확정 전이며 지급요청 이력이 없는 정산만 변경할 수 있습니다.</p>}{message && <p role="status">{message}</p>}</section>
}
