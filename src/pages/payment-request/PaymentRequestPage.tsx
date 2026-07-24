import { useMemo, useState } from 'react'
import { campaignService } from '../../shared/services/campaignService'
import { paymentEvidenceService } from '../../shared/services/paymentEvidenceService'
import { paymentRequestService } from '../../shared/services/paymentRequestService'
import { managerPaymentService } from '../../shared/services/managerPaymentService'
import { sellerSettlementService } from '../../shared/services/sellerSettlementService'
import { settlementService } from '../../shared/services/settlementService'
import { withholdingTaxService } from '../../shared/services/withholdingTaxService'
import type { EvidenceDocumentType, EvidenceOwnerType, PaymentEvidence } from '../../shared/types/paymentEvidence'
import type { PaymentRequestStatus, SellerBusinessType } from '../../shared/types/sellerSettlement'
import type { WithholdingTaxStatus } from '../../shared/types/withholdingTax'
import { runWithholdingAssertions } from '../../shared/utils/withholdingTax'
import { validateSettlement } from '../../shared/utils/settlement'

type Tab = 'requests' | 'managers' | 'evidence' | 'withholding'
const money = (value: number) => `${Math.round(value).toLocaleString('ko-KR')}원`
const statusLabel: Record<PaymentRequestStatus, string> = {
  draft: '초안', evidence_pending: '증빙 대기', request_ready: '요청 생성 대기', approval_pending: '대표 승인 대기',
  approved: '승인 완료', sent: '셀러 전달 완료', payment_completed: '지급 완료',
  remittance_confirmed: '입금 확인 완료', on_hold: '보류', rejected: '반려',
}
const evidenceLabels: Record<EvidenceDocumentType, string> = {
  tax_invoice: '세금계산서 캡처', cash_receipt: '현금영수증 캡처', withholding_entry: '원천세 리스트', other: '기타 증빙',
}
const reviewLabels = {
  not_uploaded: '미업로드', uploaded: '업로드 완료', review_pending: '검수 대기', approved: '승인', rejected: '반려',
}
const taxStatusLabels: Record<WithholdingTaxStatus, string> = {
  draft: '초안', ready: '신고 준비', uploaded: '업로드 완료', reported: '신고 완료', paid: '납부 완료',
  revision_required: '수정 필요', canceled: '취소',
}

export function PaymentRequestPage() {
  const [tab, setTab] = useState<Tab>('requests')
  const [revision, setRevision] = useState(0)
  const sync = () => setRevision((value) => value + 1)
  const requests = useMemo(() => paymentRequestService.getPaymentRequests(), [revision])
  const evidence = useMemo(() => paymentEvidenceService.getAllEvidence(), [revision])
  useMemo(() => withholdingTaxService.syncFromConfirmedSettlements(), [revision])
  const assertion = runWithholdingAssertions()

  return <section className="payment-page">
    <header className="payment-hero">
      <div><p className="page-eyebrow">Payment Operations MVP</p><h1>지급 관리</h1><p>셀러·매니저별 증빙 승인과 프리랜서 원천세 등록을 지급요청 전에 확인합니다.</p></div>
    </header>
    <nav className="payment-tabs" aria-label="지급 관리 메뉴">
      <button className={tab === 'requests' ? 'is-active' : ''} onClick={() => setTab('requests')}>지급 요청</button>
      <button className={tab === 'managers' ? 'is-active' : ''} onClick={() => setTab('managers')}>매니저별 지급 예정</button>
      <button className={tab === 'evidence' ? 'is-active' : ''} onClick={() => setTab('evidence')}>증빙 검수</button>
      <button className={tab === 'withholding' ? 'is-active' : ''} onClick={() => setTab('withholding')}>원천세 리스트</button>
    </nav>
    {tab === 'requests' && <RequestTab requests={requests} evidence={evidence} onSync={sync} />}
    {tab === 'managers' && <ManagerScheduledTab onSync={sync} />}
    {tab === 'evidence' && <EvidenceTab evidence={evidence} onSync={sync} />}
    {tab === 'withholding' && <WithholdingTab assertion={assertion} onSync={sync} />}
  </section>
}

