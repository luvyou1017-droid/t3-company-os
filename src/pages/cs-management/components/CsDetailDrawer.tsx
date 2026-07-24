import { useState } from 'react'
import { calculateElapsedTime, maskPhoneNumber } from '../../../features/cs/csUtils'
import { workUsers } from '../../../features/myWork/mockData'
import type { CsCase, CsStatus } from '../../../features/cs/types'
import { CsAttachmentGallery } from './CsAttachmentGallery'
import { CsPriorityBadge } from './CsPriorityBadge'
import { createBrandMessage, createCustomerMessage } from './CsResponseComposer'
import { CsStatusBadge } from './CsStatusBadge'
import { openCampaignDetail } from '../../../shared/utils/campaignNavigation'

type CsDetailDrawerProps = {
  csCase: CsCase | null
  onClose: () => void
  onUpdate: (csCase: CsCase) => void
}

export function CsDetailDrawer({ csCase, onClose, onUpdate }: CsDetailDrawerProps) {
  const [brandMessage, setBrandMessage] = useState('')
  const [customerMessage, setCustomerMessage] = useState('')
  const [internalMemo, setInternalMemo] = useState('')
  if (!csCase) return null

  const addLog = (action: string, before?: string, after?: string, memo?: string) => ({
    ...csCase,
    activityLogs: [...csCase.activityLogs, { id: crypto.randomUUID(), at: '2026.07.15 14:20', actor: '허수정', action, before, after, memo }],
  })

  const updateStatus = (status: CsStatus) => onUpdate({ ...addLog('상태 변경', csCase.status, status), status })
  const complete = () => onUpdate({ ...addLog('처리 완료', csCase.status, '처리 완료', internalMemo), status: '처리 완료', completedAt: '2026.07.15 14:30' })

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="preview-drawer cs-detail-drawer" onClick={(event) => event.stopPropagation()}>
        <div className="preview-drawer__header">
          <div><p className="page-eyebrow">{csCase.caseNumber}</p><h2>{csCase.csType}</h2></div>
          <button className="icon-button" onClick={onClose} type="button">×</button>
        </div>
        <div className="action-row"><CsPriorityBadge priority={csCase.priority} /><CsStatusBadge status={csCase.status} /></div>
        <dl className="preview-list">
          {[
            ['인입 경로', csCase.source], ['공동구매', csCase.campaignName], ['셀러', csCase.sellerName], ['브랜드', csCase.brandName],
            ['상품과 옵션', `${csCase.productName} / ${csCase.optionName}`], ['고객명', csCase.customerName], ['연락처', maskPhoneNumber(csCase.customerPhone)],
            ['문의 내용', csCase.description], ['원하는 처리 방식', csCase.desiredResolution || '-'], ['담당자', csCase.assigneeName],
            ['접수 시간', csCase.receivedAt], ['처리 기한', csCase.dueAt], ['경과 시간', calculateElapsedTime(csCase)],
          ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
        <CsAttachmentGallery attachments={csCase.attachments} />
        <section className="drawer-control">
          <label><span>상태 변경</span><select value={csCase.status} onChange={(event) => updateStatus(event.target.value as CsStatus)}>{['신규','담당자 확인','브랜드 전달','브랜드 답변 대기','고객 답변 대기','처리 중','처리 완료','보류','운영 기간 종료'].map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>담당자 변경</span><select value={csCase.assigneeId} onChange={(event) => { const user = workUsers.find((item) => item.id === event.target.value); if (user) onUpdate({ ...addLog('담당자 변경', csCase.assigneeName, user.name), assigneeId: user.id, assigneeName: user.name }) }}>{workUsers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
          <label><span>브랜드 전달 내용</span><textarea value={brandMessage} onChange={(event) => setBrandMessage(event.target.value)} /></label>
          <label><span>고객 안내 내용</span><textarea value={customerMessage} onChange={(event) => setCustomerMessage(event.target.value)} /></label>
          <label><span>내부 메모</span><textarea value={internalMemo} onChange={(event) => setInternalMemo(event.target.value)} /></label>
        </section>
        <div className="action-row">
          <button className="secondary-button" onClick={() => setBrandMessage(createBrandMessage(csCase))} type="button">브랜드 전달 문구 생성</button>
          <button className="secondary-button" onClick={() => setCustomerMessage(createCustomerMessage())} type="button">고객 답변 초안 생성</button>
          <button className="secondary-button" onClick={() => onUpdate(addLog('유시철 MD에게 요청', undefined, undefined, 'MD 확인 요청 mock'))} type="button">유시철 MD에게 요청</button>
          <button className="secondary-button" onClick={() => updateStatus('보류')} type="button">보류</button>
          <button className="primary-button" onClick={complete} type="button">처리 완료</button>
          <button className="secondary-button" onClick={() => openCampaignDetail(csCase.campaignId, 'cs')} type="button">공동구매 상세 보기</button>
        </div>
        <section className="activity-log">
          <h3>활동 이력</h3>
          {csCase.activityLogs.map((log) => <p key={log.id}>{log.at} · {log.actor} · {log.action} {log.memo ? `· ${log.memo}` : ''}</p>)}
        </section>
      </aside>
    </div>
  )
}
