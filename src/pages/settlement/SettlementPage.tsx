import { useEffect, useRef, useState, type RefObject } from 'react'
import { campaignService } from '../../shared/services/campaignService'
import { salesDataService } from '../../shared/services/salesDataService'
import { settlementService } from '../../shared/services/settlementService'
import { paymentEvidenceService } from '../../shared/services/paymentEvidenceService'
import { managerPaymentService } from '../../shared/services/managerPaymentService'
import { sellerSettlementService } from '../../shared/services/sellerSettlementService'
import { withholdingTaxService } from '../../shared/services/withholdingTaxService'
import type { SalesDataRow } from '../../shared/types/salesData'
import type { Settlement, SettlementDeduction, SettlementStatus, SettlementVersion } from '../../shared/types/settlement'
import { canMoveToReview, runSettlementAssertions, statusLabel, validateSettlement } from '../../shared/utils/settlement'
import { formatCurrency } from '../../shared/utils/salesData'
import { openCampaignDetail } from '../../shared/utils/campaignNavigation'
import { calculateFinalSellerPayment } from '../../shared/utils/sellerSettlement'
import { companySettlementProfile } from '../../shared/data/companySettlementProfile'
import { EvidencePreviewModal } from '../payment-request/components/EvidencePreviewModal'
import type { PaymentEvidence } from '../../shared/types/paymentEvidence'

type DocumentMode = '내부 검토용' | '셀러 전달용'
const statusTone: Record<SettlementStatus, string> = {
  draft: 'muted',
  calculating: 'progress',
  review_pending: 'warning',
  revision_required: 'danger',
  manager_reviewed: 'settlement',
  approval_pending: 'settlement',
  approved: 'settlement',
  payment_ready: 'progress',
  partially_paid: 'warning',
  completed: 'complete',
  canceled: 'muted',
}

const actionLabels: Record<string, string> = {
  draft_created: '정산 초안 생성',
  calculation_run: '계산 실행',
  deduction_added: '차감 항목 추가',
  deduction_updated: '차감 항목 수정',
  deduction_removed: '차감 항목 삭제',
  commission_rate_updated: '수수료율 수정',
  manager_review_requested: '매니저 검토 요청',
  manager_review_completed: '매니저 검토 완료',
  revision_requested: '수정 요청',
  approval_requested: '대표 승인 요청',
  approved: '대표 승인',
  payment_ready: '지급 준비',
  seller_payment_completed: '셀러 지급 완료',
  manager_payment_completed: '매니저 지급 완료',
  company_settlement_completed: '업체 정산 완료',
  completed: '최종 완료',
}

function Badge({ label, tone }: { label: string; tone: string }) {
  return <span className={`campaign-status campaign-status--${tone}`}>{label}</span>
}

function money(value: number) {
  return formatCurrency(value).replace('원', '원')
}

function getCampaign(settlement: Settlement) {
  return campaignService.getCampaignById(settlement.campaignId)
}