function ManagerScheduledTab({ onSync }: { onSync: () => void }) {
  const managers = managerPaymentService.getManagers()
  const [managerId, setManagerId] = useState(managers[0]?.id ?? '')
  const [selected, setSelected] = useState<string[]>([])
  const items = managerPaymentService.getScheduledItems(managerId)
  const manager = managers.find((item) => item.id === managerId)
  const selectable = items.filter((item) => !item.reasons.length)
  const selectedItems = items.filter((item) => selected.includes(item.settlement.id))
  const gross = selectedItems.reduce((sum, item) => sum + item.settlement.currentCalculation.managerAmount + item.settlement.currentCalculation.managerDeductionTotal, 0)
  const incomeTax = selectedItems.reduce((sum, item) => sum + (item.tax?.incomeTaxAmount ?? 0), 0)
  const localTax = selectedItems.reduce((sum, item) => sum + (item.tax?.localIncomeTaxAmount ?? 0), 0)
  const finalAmount = selectedItems.reduce((sum, item) => sum + item.finalAmount, 0)
  const requests = paymentRequestService.getPaymentRequests().filter((request) => request.managerId === managerId)
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  const createBatch = () => {
    managerPaymentService.createBatch(managerId, selected, '허수정')
    setSelected([])
    onSync()
  }
  return <>
    <section className="workspace-card manager-payment-header">
      <div><p className="page-eyebrow">Manager Payment Schedule</p><h2>{manager?.name ?? '매니저'} 매니저 정산 예정 리스트</h2></div>
      <select value={managerId} onChange={(event) => { setManagerId(event.target.value); setSelected([]) }}>
        {managers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </section>
    <div className="payment-kpi-grid manager-kpis">
      {[
        ['지급 가능 건수', selectable.length],
        ['증빙 대기 건수', items.filter((item) => item.reasons.some((reason) => reason.includes('증빙'))).length],
        ['요청 중 건수', requests.filter((item) => item.status === 'approval_pending' || item.status === 'approved').length],
        ['지급 완료 건수', requests.filter((item) => item.status === 'payment_completed').length],
        ['지급 가능 총액', money(selectable.reduce((sum, item) => sum + item.finalAmount, 0))],
      ].map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}
    </div>
    <div className="manager-payment-columns">
      <section className="workspace-card compact-payment-list">
        <div className="section-heading"><div><h2>셀러 지급분</h2><p>담당 Campaign의 셀러 지급 상태를 확인합니다.</p></div></div>
        {!items.length ? <div className="workspace-empty"><strong>이 매니저가 담당한 셀러 지급 예정 건이 없습니다.</strong></div> : items.map(({ settlement, campaign }) => {
          const rule = sellerSettlementService.getSellerSettlementRule(campaign.id)
          const evidence = paymentEvidenceService.getEvidenceBySettlementId(settlement.id, 'seller')
          const request = paymentRequestService.getPaymentRequestForRecipient(settlement.id, 'seller', campaign.sellerId, settlement.settlementVersion)
          return <article className="payment-list-row" key={`seller-${settlement.id}`}>
            <input aria-label={`${campaign.campaignName} 셀러 지급 선택`} disabled title="정산 담당자만 요청 가능" type="checkbox" />
            <div><strong>{campaign.campaignName}</strong><small>{campaign.sellerName} · {campaign.startDate} ~ {campaign.endDate}</small><small>정산 담당자만 요청 가능</small></div>
            <div className="payment-row-meta"><span>{rule?.businessType ?? '미확인'} · {rule?.confirmedEvidenceType ?? '미확인'}</span><span>증빙 {evidence.some((item) => item.reviewStatus === 'approved') ? '승인' : '대기'}</span><span>{request ? statusLabel[request.status] : '요청 전'}</span><strong>{money(settlement.currentCalculation.finalSellerPaymentAmount)}</strong><small>{settlement.paymentDueDate}</small></div>
          </article>
        })}
      </section>
      <section className="workspace-card compact-payment-list">
        <div className="section-heading"><div><h2>매니저 정산분</h2><p>Campaign별 최종 지급액 전액을 선택합니다. 부분 요청은 지원하지 않습니다.</p></div></div>
        {!items.length ? <div className="workspace-empty"><strong>지급요청 가능한 매니저 정산 건이 없습니다.</strong></div> : items.map(({ settlement, campaign, finalAmount: itemFinal, reasons, tax }) =>
          <article className={`payment-list-row ${reasons.length ? 'is-disabled' : ''}`} key={`manager-${settlement.id}`}>
            <input aria-label={`${campaign.campaignName} 매니저 지급 선택`} checked={selected.includes(settlement.id)} disabled={Boolean(reasons.length)} onChange={() => toggle(settlement.id)} type="checkbox" />
            <div><strong>{campaign.campaignName}</strong><small>{campaign.startDate} ~ {campaign.endDate}</small><small>총매출 {money(settlement.currentCalculation.grossSales)} · 배분율 {settlement.currentCalculation.managerShareRate}%</small></div>
            <div className="payment-row-meta"><span>배분 대상 {money(settlement.currentCalculation.distributableVendorCommission)}</span><span>세무 차감 {money(tax?.totalWithholdingTaxAmount ?? 0)}</span><strong>{money(itemFinal)}</strong><span>{settlement.managerPaymentRequestStatus ? statusLabel[settlement.managerPaymentRequestStatus] : '요청 전'}</span><small>{settlement.paymentDueDate}</small></div>
            {reasons.length > 0 && <ul className="row-block-reasons">{reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}
          </article>)}
      </section>
    </div>
    <section className="manager-selection-summary">
      <div><span>선택 건수</span><strong>{selected.length}건</strong></div>
      <div><span>선택 전 총액</span><strong>{money(gross)}</strong></div>
      <div><span>소득세 합계</span><strong>{money(incomeTax)}</strong></div>
      <div><span>지방소득세 합계</span><strong>{money(localTax)}</strong></div>
      <div><span>총 원천징수액</span><strong>{money(incomeTax + localTax)}</strong></div>
      <div><span>최종 지급요청액</span><strong>{money(finalAmount)}</strong></div>
      <button className="primary-button" disabled={!selected.length} onClick={createBatch} type="button">선택 건 지급요청</button>
    </section>
  </>
}

function RequestTab({ requests, evidence, onSync }: { requests: ReturnType<typeof paymentRequestService.getPaymentRequests>; evidence: PaymentEvidence[]; onSync: () => void }) {
  const settlements = settlementService.getSettlements()
  return <>
    <div className="payment-kpi-grid">
      {[
        ['전체 요청', requests.length], ['증빙 검수 대기', evidence.filter((item) => item.reviewStatus === 'review_pending').length],
        ['승인 대기', requests.filter((item) => item.status === 'approval_pending').length],
        ['지급 예정', requests.filter((item) => item.status === 'approved').length],
      ].map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}
    </div>
    <section className="workspace-card">
      <div className="section-heading"><div><h2>지급요청 준비 상태</h2><p>셀러와 매니저 요청은 각 소유자의 증빙 상태만 독립적으로 검증합니다.</p></div></div>
      <div className="payment-readiness-grid">{settlements.map((settlement) => {
        const campaign = campaignService.getCampaignById(settlement.campaignId)
        if (!campaign) return null
        return (['seller', 'manager'] as EvidenceOwnerType[]).map((ownerType) => {
          const isSeller = ownerType === 'seller'
          const rule = sellerSettlementService.getSellerSettlementRule(settlement.campaignId)
          const businessType: SellerBusinessType = isSeller ? (rule?.businessType ?? 'general_business') : managerPaymentService.getBusinessType(campaign.managerName)
          const ownerId = isSeller ? campaign.sellerId : campaign.managerId
          const ownerName = isSeller ? campaign.sellerName : campaign.managerName
          const errors = validateSettlement(settlement).errors
          const input = {
            settlementId: settlement.id, ownerType, ownerId, businessType,
            evidenceTypeConfirmed: isSeller ? Boolean(rule?.evidenceConfirmed && rule.confirmedEvidenceType) : true,
            accountConfirmed: settlement.accountConfirmed, calculationCompleted: Boolean(settlement.currentCalculation),
            calculationErrors: errors, amountConfirmed: isSeller ? true : settlement.currentCalculation.managerAmount >= 0,
          }
          const reasons = paymentRequestService.getPaymentRequestBlockReasons(input)
          const ownerEvidence = paymentEvidenceService.getEvidenceBySettlementId(settlement.id, ownerType)
          const taxRegistered = withholdingTaxService.getBySettlementOwner(settlement.id, ownerType, ownerId).some((item) => item.status !== 'canceled')
          return <article className="readiness-card" key={`${settlement.id}-${ownerType}`}>
            <div><span className="status-badge waiting">{isSeller ? '셀러 지급 요청' : '매니저 지급 요청'}</span><h3>{ownerName}</h3><p>{campaign.campaignName}</p></div>
            <dl>
              <div><dt>사업자 유형</dt><dd>{businessType}</dd></div>
              <div><dt>증빙 업로드</dt><dd>{ownerEvidence.length ? '완료' : '미완료'}</dd></div>
              <div><dt>증빙 검수</dt><dd>{ownerEvidence.some((item) => item.reviewStatus === 'approved') ? '승인' : '미승인'}</dd></div>
              <div><dt>원천세 리스트</dt><dd>{taxRegistered ? '등록' : businessType === 'freelancer' ? '미등록' : '해당 없음'}</dd></div>
              <div><dt>최종 지급액</dt><dd className="money-cell">{money(isSeller ? settlement.currentCalculation.finalSellerPaymentAmount : settlement.currentCalculation.managerAmount)}</dd></div>
            </dl>
            {!reasons.length ? <p className="success-panel">지급요청 생성 가능</p> : <div className="block-reasons"><strong>지급요청 불가</strong><p>증빙자료 업로드 후 지급요청이 가능합니다.</p><ul>{reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></div>}
            <button className="primary-button" disabled={Boolean(reasons.length)} onClick={() => {
              if (isSeller) paymentRequestService.createPaymentRequest(settlement.id, '허수정')
              else paymentRequestService.createManagerPaymentRequest(settlement.id, '허수정', businessType)
              onSync()
            }} type="button">
              {isSeller ? '셀러 지급 요청 생성' : '매니저 지급 요청 생성'}
            </button>
          </article>
        })
      })}</div>
    </section>
    <section className="workspace-card"><div className="section-heading"><h2>생성된 지급 요청</h2><strong>{requests.length}건</strong></div>
      <div className="responsive-table"><table><thead><tr><th>공동구매</th><th>구분</th><th>대상자</th><th>최종 금액</th><th>증빙</th><th>상태</th><th>담당자</th></tr></thead>
      <tbody>{requests.map((request) => <tr key={request.id}><td>{campaignService.getCampaignById(request.campaignId)?.campaignName}</td><td>{request.recipientType === 'manager' ? '매니저' : '셀러'}</td><td>{request.recipientName}</td><td className="money-cell">{money(request.direction === 'seller_to_company' ? request.sellerRemittanceToCompany : request.amount)}</td><td>{request.evidenceStatus === 'confirmed' ? '확인' : '대기'}</td><td><span className="status-badge settlement">{statusLabel[request.status]}</span></td><td>{request.requestedBy}</td></tr>)}</tbody></table></div>
    </section>
  </>
}

function EvidenceTab({ evidence, onSync }: { evidence: PaymentEvidence[]; onSync: () => void }) {
  const [target, setTarget] = useState(() => settlementService.getSettlements()[0]?.id ?? '')
  const [ownerType, setOwnerType] = useState<EvidenceOwnerType>('seller')
  const settlement = settlementService.getSettlementById(target)
  const campaign = settlement && campaignService.getCampaignById(settlement.campaignId)
  const businessType = ownerType === 'seller'
    ? sellerSettlementService.getSellerSettlementRule(settlement?.campaignId ?? '')?.businessType ?? 'general_business'
    : managerPaymentService.getBusinessType(campaign?.managerName ?? '')
  const recommended = paymentEvidenceService.getRecommendedEvidenceType(businessType) ?? 'other'
  const upload = (file: File) => {
    if (!settlement || !campaign) return
    paymentEvidenceService.uploadEvidenceMetadata({
      campaignId: campaign.id, settlementId: settlement.id, ownerType,
      ownerId: ownerType === 'seller' ? campaign.sellerId : campaign.managerId,
      ownerName: ownerType === 'seller' ? campaign.sellerName : campaign.managerName,
      businessType, evidenceType: recommended, fileName: file.name, fileType: file.type,
      fileSize: file.size, previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
      uploadedBy: '허수정', memo: '브라우저 MVP 메타데이터',
    }); onSync()
  }
  return <>
    <section className="workspace-card evidence-upload">
      <div><h2>증빙자료 업로드</h2><p>실제 파일은 서버에 저장하지 않으며 localStorage에는 메타데이터만 보관됩니다. 새로고침 후 이미지 미리보기는 유지되지 않을 수 있습니다.</p></div>
      <div className="evidence-controls">
        <select value={target} onChange={(event) => setTarget(event.target.value)}>{settlementService.getSettlements().map((item) => <option key={item.id} value={item.id}>{campaignService.getCampaignById(item.campaignId)?.campaignName}</option>)}</select>
        <select value={ownerType} onChange={(event) => setOwnerType(event.target.value as EvidenceOwnerType)}><option value="seller">셀러</option><option value="manager">매니저</option></select>
        <span>추천 증빙: <strong>{evidenceLabels[recommended]}</strong> (담당자가 최종 유형 확정)</span>
        <label className="secondary-button">파일 선택<input hidden type="file" accept="image/*,.pdf" onChange={(event) => { const file = event.target.files?.[0]; if (file) upload(file) }} /></label>
      </div>
    </section>
    <section className="workspace-card"><div className="section-heading"><div><h2>증빙 검수</h2><p>기본 검수 담당자: 허수정 · 반려 사유는 필수입니다.</p></div><strong>{evidence.length}건</strong></div>
      <div className="evidence-review-grid">{evidence.map((item) => <article className="evidence-card" key={item.id}>
        {item.previewUrl && item.fileType.startsWith('image/') ? <img src={item.previewUrl} alt={`${item.ownerName} 증빙 미리보기`} /> : <div className="file-placeholder">파일 미리보기</div>}
        <div><span className={`status-badge ${item.reviewStatus === 'approved' ? 'done' : item.reviewStatus === 'rejected' ? 'error' : 'waiting'}`}>{reviewLabels[item.reviewStatus]}</span><h3>{item.ownerName} · {item.ownerType === 'seller' ? '셀러' : '매니저'}</h3><p>{campaignService.getCampaignById(item.campaignId)?.campaignName}</p><p>{evidenceLabels[item.evidenceType]} · {item.fileName} · {(item.fileSize / 1024).toFixed(1)} KB</p><small>{item.uploadedBy} · {new Date(item.uploadedAt).toLocaleString('ko-KR')}</small>{item.rejectionReason && <p className="danger-text">반려: {item.rejectionReason}</p>}</div>
        <div className="button-row">
          {item.reviewStatus === 'uploaded' && <button className="secondary-button" onClick={() => { paymentEvidenceService.requestEvidenceReview(item.id); onSync() }}>검수 요청</button>}
          {item.reviewStatus === 'review_pending' && <><button className="secondary-button" onClick={() => { paymentEvidenceService.approveEvidence(item.id); onSync() }}>승인</button><button className="danger-button" onClick={() => { const reason = window.prompt('반려 사유를 입력해주세요.'); if (reason) { paymentEvidenceService.rejectEvidence(item.id, reason); onSync() } }}>반려</button></>}
          <button className="text-button" onClick={() => { paymentEvidenceService.removeEvidence(item.id); onSync() }}>삭제</button>
        </div>
      </article>)}</div>
    </section>
  </>
}

function WithholdingTab({ assertion, onSync }: { assertion: ReturnType<typeof runWithholdingAssertions>; onSync: () => void }) {
  const [month, setMonth] = useState('')
  const [owner, setOwner] = useState('')
  const [status, setStatus] = useState('')
  const items = withholdingTaxService.getItems().filter((item) => (!month || item.paymentMonth === month) && (!owner || item.ownerType === owner) && (!status || item.status === status))
  const copy = async () => navigator.clipboard.writeText(JSON.stringify(withholdingTaxService.toCsvRows(items), null, 2))
  return <>
    <div className="payment-kpi-grid tax-kpis">{[
      ['이번 달 등록 건수', items.length], ['신고 준비', items.filter((i) => i.status === 'ready').length],
      ['업로드 완료', items.filter((i) => i.status === 'uploaded').length], ['신고 완료', items.filter((i) => i.status === 'reported').length],
      ['납부 완료', items.filter((i) => i.status === 'paid').length], ['수정 필요', items.filter((i) => i.status === 'revision_required').length],
    ].map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
    <section className="workspace-card">
      <div className="section-heading"><div><h2>프리랜서 3.3% 원천세 리스트</h2><p>홈택스 형식이 아닌 내부 검토용 MVP 데이터입니다.</p></div><div className="button-row"><button className="secondary-button" onClick={copy}>클립보드 복사</button><button className="secondary-button" onClick={() => window.alert('회사 홈택스 템플릿 확보 후 다운로드 형식을 연결합니다.')}>다운로드 placeholder</button></div></div>
      <div className="tax-filters"><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /><select value={owner} onChange={(e) => setOwner(e.target.value)}><option value="">셀러·매니저 전체</option><option value="seller">셀러</option><option value="manager">매니저</option></select><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">상태 전체</option>{Object.entries(taxStatusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
      <div className="responsive-table tax-table"><table><thead><tr><th>지급월</th><th>지급일</th><th>공동구매</th><th>구분</th><th>셀러 또는 매니저</th><th>부가세 포함 정산금</th><th>부가세 제외 기준금액</th><th>소득세 3%</th><th>지방소득세 0.3%</th><th>총 원천징수액</th><th>최종 지급액</th><th>상태</th><th>담당자</th><th>수동 처리</th></tr></thead>
      <tbody>{items.map((item) => <tr key={item.id}><td>{item.paymentMonth}</td><td>{item.paymentDate ?? '-'}</td><td>{campaignService.getCampaignById(item.campaignId)?.campaignName}</td><td>{item.ownerType === 'seller' ? '셀러' : '매니저'}</td><td>{item.ownerName}</td><td className="money-cell">{money(item.grossSettlementAmount)}</td><td className="money-cell">{money(item.withholdingBaseAmount)}</td><td className="money-cell">{money(item.incomeTaxAmount)}</td><td className="money-cell">{money(item.localIncomeTaxAmount)}</td><td className="money-cell">{money(item.totalWithholdingTaxAmount)}</td><td className="money-cell"><strong>{money(item.finalPaymentAmount)}</strong></td><td>{taxStatusLabels[item.status]}</td><td>{item.updatedBy}</td><td><select value={item.status} onChange={(e) => { withholdingTaxService.updateStatus(item.id, e.target.value as WithholdingTaxStatus); onSync() }}>{['ready', 'uploaded', 'reported', 'paid'].map((value) => <option key={value} value={value}>{taxStatusLabels[value as WithholdingTaxStatus]}</option>)}</select></td></tr>)}</tbody></table></div>
    </section>
    <section className={`calculation-log ${assertion.passed ? 'is-valid' : 'is-invalid'}`}><h3>사례 A 계산 로그 · {assertion.passed ? '검증 통과' : '검증 실패'}</h3>{assertion.calculation.log.map((line) => <code key={line}>{line}</code>)}</section>
  </>
}
