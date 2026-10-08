import { useState } from 'react'
import type { SellerMaster } from '../services/sellerMasterService'
import { historicalSellers, sellerSearchKey, sellerHistoryDetails, historicalSellerDraft, linkHistoricalSeller, savedSellerInformation } from '../services/sellerHistoryService'
export { historicalSellers, sellerSearchKey } from '../services/sellerHistoryService'
const labels: Record<string, string> = { freelancer: '프리랜서(3.3%)', general_business: '일반과세자', simplified_business: '간이과세자', corporation: '법인사업자' }
export function SellerHistoryNotice({ sellers, query = '', onRegister, onLinked }: { sellers: SellerMaster[]; query?: string; onRegister?: (seller: SellerMaster) => void; onLinked?: () => Promise<void> }) {
  const [record, setRecord] = useState<{ id: string; name: string } | null>(null)
  const [target, setTarget] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const missing = historicalSellers(sellers).filter(seller => sellerSearchKey(seller.name).includes(sellerSearchKey(query)))
  const details = record ? sellerHistoryDetails(record, sellers) : null
  const saved = onRegister ? savedSellerInformation(sellers).filter(item => sellerSearchKey(item.seller?.name || item.campaign?.sellerName || '').includes(sellerSearchKey(query))) : []
  if (!missing.length && !saved.length) return null
  const link = async () => {
    if (!record || !target || !confirmed || busy) return
    setBusy(true); setError('')
    try { await linkHistoricalSeller(record, target); await onLinked?.(); setRecord(null) }
    catch (reason) { setError(reason instanceof Error ? reason.message : '연결하지 못했습니다.') }
    finally { setBusy(false) }
  }
  return <>{saved.length > 0 && <details className="campaign-policy-warning"><summary>정산관리에서 저장한 사업자 정보 · {saved.length}건</summary><p>정산별 저장 기록을 확인합니다. 현재 Master와 다른 유형이 있어도 과거 정산 기록을 자동으로 변경하지 않습니다.</p><ul>{saved.map(({ rule, campaign, seller }) => <li key={rule.campaignId}>{seller?.name || campaign?.sellerName || '일정 확인 필요'} · {campaign?.campaignName || rule.campaignId} · 저장 유형: {labels[rule.businessType]} · 현재 Master: {seller?.businessType ? labels[seller.businessType] : '미연결/미등록'} {seller && <button className="secondary-button" onClick={() => onRegister?.(seller)}>현재 셀러 정보 수정</button>}</li>)}</ul></details>}{missing.length > 0 && <details className="campaign-policy-warning"><summary>기존 일정에만 있는 셀러 · {missing.length}건 · Master 연결 확인 필요</summary><p>이 숫자는 일정의 이름·ID 기록 수입니다. 동일인이 여러 번 표시되거나 ID가 없을 수 있습니다. 이름만으로 자동 통합하지 않습니다.</p><ul>{missing.map(seller => <li key={`${seller.id}:${seller.name}`}>{seller.name} · {seller.id || '셀러 ID 없음'} <button className="secondary-button" type="button" onClick={() => { setRecord(seller); setTarget(''); setConfirmed(false); setError('') }}>기록 확인{onRegister ? '·등록' : ''}</button></li>)}</ul></details>}
    {record && details && <div className="nested-modal-backdrop"><section aria-modal="true" className="helper-modal seller-editor" role="dialog" aria-label="기존 셀러 기록 확인"><header><h3>{record.name} · 기존 기록 확인</h3><button aria-label="닫기" disabled={busy} onClick={() => setRecord(null)}>×</button></header><p>기존 셀러 ID: {record.id || '없음'}</p><h4>연결된 일정</h4><ul>{details.campaigns.map(campaign => <li key={campaign.id}>{campaign.campaignName} · {campaign.startDate} · {campaign.managerName} · {campaign.creationBusinessType ? labels[campaign.creationBusinessType] : '사업자 유형 미등록'}</li>)}</ul><h4>정산관리에서 저장한 사업자 유형</h4>{details.rules.length ? <ul>{details.rules.map(rule => <li key={rule.campaignId}>{details.campaigns.find(campaign => campaign.id === rule.campaignId)?.campaignName} · {labels[rule.businessType]} · {rule.updatedAt}</li>)}</ul> : <p>이 기록에 연결된 저장 사업자 유형은 없습니다.</p>}<p>같은 이름의 기존 셀러: {details.matches.map(seller => `${seller.name} (${seller.instagramId || seller.id})`).join(', ') || '없음'}</p>
      {onRegister && <><label className="form-field"><span>기존 셀러 Master 연결</span><select disabled={!record.id || busy} value={target} onChange={event => { setTarget(event.target.value); setConfirmed(false) }}><option value="">직접 확인 후 선택</option>{sellers.map(seller => <option key={seller.id} value={seller.id}>{seller.name} · {seller.instagramId || seller.id}{seller.active === false ? ' · 비활성' : ''}</option>)}</select></label>{record.id ? <p>확인한 기존 ID를 선택한 셀러의 연결 ID로 보관합니다. 일정 ID·셀러 원본 ID·확정 정산서는 변경하지 않습니다.</p> : <p>ID 없는 일정은 자동 연결할 수 없습니다. 먼저 Master를 등록하거나 기존 셀러를 확인한 뒤, 미확정 일정을 수정할 때 셀러를 직접 선택해주세요.</p>}<label className="checkbox-label"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} /> 동일인임을 확인했습니다. 신규 등록 시 중복 셀러가 없는지도 확인했습니다.</label>{error && <p role="alert">{error}</p>}<div className="button-row"><button className="secondary-button" disabled={busy || !confirmed || !target || !record.id} onClick={() => void link()}>기존 셀러에 연결</button><button className="primary-button" disabled={busy || !confirmed} onClick={() => { onRegister(historicalSellerDraft(record)); setRecord(null) }}>신규 Master 입력·등록</button></div></>}
    </section></div>}</>
}