export function SettlementPage({ onOpenDetail }: { onOpenDetail: (settlementId: string) => void }) {
  const [settlements, setSettlements] = useState(() => settlementService.getSettlements())
  const [quick, setQuick] = useState<SettlementStatus | 'all'>(() => (sessionStorage.getItem('settlement-list-filter') as SettlementStatus | 'all' | null) ?? 'all')

  useEffect(() => {
    const savedScroll = Number(sessionStorage.getItem('settlement-list-scroll') ?? 0)
    requestAnimationFrame(() => window.scrollTo({ top: savedScroll }))
  }, [])

  useEffect(() => { sessionStorage.setItem('settlement-list-filter', quick) }, [quick])

  const sync = () => setSettlements(settlementService.getSettlements())
  const eligibleSales = salesDataService.getSalesDataImports().filter((item) => item.reviewStatus === '확정 완료' && item.settlementStatus === '정산 가능')
  const filtered = quick === 'all' ? settlements : settlements.filter((item) => item.status === quick)
  const assertion = runSettlementAssertions()

  const kpis = [
    ['정산 생성 대기', eligibleSales.length],
    ['작성 중', settlements.filter((item) => item.status === 'draft').length],
    ['검토 대기', settlements.filter((item) => item.status === 'review_pending').length],
    ['수정 필요', settlements.filter((item) => item.status === 'revision_required').length],
    ['대표 승인 대기', settlements.filter((item) => item.status === 'approval_pending').length],
    ['지급 준비', settlements.filter((item) => item.status === 'payment_ready').length],
    ['최종 완료', settlements.filter((item) => item.status === 'completed').length],
  ] as const

  const dueThisWeek = settlements.filter((item) => item.status !== 'completed').reduce((total, item) => total + item.currentCalculation.finalPaymentAmount + item.currentCalculation.finalSellerPaymentAmount, 0)
  const sellerDue = settlements.filter((item) => item.status !== 'completed').reduce((total, item) => total + item.currentCalculation.finalSellerPaymentAmount, 0)
  const managerDue = settlements.filter((item) => item.status !== 'completed').reduce((total, item) => total + item.currentCalculation.finalPaymentAmount, 0)
  const evidenceMissing = settlements.filter((item) => item.evidenceStatus !== 'confirmed').length
  const calculationErrors = settlements.filter((item) => !validateSettlement(item).valid).length

  const createFirstReadySettlement = () => {
    const created = eligibleSales.map((item) => settlementService.createSettlementFromSalesData(item.id)).find(Boolean)
    sync()
    if (created) onOpenDetail(created.id)
  }

  return (
    <section className="campaign-schedule-page settlement-page">
      <section className="schedule-summary">
        <div className="schedule-summary__title">
          <div>
            <p className="page-eyebrow">Settlement V2</p>
            <h2>정산 관리</h2>
          </div>
          <button className="primary-button" disabled={!eligibleSales.length} onClick={createFirstReadySettlement} type="button">정산 생성</button>
        </div>
        <div className="settlement-kpi-grid">
          {kpis.map(([label, value]) => (
            <button className="summary-count-card" key={label} onClick={() => {
              const target = settlements.find((item) => statusLabel(item.status) === label.replace('작성 중', '작성 중'))
              setQuick(target?.status ?? 'all')
            }} type="button">
              <span>{label}</span>
              <strong>{value}</strong>
            </button>
          ))}
        </div>
        <div className="settlement-money-kpis">
          <Metric label="이번 주 지급 예정액" value={money(dueThisWeek)} />
          <Metric label="셀러 지급 예정액" value={money(sellerDue)} />
          <Metric label="매니저 지급 예정액" value={money(managerDue)} />
          <Metric label="증빙 미확인 건수" value={`${evidenceMissing}건`} />
          <Metric label="계산 오류 건수" value={`${calculationErrors}건`} tone={calculationErrors ? 'danger' : 'complete'} />
        </div>
      </section>

      {!assertion.passed && <div className="inline-notice settlement-warning"><strong>경계값 검증 실패</strong><span>정산 계산 유틸을 확인해야 합니다.</span></div>}

      <section className="panel">
        <div className="panel__header">
          <div>
            <h2>정산 목록</h2>
            <p>확정된 판매 데이터에서 생성된 정산 초안과 승인 흐름을 확인합니다.</p>
          </div>
          <strong className="result-count">{filtered.length}건</strong>
        </div>
        <div className="schedule-panel__body">
          <div className="schedule-table-wrap settlement-table-wrap">
            <table className="schedule-table settlement-table">
              <thead>
                <tr>
                  <th>공동구매</th><th>셀러</th><th>브랜드</th><th>판매 기간</th><th>정산 버전</th><th>총매출</th><th>총수수료</th><th>벤더 수수료</th><th>차감 합계</th><th>최종 배분 대상 금액</th><th>매니저 지급액</th><th>회사 귀속액</th><th>셀러 지급액</th><th>증빙 상태</th><th>정산 상태</th><th>정산 담당자</th><th>지급 예정일</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((settlement) => {
                  const campaign = getCampaign(settlement)
                  const salesImport = salesDataService.getSalesDataImportById(settlement.salesDataImportId)
                  return (
                    <tr key={settlement.id}>
                      <td><button className="settlement-name-link" onClick={() => { sessionStorage.setItem('settlement-list-scroll', String(window.scrollY)); onOpenDetail(settlement.id) }} type="button"><strong>{campaign?.campaignName ?? settlement.campaignId}</strong><span>{campaign?.campaignCode}</span></button></td>
                      <td>{campaign?.sellerName ?? '-'}</td>
                      <td>{campaign?.brandName ?? '-'}</td>
                      <td>{salesImport?.salesStartDate || '-'} ~ {salesImport?.salesEndDate || '-'}</td>
                      <td>v{settlement.settlementVersion}</td>
                      <td className="amount-cell">{money(settlement.currentCalculation.grossSales)}</td>
                      <td className="amount-cell">{money(settlement.currentCalculation.grossCommission)}</td>
                      <td className="amount-cell">{money(settlement.currentCalculation.vendorCommission)}</td>
                      <td className="amount-cell">{money(settlement.currentCalculation.deductionTotal)}</td>
                      <td className="amount-cell">{money(settlement.currentCalculation.distributableVendorCommission)}</td>
                      <td className="amount-cell">{money(settlement.currentCalculation.managerAmount)}</td>
                      <td className="amount-cell">{money(settlement.currentCalculation.companyAmount)}</td>
                      <td className="amount-cell">{money(settlement.currentCalculation.finalSellerPaymentAmount)}</td>
                      <td>{settlement.evidenceStatus === 'confirmed' ? '확인 완료' : '미확인'}</td>
                      <td><Badge label={statusLabel(settlement.status)} tone={statusTone[settlement.status]} /></td>
                      <td>{settlement.assigneeName}</td>
                      <td>{settlement.paymentDueDate}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="schedule-mobile-list settlement-mobile-list">
            {filtered.map((settlement) => {
              const campaign = getCampaign(settlement)
              const salesImport = salesDataService.getSalesDataImportById(settlement.salesDataImportId)
              return <article className="settlement-mobile-card" key={settlement.id}>
                <button className="settlement-name-link" onClick={() => { sessionStorage.setItem('settlement-list-scroll', String(window.scrollY)); onOpenDetail(settlement.id) }} type="button"><strong>{campaign?.campaignName ?? settlement.campaignId}</strong><span>{campaign?.sellerName ?? '-'} · {campaign?.brandName ?? '-'}</span></button>
                <Badge label={statusLabel(settlement.status)} tone={statusTone[settlement.status]} />
                <dl><div><dt>판매 기간</dt><dd>{salesImport?.salesStartDate || '-'} ~ {salesImport?.salesEndDate || '-'}</dd></div><div><dt>셀러 지급 예정액</dt><dd>{money(settlement.currentCalculation.finalSellerPaymentAmount)}</dd></div><div><dt>매니저 지급 예정액</dt><dd>{money(settlement.currentCalculation.managerAmount)}</dd></div><div><dt>정산 담당자</dt><dd>{settlement.assigneeName} · v{settlement.settlementVersion}</dd></div></dl>
              </article>
            })}
          </div>
        </div>
      </section>
    </section>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return <div className={`settlement-money-kpi ${tone ? `settlement-money-kpi--${tone}` : ''}`}><span>{label}</span><strong>{value}</strong></div>
}

export function SettlementDetailPage({ settlementId, onBack }: { settlementId: string; onBack: () => void }) {
  const [settlement, setSettlement] = useState<Settlement | null>(() => settlementService.getSettlementById(settlementId) ?? null)
  const [documentMode, setDocumentMode] = useState<DocumentMode>('셀러 전달용')
  const [documentNotice, setDocumentNotice] = useState('')
  const [compareOpen, setCompareOpen] = useState(false)
  const [previewEvidence, setPreviewEvidence] = useState<PaymentEvidence | null>(null)
  const sellerDocumentRef = useRef<HTMLDivElement | null>(null)
  if (!settlement) return <section className="settlement-detail-page"><button className="settlement-back-button" onClick={onBack} type="button">← 정산 관리로 돌아가기</button><div className="empty-state"><strong>정산을 찾을 수 없습니다.</strong><span>삭제되었거나 접근할 수 없는 정산입니다.</span></div></section>

  const campaign = getCampaign(settlement)
  const deductions = settlementService.getDeductionsBySettlementId(settlement.id)
  const versions = settlementService.getSettlementVersionsBySettlementId(settlement.id)
  const logs = settlementService.getActivityLogsBySettlementId(settlement.id)
  const validation = validateSettlement(settlement)
  const salesImport = salesDataService.getSalesDataImportById(settlement.salesDataImportId)
  const salesRows = salesDataService.getRowsByImportId(settlement.salesDataImportId)
  const salesDataConfirmed = salesImport?.reviewStatus === '확정 완료'
  const reviewReady = canMoveToReview(settlement, salesDataConfirmed)
  const checklistDone = Object.values(settlement.reviewChecklist).every(Boolean)
  const sellerRule = sellerSettlementService.getSellerSettlementRule(settlement.campaignId)
  const sellerEvidence = paymentEvidenceService.getEvidenceBySettlementId(settlement.id, 'seller')
  const managerEvidence = paymentEvidenceService.getEvidenceBySettlementId(settlement.id, 'manager')
  const sellerTaxRegistered = campaign ? withholdingTaxService.getBySettlementOwner(settlement.id, 'seller', campaign.sellerId).length > 0 : false
  const managerTaxRegistered = campaign ? withholdingTaxService.getBySettlementOwner(settlement.id, 'manager', campaign.managerId).length > 0 : false
  const managerBusinessType = managerPaymentService.getBusinessType(campaign?.managerName ?? '')

  const syncAction = (action: () => unknown) => {
    action()
    setSettlement(settlementService.getSettlementById(settlement.id) ?? null)
  }

  const copySellerMessage = async () => {
    const evidenceName = settlement.taxType === 'tax_invoice' ? '세금계산서' : settlement.taxType === 'cash_receipt' ? '현금영수증' : '3.3%'
    const message = `안녕하세요.\n${campaign?.campaignName ?? settlement.campaignId} 정산서를 전달드립니다.\n\n정산금액: ${money(settlement.currentCalculation.finalSellerPaymentAmount)}\n증빙 유형: ${evidenceName}\n증빙 요청일: ${new Date().toISOString().slice(0, 10)}\n지급 예정일: ${settlement.paymentDueDate}\n\n정산 내용을 확인해주시고,\n수정이 필요한 부분이 있다면 담당 매니저에게 전달 부탁드립니다.`
    await navigator.clipboard?.writeText(message)
    setDocumentNotice('전달 문구를 클립보드에 복사했습니다.')
  }

  const copySellerDocumentText = async () => {
    await navigator.clipboard?.writeText(sellerDocumentRef.current?.innerText ?? '')
    setDocumentNotice('셀러용 정산서 내용을 클립보드에 복사했습니다.')
  }

  const saveSellerDocumentImage = async () => {
    const node = sellerDocumentRef.current
    if (!node) return
    try {
      const rect = node.getBoundingClientRect()
      const cloned = node.cloneNode(true) as HTMLElement
      cloned.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml')
      const markup = new XMLSerializer().serializeToString(cloned)
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(rect.width)}" height="${Math.ceil(rect.height)}"><foreignObject width="100%" height="100%">${markup}</foreignObject></svg>`
      const image = new Image()
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve()
        image.onerror = () => reject(new Error('이미지 변환에 실패했습니다.'))
        image.src = url
      })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(rect.width * 2)
      canvas.height = Math.ceil(rect.height * 2)
      const context = canvas.getContext('2d')
      if (!context) throw new Error('브라우저 캔버스를 사용할 수 없습니다.')
      context.scale(2, 2)
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, rect.width, rect.height)
      context.drawImage(image, 0, 0)
      URL.revokeObjectURL(url)
      const pngUrl = canvas.toDataURL('image/png')
      const link = document.createElement('a')
      link.href = pngUrl
      link.download = `정산서_${campaign?.sellerName ?? '셀러'}_${campaign?.campaignName ?? settlement.id}_${new Date().toISOString().slice(0, 10)}.png`
      link.click()
      setDocumentNotice('셀러용 정산서를 이미지로 저장했습니다.')
    } catch (error) {
      setDocumentNotice(error instanceof Error ? error.message : '이미지 저장에 실패했습니다.')
    }
  }

  return (
    <section className="settlement-detail-page">
        <button className="settlement-back-button" onClick={onBack} type="button">← 정산 관리로 돌아가기</button>
        <div className="settlement-detail-header">
          <div>
            <div className="settlement-title-row"><h1>{campaign?.campaignName ?? settlement.campaignId}</h1><Badge label={statusLabel(settlement.status)} tone={statusTone[settlement.status]} /></div>
            <p>{campaign?.sellerName ?? '-'} · {campaign?.brandName ?? '-'}</p>
            <p>{salesImport?.salesStartDate || '-'} ~ {salesImport?.salesEndDate || '-'}</p>
            <p>정산 담당자 {settlement.assigneeName} · v{settlement.settlementVersion}</p>
          </div>
        </div>

        {settlement.hasSourceChanged && (
          <div className="inline-notice settlement-warning">
            <strong>원본 데이터 변경됨</strong>
            <span>이전 승인값과 현재 계산값 비교 후 재검토가 필요합니다.</span>
          </div>
        )}
        {!validation.valid && (
          <div className="settlement-error-list">
            {validation.errors.map((error) => <span key={error}>{error}</span>)}
          </div>
        )}

        <section className="settlement-page-section" id="basic-info"><div className="section-heading"><div><p className="page-eyebrow">1. 정산 요약</p><h2>정산 요약</h2></div><Badge label={statusLabel(settlement.status)} tone={statusTone[settlement.status]} /></div><div className="settlement-top-meta">
          <Summary label="공동구매명" value={campaign?.campaignName ?? settlement.campaignId} />
          <Summary label="셀러" value={campaign?.sellerName ?? '-'} />
          <Summary label="브랜드" value={campaign?.brandName ?? '-'} />
          <Summary label="판매 기간" value={`${salesImport?.salesStartDate || '-'} ~ ${salesImport?.salesEndDate || '-'}`} />
          <Summary label="버전" value={`v${settlement.settlementVersion}`} />
          <Summary label="정산 담당자" value={settlement.assigneeName} />
        </div></section>

        <section className="settlement-page-section" id="key-amounts"><div className="section-heading"><div><h3>핵심 금액</h3></div></div><div className="settlement-summary-grid settlement-summary-grid--primary">
          <Summary label="총매출" value={money(settlement.currentCalculation.grossSales)} amount />
          <Summary label="셀러 지급 예정액" value={money(settlement.currentCalculation.finalSellerPaymentAmount)} amount emphasis />
          <Summary label="매니저 지급 예정액" value={money(settlement.currentCalculation.managerAmount)} amount emphasis />
          <Summary label="회사 귀속액" value={money(settlement.currentCalculation.companyAmount)} amount />
        </div></section>

        <SettlementProgress settlement={settlement} />

        <ProductSettlementTable rows={salesRows} settlement={settlement} productName={campaign?.productName} />

        <AdditionalCosts deductions={deductions} />

        <section className="detail-card settlement-card settlement-page-section" id="calculation-detail">
          <div className="checklist-head">
            <div><p className="page-eyebrow">4. 내부 정산 계산표</p><h2>정산 계산 상세</h2><p>기존 정산 계산 결과를 검수 순서대로 표시합니다.</p></div>
          </div>
          <CalculationTable settlement={settlement} />
        </section>

        <section className="detail-card settlement-card settlement-page-section" id="evidence">
          <div className="checklist-head">
            <div><p className="page-eyebrow">6. 증빙자료 · 7. 계좌 확인</p><h2>증빙자료 및 계좌 확인</h2><p>세무 유형, 업로드 파일, 검수 상태와 지급 계좌 확인 여부를 확인합니다.</p></div>
            <button className="secondary-button" onClick={() => syncAction(() => settlementService.updateEvidence(settlement.id, 'confirmed', true, true))} type="button">증빙·계좌 확인</button>
          </div>
          <div className="settlement-summary-grid">
            <Summary label="세무 유형" value={settlement.taxType === 'tax_invoice' ? '세금계산서' : settlement.taxType === 'cash_receipt' ? '현금영수증' : '3.3% 원천징수'} />
            <Summary label="증빙 상태" value={settlement.evidenceStatus === 'confirmed' ? '확인 완료' : '미확인'} />
            <Summary label="계좌 확인" value={settlement.accountConfirmed ? '확인 완료' : '미확인'} />
            <Summary label="적용 세금" value={money(settlement.currentCalculation.taxAmount)} amount />
            {campaign?.linkOwner === '브랜드사' && <Summary label="브랜드사 세금계산서 발행 금액" value={money(settlement.currentCalculation.grossCommission)} amount />}
          </div>
          <div className="payment-readiness-grid">
            <article className="readiness-card">
              <h3>셀러 지급 증빙</h3>
              <dl>
                <div><dt>사업자 유형</dt><dd>{sellerRule?.businessType ?? '확인 필요'}</dd></div>
                <div><dt>증빙 유형</dt><dd>{sellerRule?.confirmedEvidenceType ?? '최종 확인 필요'}</dd></div>
                <div><dt>업로드 상태</dt><dd>{sellerEvidence.length ? '업로드 완료' : '미업로드'}</dd></div>
                <div><dt>검수 상태</dt><dd>{sellerEvidence.some((item) => item.reviewStatus === 'approved') ? '승인' : '미승인'}</dd></div>
                <div><dt>원천세 리스트</dt><dd>{sellerRule?.businessType === 'freelancer' ? sellerTaxRegistered ? '등록' : '미등록' : '해당 없음'}</dd></div>
                <div><dt>최종 지급액</dt><dd>{money(settlement.currentCalculation.finalSellerPaymentAmount)}</dd></div>
              </dl>
            </article>
            <article className="readiness-card">
              <h3>매니저 지급 증빙</h3>
              <dl>
                <div><dt>사업자 유형</dt><dd>{managerBusinessType}</dd></div>
                <div><dt>증빙 유형</dt><dd>{managerBusinessType === 'freelancer' ? 'withholding_entry' : managerBusinessType === 'simplified_business' ? 'cash_receipt' : 'tax_invoice'}</dd></div>
                <div><dt>업로드 상태</dt><dd>{managerEvidence.length ? '업로드 완료' : '미업로드'}</dd></div>
                <div><dt>검수 상태</dt><dd>{managerEvidence.some((item) => item.reviewStatus === 'approved') ? '승인' : '미승인'}</dd></div>
                <div><dt>원천세 리스트</dt><dd>{managerBusinessType === 'freelancer' ? managerTaxRegistered ? '등록' : '미등록' : '해당 없음'}</dd></div>
                <div><dt>최종 지급액</dt><dd>{money(settlement.currentCalculation.managerAmount)}</dd></div>
              </dl>
            </article>
          </div>
          <EvidenceList evidence={[...sellerEvidence, ...managerEvidence]} onPreview={setPreviewEvidence} onSync={() => setSettlement(settlementService.getSettlementById(settlement.id) ?? null)} />
        </section>

        <section className="detail-card settlement-card settlement-page-section">
          <div className="checklist-head">
            <div><h3>검토 체크리스트</h3><p>모든 필수 항목이 완료되어야 매니저 검토 완료가 가능합니다.</p></div>
            <strong>{Object.values(settlement.reviewChecklist).filter(Boolean).length}/10</strong>
          </div>
          <div className="settlement-checklist">
            {Object.entries(checklistLabels).map(([key, label]) => (
              <label className="checklist-item" key={key}>
                <input checked={settlement.reviewChecklist[key as keyof typeof settlement.reviewChecklist]} onChange={(event) => {
                  settlementService.updateReviewChecklist(settlement.id, { ...settlement.reviewChecklist, [key]: event.target.checked })
                  setSettlement(settlementService.getSettlementById(settlement.id) ?? null)
                }} type="checkbox" />
                {label}
              </label>
            ))}
          </div>
          <div className="settlement-preview">
            <p>승인 상태: {statusLabel(settlement.status)} / 증빙: {settlement.evidenceStatus === 'confirmed' ? '확인 완료' : '미확인'}</p>
            <p>매니저 지급액 {money(settlement.currentCalculation.managerAmount)} / 회사 귀속액 {money(settlement.currentCalculation.companyAmount)}</p>
          </div>
        </section>

        <section className="detail-card settlement-card settlement-document-tab settlement-page-section" id="seller-document">
          <div className="checklist-head">
            <div><p className="page-eyebrow">5. 셀러 정산서</p><h2>셀러 정산서</h2><p>내부 검토용과 셀러 전달용 정산서를 분리해서 확인합니다.</p></div>
            <div className="action-row settlement-document-actions">
              <button className="secondary-button" onClick={() => setDocumentMode('내부 검토용')} type="button">내부 검토용</button>
              <button className="primary-button" onClick={() => setDocumentMode('셀러 전달용')} type="button">셀러 전달용 정산서 보기</button>
            </div>
          </div>
          {documentMode === '내부 검토용' ? (
            <InternalSettlementDocument campaignName={campaign?.campaignName ?? settlement.campaignId} settlement={settlement} />
          ) : (
            <>
              <SettlementDocumentActions
                onCopyText={copySellerDocumentText}
                onCopyMessage={copySellerMessage}
                onPreview={() => setDocumentNotice('아래 셀러용 정산서 영역이 이미지 미리보기 기준입니다.')}
                onPrint={() => window.print()}
                onSaveImage={saveSellerDocumentImage}
              />
              {documentNotice && <p className="mock-notice">{documentNotice}</p>}
              <SellerSettlementDocument rows={salesRows} sellerDocumentRef={sellerDocumentRef} settlement={settlement} />
            </>
          )}
        </section>

        <section className="detail-card settlement-card settlement-page-section" id="payment-history">
          <div className="checklist-head">
            <div><p className="page-eyebrow">8. 지급 요청 및 승인 이력</p><h2>지급 요청 및 승인 이력</h2><p>계산, 수정, 검토, 승인, 지급 이력을 확인합니다.</p></div>
          </div>
          <HistoryContent logs={logs} settlement={settlement} />
          <div className="checklist-head">
            <div><h3>버전 관리</h3><p>승인본은 직접 덮어쓰지 않고 버전을 증가시켜 비교합니다.</p></div>
            <button className="secondary-button" disabled={versions.length < 2} onClick={() => setCompareOpen(true)} type="button">버전 비교</button>
          </div>
          <div className="version-list">
            {versions.map((version) => (
              <article key={version.id}>
                <strong>v{version.version}</strong>
                <span>{formatKoreanDateTime(version.changedAt)} · {version.changedBy}</span>
                <p>{version.reason}</p>
                <dl><div><dt>변경 전</dt><dd>{money(version.beforeAmount)}</dd></div><div><dt>변경 후</dt><dd>{money(version.afterAmount)}</dd></div><div><dt>승인 상태</dt><dd>{statusLabel(version.status)}</dd></div></dl>
              </article>
            ))}
          </div>
        </section>

        <div className="preview-drawer__actions">
          <button className="secondary-button" onClick={() => openCampaignDetail(settlement.campaignId, 'settlement')} type="button">공동구매 상세 보기</button>
          <SettlementStatusActions
            checklistDone={checklistDone}
            onHistory={() => document.getElementById('payment-history')?.scrollIntoView({ behavior: 'smooth' })}
            onSetDocument={() => document.getElementById('seller-document')?.scrollIntoView({ behavior: 'smooth' })}
            reviewReady={reviewReady}
            settlement={settlement}
            syncAction={syncAction}
          />
        </div>

        {compareOpen && <VersionCompareModal versions={versions} onClose={() => setCompareOpen(false)} />}
        <EvidencePreviewModal evidence={previewEvidence} onClose={() => setPreviewEvidence(null)} />
    </section>
  )
}

function ProductSettlementTable({ productName, rows, settlement }: { productName?: string; rows: SalesDataRow[]; settlement: Settlement }) {
  const totalQuantity = rows.reduce((sum, row) => sum + row.netQuantity, 0)
  return (
    <section className="detail-card settlement-card settlement-page-section" id="product-settlement">
      <div className="section-heading"><div><p className="page-eyebrow">2. 상품/SKU별 정산 내역</p><h2>상품/SKU별 정산 내역</h2></div></div>
      {rows.length ? <>
        <div className="settlement-work-table-wrap"><table className="settlement-work-table">
          <thead><tr><th>상품명</th><th>구분/SKU</th><th>판매수량</th><th>공구가(VAT 포함)</th><th>매출액(VAT 포함)</th><th>수수료율(VAT 포함)</th><th>수수료</th><th>비고</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.id}><td>{productName ?? '-'}</td><td>{row.optionName}</td><td className="amount-cell">{row.netQuantity.toLocaleString('ko-KR')}</td><td className="amount-cell">{money(row.unitPrice)}</td><td className="amount-cell">{money(row.netSales)}</td><td className="amount-cell">{settlement.currentCalculation.sellerCommissionRate}%</td><td className="amount-cell">{money(Math.round(row.netSales * settlement.currentCalculation.sellerCommissionRate / 100))}</td><td>{row.validationStatus === 'valid' ? '' : row.validationMessage}</td></tr>)}</tbody>
          <tfoot><tr><th colSpan={2}>판매 소계</th><td className="amount-cell">{totalQuantity.toLocaleString('ko-KR')}</td><td></td><td className="amount-cell">{money(settlement.currentCalculation.grossSales)}</td><td></td><td className="amount-cell">{money(settlement.currentCalculation.sellerCommissionAmount)}</td><td></td></tr></tfoot>
        </table></div>
      </> : <p className="settlement-empty-data">SKU별 판매 데이터가 아직 연결되지 않았습니다.</p>}
    </section>
  )
}

const deductionTypeLabel: Record<string, string> = { purchase: '개인구매비용', event: '이벤트비용', other: '기타 차감', promotion: '기타 추가 지급' }
const costOwnerLabel: Record<string, string> = { seller: '셀러', company: '회사', brand: '벤더', manager: '매니저', undecided: '미정' }

function AdditionalCosts({ deductions }: { deductions: SettlementDeduction[] }) {
  const categories = ['purchase', 'event', 'other', 'promotion'].map((type) => {
    const items = deductions.filter((item) => item.type === type)
    return { type, items, amount: items.reduce((sum, item) => sum + item.amount, 0) }
  })
  return (
    <section className="detail-card settlement-card settlement-page-section" id="additional-costs">
      <div className="section-heading"><div><p className="page-eyebrow">3. 추가 비용 및 차감</p><h2>추가 비용 및 차감</h2><p>배송비는 판매 수수료 계산 대상에서 제외하는 기존 정책을 유지합니다.</p></div></div>
      <div className="settlement-work-table-wrap"><table className="settlement-work-table"><thead><tr><th>항목</th><th>금액</th><th>부담 주체</th><th>메모</th><th>최종 정산 반영</th></tr></thead><tbody>
        {categories.map(({ amount, items, type }) => <tr key={type}><td>{deductionTypeLabel[type]}</td><td className="amount-cell">{money(amount)}</td><td>{items.length ? [...new Set(items.map((item) => costOwnerLabel[item.costOwner] ?? item.costOwner))].join(', ') : '없음'}</td><td>{items.map((item) => item.memo).filter(Boolean).join(' / ') || '없음'}</td><td>{items.some((item) => item.reflected) ? '반영' : '미반영'}</td></tr>)}
      </tbody></table></div>
    </section>
  )
}

function formatKoreanDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(date).replace(/\. /g, '-').replace('.', '')
}

function CalculationTable({ settlement }: { settlement: Settlement }) {
  return <div className="settlement-work-table-wrap"><table className="settlement-work-table settlement-calculation-table"><thead><tr><th>항목</th><th>계산식</th><th>결과</th><th>계산 근거</th></tr></thead><tbody>{settlement.calculationSteps.map((step) => (
    <tr key={step.id}><td><strong>{step.label}</strong>{step.modified && <span className="manual-modified">⚠ 수동 수정</span>}</td><td>{step.formula}</td><td className="amount-cell">{typeof step.result === 'number' ? money(step.result) : step.result}</td><td><details className="calculation-evidence"><summary>계산 근거 보기</summary><dl><div><dt>입력값</dt><dd>{step.inputValues.length ? step.inputValues.join(' / ') : '-'}</dd></div><div><dt>값의 출처</dt><dd>{step.source}</dd></div><div><dt>수정 여부</dt><dd>{step.modified ? '담당자 수정' : '자동 계산'}</dd></div><div><dt>계산 시각</dt><dd>{formatKoreanDateTime(step.calculatedAt)}</dd></div></dl></details></td></tr>
  ))}</tbody></table></div>
}

function Summary({ label, value, amount, emphasis }: { label: string; value: string; amount?: boolean; emphasis?: boolean }) {
  return <div className={`settlement-summary-item${emphasis ? ' settlement-summary-item--emphasis' : ''}`}><span>{label}</span><strong className={amount ? 'amount-cell' : ''}>{value}</strong></div>
}

const workflowSteps = ['정산 계산', '정산서 검토', '셀러 전달', '증빙 확인', '지급 요청', '대표 승인', '지급 완료'] as const

function getWorkflowState(settlement: Settlement) {
  if (settlement.status === 'completed') return { index: 6, current: '지급 완료', next: '모든 정산 업무가 완료되었습니다.' }
  if (settlement.status === 'payment_ready' || settlement.status === 'partially_paid') return { index: 6, current: '지급 처리 중', next: '셀러와 매니저 지급을 완료해주세요.' }
  if (settlement.status === 'approval_pending') return { index: 5, current: '대표 승인 대기', next: '대표 승인 결과를 확인해주세요.' }
  if (settlement.status === 'approved') return { index: 4, current: '지급 요청 대기', next: '승인된 정산의 지급을 요청해주세요.' }
  if (settlement.evidenceStatus === 'confirmed') return { index: 3, current: '증빙 확인', next: '증빙과 계좌를 확인한 뒤 지급을 요청해주세요.' }
  if (settlement.status === 'manager_reviewed') return { index: 2, current: '셀러 정산서 전달 대기', next: '셀러에게 정산서를 전달해주세요.' }
  if (['review_pending', 'revision_required'].includes(settlement.status)) return { index: 1, current: '정산서 검토', next: '검토 체크리스트를 완료하고 정산서를 확정해주세요.' }
  return { index: 0, current: '정산 계산', next: '정산 계산을 실행하고 결과를 검토해주세요.' }
}

function SettlementProgress({ settlement }: { settlement: Settlement }) {
  const state = getWorkflowState(settlement)
  return <section className="settlement-page-section settlement-progress-section" id="progress">
    <div className="section-heading"><div><p className="page-eyebrow">3. 정산 진행상황</p><h2>정산 진행상황</h2></div></div>
    <ol className="settlement-stepper">{workflowSteps.map((step, index) => <li className={index < state.index ? 'is-complete' : index === state.index ? 'is-current' : ''} key={step}><span>{index < state.index ? '✓' : index + 1}</span><strong>{step}</strong></li>)}</ol>
    <div className="settlement-next-action"><div><span>현재 단계</span><strong>{state.current}</strong></div><div><span>다음 할 일</span><strong>{state.next}</strong></div></div>
  </section>
}

const evidenceTypeLabels = { tax_invoice: '세금계산서', cash_receipt: '현금영수증', withholding_entry: '원천징수', other: '기타' }
const evidenceReviewLabels = { not_uploaded: '미업로드', uploaded: '업로드 완료', review_pending: '검수 대기', approved: '승인', rejected: '반려' }

function EvidenceList({ evidence, onPreview, onSync }: { evidence: PaymentEvidence[]; onPreview: (evidence: PaymentEvidence) => void; onSync: () => void }) {
  if (!evidence.length) return <div className="empty-state"><strong>업로드된 증빙자료가 없습니다.</strong><span>지급 요청에서 증빙을 업로드하면 이곳에서 확인할 수 있습니다.</span></div>
  return <div className="settlement-evidence-list">{evidence.map((item) => <article key={item.id}>
    <button className="settlement-evidence-preview" onClick={() => onPreview(item)} type="button">{item.previewUrl && item.fileType.startsWith('image/') ? <img alt={`${item.fileName} 미리보기`} src={item.previewUrl} /> : <span>{item.fileType === 'application/pdf' ? 'PDF' : 'FILE'}<small>크게 보기</small></span>}</button>
    <dl><div><dt>대상 · 증빙 유형</dt><dd>{item.ownerName} · {evidenceTypeLabels[item.evidenceType]}</dd></div><div><dt>업로드 상태</dt><dd>업로드 완료</dd></div><div><dt>업로드 파일</dt><dd>{item.fileName}</dd></div><div><dt>검수 상태</dt><dd>{evidenceReviewLabels[item.reviewStatus]}</dd></div><div><dt>검수자</dt><dd>{item.reviewedBy ?? '-'}</dd></div><div><dt>검수일</dt><dd>{item.reviewedAt ? new Date(item.reviewedAt).toLocaleString('ko-KR') : '-'}</dd></div></dl>
    {item.reviewStatus === 'review_pending' && <div className="button-row"><button className="secondary-button" onClick={() => { const reason = window.prompt('반려 사유를 입력해주세요.'); if (reason) { paymentEvidenceService.rejectEvidence(item.id, reason); onSync() } }} type="button">반려</button><button className="primary-button" onClick={() => { paymentEvidenceService.approveEvidence(item.id); onSync() }} type="button">승인</button></div>}
  </article>)}</div>
}

const checklistLabels = {
  salesMatches: '총매출이 Sales Data와 일치함',
  commissionRateConfirmed: '수수료율이 정확함',
  sampleCostReflected: '샘플비가 반영됨',
  eventCostReflected: '이벤트비가 반영됨',
  otherDeductionsConfirmed: '기타 차감이 확인됨',
  costOwnersConfirmed: '비용 부담자가 정확함',
  managerShareConfirmed: '매니저 배분율이 정확함',
  taxTypeConfirmed: '세무 유형이 정확함',
  evidenceConfirmed: '증빙 상태가 확인됨',
  paymentAccountConfirmed: '지급 계좌 정보가 확인됨',
}

function InternalSettlementDocument({ campaignName, settlement }: { campaignName: string; settlement: Settlement }) {
  return (
    <div className="internal-settlement-document">
      <div className="checklist-head">
        <div><h4>{campaignName} 내부 검토용 정산서</h4><p>내부 수수료, 벤더 배분, 승인 상태를 포함합니다.</p></div>
        <Badge label={statusLabel(settlement.status)} tone={statusTone[settlement.status]} />
      </div>
      <div className="settlement-summary-grid">
        <Summary label="총매출" value={money(settlement.currentCalculation.grossSales)} amount />
        <Summary label="총수수료율" value={`${settlement.currentCalculation.totalCommissionRate}%`} />
        <Summary label="총수수료" value={money(settlement.currentCalculation.grossCommission)} amount />
        <Summary label="셀러 수수료율" value={`${settlement.currentCalculation.sellerCommissionRate}%`} />
        <Summary label="셀러 지급액" value={money(settlement.currentCalculation.finalSellerPaymentAmount)} amount />
        <Summary label="벤더 수수료" value={money(settlement.currentCalculation.vendorCommission)} amount />
        <Summary label="샘플비" value={money(settlement.currentCalculation.companySampleDeduction)} amount />
        <Summary label="이벤트비" value={money(settlement.currentCalculation.companyEventDeduction)} amount />
        <Summary label="기타 차감" value={money(settlement.currentCalculation.companyOtherDeduction)} amount />
        <Summary label="최종 배분 대상 금액" value={money(settlement.currentCalculation.distributableVendorCommission)} amount />
        <Summary label="매니저 지급액" value={money(settlement.currentCalculation.managerAmount)} amount />
        <Summary label="회사 귀속액" value={money(settlement.currentCalculation.companyAmount)} amount />
      </div>
      <div className="preview-text-list">
        {settlement.calculationSteps.map((step) => <p key={step.id}>{step.order}. {step.label}: {typeof step.result === 'number' ? money(step.result) : step.result}</p>)}
      </div>
    </div>
  )
}

function SellerSettlementDocument({ rows, sellerDocumentRef, settlement }: { rows: SalesDataRow[]; sellerDocumentRef: RefObject<HTMLDivElement | null>; settlement: Settlement }) {
  const campaign = getCampaign(settlement)
  const salesImport = salesDataService.getSalesDataImportById(settlement.salesDataImportId)
  const deductions = settlementService.getDeductionsBySettlementId(settlement.id).filter((item) => ['purchase', 'event'].includes(item.type) && item.costOwner === 'seller')
  const sellerRule = sellerSettlementService.getSellerSettlementRule(settlement.campaignId)
  const totalQuantity = rows.reduce((total, row) => total + row.netQuantity, 0)
  const sellerDeductions = settlement.currentCalculation.sellerDeductionTotal
  const businessAmounts = [
    { type: 'corporation', label: '법인/개인사업자', evidence: '세금계산서 발행금액', ...calculateFinalSellerPayment(settlement.currentCalculation.sellerCommissionAmount, 'general_business', sellerDeductions) },
    { type: 'simplified_business', label: '간이사업자', evidence: '현금영수증 발행금액', ...calculateFinalSellerPayment(settlement.currentCalculation.sellerCommissionAmount, 'simplified_business', sellerDeductions) },
    { type: 'freelancer', label: '개인 프리랜서', evidence: '3.3% 원천세 공제 후 입금액', ...calculateFinalSellerPayment(settlement.currentCalculation.sellerCommissionAmount, 'freelancer', sellerDeductions) },
  ] as const
  const issuedAt = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

  return (
    <div className="seller-document-shell">
      <div className="seller-document" ref={sellerDocumentRef}>
        <header className="seller-document__header">
          <div>
            <h2>[{companySettlementProfile.companyName} 공동구매 정산서]</h2>
          </div>
        </header>

        <section className="seller-document__meta">
          <div><span>공구기간</span><strong>{salesImport?.salesStartDate ?? campaign?.startDate ?? '-'} ~ {salesImport?.salesEndDate ?? campaign?.endDate ?? '-'}</strong></div>
          <div><span>진행 상품</span><strong>{campaign?.productName ?? '-'}</strong></div>
          <div><span>셀러</span><strong>{campaign?.sellerName ?? '-'}</strong></div>
          <div><span>발행일</span><strong>{issuedAt}</strong></div>
        </section>

        <table className="seller-document__table">
          <thead><tr><th>상품명</th><th>구분</th><th>판매수량</th><th>공구가(VAT 포함)</th><th>매출액(VAT 포함)</th><th>수수료율(VAT 포함)</th><th>수수료</th></tr></thead>
          <tbody>
            {rows.length ? rows.map((row) => (
              <tr key={row.id}>
                <td>{campaign?.productName ?? '-'}</td>
                <td>{row.optionName}</td>
                <td className="amount-cell">{row.netQuantity.toLocaleString('ko-KR')}</td>
                <td className="amount-cell">{money(row.unitPrice)}</td>
                <td className="amount-cell">{money(row.netSales)}</td>
                <td className="amount-cell">{settlement.currentCalculation.sellerCommissionRate}%</td>
                <td className="amount-cell">{money(Math.round(row.netSales * (settlement.currentCalculation.sellerCommissionRate / 100)))}</td>
              </tr>
            )) : <tr><td colSpan={7}>SKU별 판매 데이터가 아직 연결되지 않았습니다.</td></tr>}
          </tbody>
        </table>

        <section className="seller-document__costs"><h3>추가 비용 및 차감</h3><table className="seller-document__table"><tbody>{deductions.length ? deductions.map((item) => <tr key={item.id}><th>{deductionTypeLabel[item.type] ?? item.title}</th><td className="amount-cell">{money(item.amount)}</td><td>{item.reflected ? '정산 반영' : '미반영'}</td></tr>) : <tr><th>개인구매비용</th><td className="amount-cell">0원</td><td>없음</td></tr>}</tbody></table></section>

        <section className="seller-document__totals">
          <div><span>총 판매수량</span><strong>{totalQuantity.toLocaleString('ko-KR')}개</strong></div>
          <div><span>총매출</span><strong>{money(settlement.currentCalculation.grossSales)}</strong></div>
          <div><span>수수료</span><strong>{money(settlement.currentCalculation.sellerCommissionAmount)}</strong></div>
          <div><span>정산금액</span><strong>{money(settlement.currentCalculation.finalSellerPaymentAmount)}</strong></div>
        </section>

        <section className="seller-document__tax">
          <h3>사업자 유형별 정산금액</h3>
          <div className="seller-business-amounts">{businessAmounts.map((item) => <div className={sellerRule?.businessType === item.type || (sellerRule?.businessType === 'general_business' && item.type === 'corporation') ? 'is-active' : ''} key={item.type}><dt>{item.label}<small>{item.evidence}</small></dt><dd>{money(item.finalSellerPaymentAmount)}</dd></div>)}</div>
        </section>

        <section className="seller-document__account"><h3>입금계좌</h3><p className="seller-document__warning">⚠ 지급 계좌가 등록되지 않았습니다.</p></section>

        <footer className="seller-document__footer">
          <h3>정산 안내</h3>
          {companySettlementProfile.settlementNotice && <p>{companySettlementProfile.settlementNotice}</p>}
          <p>회사 정보: {companySettlementProfile.companyName}</p>
          {companySettlementProfile.businessRegistrationNumber && <p>사업자등록번호 {companySettlementProfile.businessRegistrationNumber}</p>}
          {companySettlementProfile.taxInvoiceEmail && <p>세금계산서 이메일 {companySettlementProfile.taxInvoiceEmail}</p>}
          {companySettlementProfile.address && <p>주소 {companySettlementProfile.address}</p>}
          {companySettlementProfile.representative && <p>대표자 {companySettlementProfile.representative}</p>}
          <p>발행일 {issuedAt} · 지급 예정일 {settlement.paymentDueDate}</p>
        </footer>
      </div>
    </div>
  )
}

function SettlementDocumentActions({ onCopyMessage, onCopyText, onPreview, onPrint, onSaveImage }: { onCopyMessage: () => void; onCopyText: () => void; onPreview: () => void; onPrint: () => void; onSaveImage: () => void }) {
  return (
    <div className="action-row seller-document-actions no-print">
      <button className="secondary-button" onClick={onPreview} type="button">이미지 미리보기</button>
      <button className="secondary-button" onClick={onSaveImage} type="button">PNG 저장</button>
      <button className="secondary-button" onClick={onCopyText} type="button">클립보드에 복사</button>
      <button className="secondary-button" onClick={onPrint} type="button">인쇄</button>
      <button className="secondary-button" onClick={onCopyMessage} type="button">전달 문구 복사</button>
    </div>
  )
}

function HistoryContent({ logs, settlement }: { logs: ReturnType<typeof settlementService.getActivityLogsBySettlementId>; settlement: Settlement }) {
  return (
    <div className="preview-text-list">
      {settlement.calculationSteps.map((step) => <p key={step.id}>계산 · {step.order}. {step.label}: {typeof step.result === 'number' ? money(step.result) : step.result}</p>)}
      {logs.map((log) => <p key={log.id}>{formatKoreanDateTime(log.at)} · {actionLabels[log.action]} · {log.previousStatus ? statusLabel(log.previousStatus) : '-'} → {log.nextStatus ? statusLabel(log.nextStatus) : '-'} · v{log.version}</p>)}
    </div>
  )
}

function SettlementStatusActions({ checklistDone, onHistory, onSetDocument, reviewReady, settlement, syncAction }: { checklistDone: boolean; onHistory: () => void; onSetDocument: () => void; reviewReady: boolean; settlement: Settlement; syncAction: (action: () => unknown) => void }) {
  if (settlement.status === 'draft') {
    return <><button className="primary-button" onClick={() => syncAction(() => settlementService.recalculateSettlement(settlement.id))} type="button">계산 실행</button><button className="secondary-button" disabled={!reviewReady} onClick={() => syncAction(() => settlementService.requestReview(settlement.id))} type="button">저장</button></>
  }
  if (settlement.status === 'review_pending') {
    return <><button className="secondary-button" onClick={() => syncAction(() => settlementService.recalculateSettlement(settlement.id, '수정 요청'))} type="button">수정 요청</button><button className="primary-button" disabled={!checklistDone} onClick={() => syncAction(() => settlementService.completeManagerReview(settlement.id))} type="button">매니저 검토 완료</button></>
  }
  if (settlement.status === 'manager_reviewed') {
    return <><button className="secondary-button" onClick={() => syncAction(() => settlementService.updateEvidence(settlement.id, 'confirmed', true, true))} type="button">증빙·계좌 확인</button><button className="primary-button" onClick={() => syncAction(() => settlementService.requestApproval(settlement.id))} type="button">대표 승인 요청</button></>
  }
  if (settlement.status === 'approval_pending') {
    return <><button className="secondary-button" onClick={() => syncAction(() => settlementService.recalculateSettlement(settlement.id, '반려'))} type="button">반려</button><button className="primary-button" onClick={() => syncAction(() => settlementService.approveSettlement(settlement.id))} type="button">대표 승인</button></>
  }
  if (settlement.status === 'approved') {
    return <button className="primary-button" onClick={() => syncAction(() => settlementService.markPaymentReady(settlement.id))} type="button">지급 준비</button>
  }
  if (settlement.status === 'payment_ready') {
    return <><button className="secondary-button" onClick={() => syncAction(() => settlementService.markCompanySettlementCompleted(settlement.id))} type="button">업체 정산 완료</button><button className="secondary-button" onClick={() => syncAction(() => settlementService.markSellerPaymentCompleted(settlement.id))} type="button">셀러 지급 완료</button><button className="primary-button" onClick={() => syncAction(() => settlementService.markManagerPaymentCompleted(settlement.id))} type="button">매니저 지급 완료</button></>
  }
  if (settlement.status === 'completed') {
    return <><button className="primary-button" onClick={onSetDocument} type="button">정산서 보기</button><button className="secondary-button" onClick={onHistory} type="button">이력 보기</button></>
  }
  return <button className="primary-button" onClick={() => syncAction(() => settlementService.recalculateSettlement(settlement.id))} type="button">계산 실행</button>
}

function VersionCompareModal({ versions, onClose }: { versions: SettlementVersion[]; onClose: () => void }) {
  const [before, after] = [versions[1], versions[0]]
  const rows = before && after ? settlementService.compareSettlementVersions(before.id, after.id) : []
  return (
    <div className="settlement-modal-backdrop">
      <section className="settlement-modal">
        <div className="preview-drawer__header"><div><p className="page-eyebrow">Version Compare</p><h2>v{before?.version} / v{after?.version}</h2></div><button className="icon-button" onClick={onClose} type="button">×</button></div>
        <table className="comparison-table">
          <thead><tr><th>항목</th><th>이전</th><th>현재</th><th>변경</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.label}><td>{row.label}</td><td className="amount-cell">{money(row.before)}</td><td className="amount-cell">{money(row.after)}</td><td>{row.changed ? '변경' : '동일'}</td></tr>)}</tbody>
        </table>
      </section>
    </div>
  )
}
