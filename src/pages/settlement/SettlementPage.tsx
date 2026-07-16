import { useRef, useState, type RefObject } from 'react'
import { campaignService } from '../../shared/services/campaignService'
import { salesDataService } from '../../shared/services/salesDataService'
import { sampleService } from '../../shared/services/sampleService'
import { settlementService } from '../../shared/services/settlementService'
import type { SampleRequest } from '../../features/samples/types'
import type { SalesDataRow } from '../../shared/types/salesData'
import type { Settlement, SettlementDeduction, SettlementStatus, SettlementVersion } from '../../shared/types/settlement'
import { canMoveToReview, runSettlementAssertions, statusLabel, validateSettlement } from '../../shared/utils/settlement'
import { formatCurrency } from '../../shared/utils/salesData'

type DocumentMode = '내부 검토용' | '셀러 전달용'
type DetailTab = '요약' | '계산 과정' | '차감 내역' | '세무·증빙' | '검토·승인' | '정산서' | '이력'

const detailTabs: DetailTab[] = ['요약', '계산 과정', '차감 내역', '세무·증빙', '검토·승인', '정산서', '이력']

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

export function SettlementPage({ initialSettlementId }: { initialSettlementId?: string | null }) {
  const [settlements, setSettlements] = useState(() => settlementService.getSettlements())
  const [selectedSettlementId, setSelectedSettlementId] = useState<string | null>(initialSettlementId ?? null)
  const [quick, setQuick] = useState<SettlementStatus | 'all'>('all')

  const sync = () => setSettlements(settlementService.getSettlements())
  const selectedSettlement = settlements.find((item) => item.id === selectedSettlementId) ?? null
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
    if (created) setSelectedSettlementId(created.id)
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
                    <tr key={settlement.id} onClick={() => setSelectedSettlementId(settlement.id)}>
                      <td><strong>{campaign?.campaignName ?? settlement.campaignId}</strong><span>{campaign?.campaignCode}</span></td>
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
        </div>
      </section>

      <SettlementDrawer settlement={selectedSettlement} onClose={() => setSelectedSettlementId(null)} onSync={sync} />
    </section>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return <div className={`settlement-money-kpi ${tone ? `settlement-money-kpi--${tone}` : ''}`}><span>{label}</span><strong>{value}</strong></div>
}

export function SettlementDrawer({ settlement, onClose, onSync }: { settlement: Settlement | null; onClose: () => void; onSync: () => void }) {
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTab>('요약')
  const [documentMode, setDocumentMode] = useState<DocumentMode>('셀러 전달용')
  const [documentNotice, setDocumentNotice] = useState('')
  const [compareOpen, setCompareOpen] = useState(false)
  const sellerDocumentRef = useRef<HTMLDivElement | null>(null)
  if (!settlement) return null

  const campaign = getCampaign(settlement)
  const deductions = settlementService.getDeductionsBySettlementId(settlement.id)
  const versions = settlementService.getSettlementVersionsBySettlementId(settlement.id)
  const logs = settlementService.getActivityLogsBySettlementId(settlement.id)
  const samples = sampleService.getSamplesByCampaignId(settlement.campaignId)
  const validation = validateSettlement(settlement)
  const salesImport = salesDataService.getSalesDataImportById(settlement.salesDataImportId)
  const salesRows = salesDataService.getRowsByImportId(settlement.salesDataImportId)
  const salesDataConfirmed = salesImport?.reviewStatus === '확정 완료'
  const reviewReady = canMoveToReview(settlement, salesDataConfirmed)
  const checklistDone = Object.values(settlement.reviewChecklist).every(Boolean)

  const syncAction = (action: () => unknown) => {
    action()
    onSync()
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
    <div className="drawer-backdrop">
      <aside className="preview-drawer settlement-drawer settlement-detail-modal" onClick={(event) => event.stopPropagation()}>
        <div className="preview-drawer__header">
          <div>
            <p className="page-eyebrow">Settlement Detail</p>
            <h2>{campaign?.campaignName ?? settlement.campaignId}</h2>
          </div>
          <button className="icon-button" onClick={onClose} type="button">×</button>
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

        <section className="settlement-top-meta">
          <Summary label="공동구매명" value={campaign?.campaignName ?? settlement.campaignId} />
          <Summary label="셀러" value={campaign?.sellerName ?? '-'} />
          <Summary label="브랜드" value={campaign?.brandName ?? '-'} />
          <Summary label="판매 기간" value={`${salesImport?.salesStartDate || '-'} ~ ${salesImport?.salesEndDate || '-'}`} />
          <Summary label="정산 상태" value={statusLabel(settlement.status)} />
          <Summary label="버전" value={`v${settlement.settlementVersion}`} />
          <Summary label="정산 담당자" value={settlement.assigneeName} />
        </section>

        <section className="settlement-summary-grid settlement-summary-grid--primary">
          <Summary label="총매출" value={money(settlement.currentCalculation.grossSales)} amount />
          <Summary label="총수수료" value={money(settlement.currentCalculation.grossCommission)} amount />
          <Summary label="셀러 지급액" value={money(settlement.currentCalculation.finalSellerPaymentAmount)} amount />
          <Summary label="벤더 수수료" value={money(settlement.currentCalculation.vendorCommission)} amount />
          <Summary label="최종 배분 대상 금액" value={money(settlement.currentCalculation.distributableVendorCommission)} amount />
          <Summary label="매니저 지급액" value={money(settlement.currentCalculation.managerAmount)} amount />
          <Summary label="회사 귀속액" value={money(settlement.currentCalculation.companyAmount)} amount />
        </section>

        <div className="view-tabs settlement-detail-tabs">
          {detailTabs.map((tab) => (
            <button className={activeDetailTab === tab ? 'view-tab is-active' : 'view-tab'} key={tab} onClick={() => setActiveDetailTab(tab)} type="button">{tab}</button>
          ))}
        </div>

        {activeDetailTab === '요약' && (
          <section className="detail-card settlement-card">
            <div className="checklist-head">
              <div><h3>정산 요약</h3><p>핵심 금액과 현재 처리 상태만 표시합니다.</p></div>
              <Badge label={statusLabel(settlement.status)} tone={statusTone[settlement.status]} />
            </div>
            <div className="settlement-summary-grid">
              <Summary label="정산 상태" value={statusLabel(settlement.status)} />
              <Summary label="버전" value={`v${settlement.settlementVersion}`} />
              <Summary label="총수수료율" value={`${settlement.currentCalculation.totalCommissionRate}%`} />
              <Summary label="셀러 수수료율" value={`${settlement.currentCalculation.sellerCommissionRate}%`} />
              <Summary label="셀러 수수료" value={money(settlement.currentCalculation.sellerCommissionAmount)} amount />
              <Summary label="차감 합계" value={money(settlement.currentCalculation.deductionTotal)} amount />
              <Summary label="지급 상태" value={settlement.status === 'completed' ? '완료' : settlement.status === 'payment_ready' ? '지급 준비' : '대기'} />
            </div>
          </section>
        )}

        {activeDetailTab === '계산 과정' && <section className="detail-card settlement-card">
          <div className="checklist-head">
            <div><h3>계산 과정</h3><p>각 단계의 입력값, 공식, 출처, 수정 여부, 계산 시간을 표시합니다.</p></div>
          </div>
          <div className="calculation-timeline">
            {settlement.calculationSteps.map((step) => (
              <article className="calculation-step" key={step.id}>
                <div className="calculation-step__index">{step.order}</div>
                <div>
                  <div className="calculation-step__head"><strong>{step.label}</strong><span>{step.calculatedAt}</span></div>
                  <p className="calculation-result">{typeof step.result === 'number' ? money(step.result) : step.result}</p>
                  <dl>
                    <div><dt>입력값</dt><dd>{step.inputValues.length ? step.inputValues.join(' / ') : '-'}</dd></div>
                    <div><dt>공식</dt><dd>{step.formula}</dd></div>
                    <div><dt>값의 출처</dt><dd>{step.source}</dd></div>
                    <div><dt>수정 여부</dt><dd>{step.modified ? '담당자 수정' : '자동 계산'}</dd></div>
                  </dl>
                </div>
              </article>
            ))}
          </div>
        </section>}

        {activeDetailTab === '차감 내역' && <section className="detail-card settlement-card">
          <div className="checklist-head">
            <div><h3>차감 내역</h3><p>샘플비는 제안서가 아닌 Sample 관리의 실제값만 반영합니다.</p></div>
          </div>
          <div className="comparison-table-wrap">
            <table className="comparison-table deduction-table">
              <thead><tr><th>유형</th><th>항목명</th><th>금액</th><th>부담자</th><th>연결 데이터</th><th>증빙</th><th>반영 위치</th><th>반영</th><th>메모</th></tr></thead>
              <tbody>
                {deductions.map((item) => (
                  <tr key={item.id}>
                    <td>{item.type}</td><td>{item.title}</td><td className="amount-cell">{money(item.amount)}</td><td>{item.costOwner}</td><td>{item.linkedData}</td><td>{item.evidenceStatus}</td><td>{applyLocationLabel(item.applyLocation)}</td><td>{item.reflected ? '반영' : '제외'}</td><td>{item.memo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <SampleDeductionDetails deductions={deductions} samples={samples} />
        </section>}

        {activeDetailTab === '세무·증빙' && <section className="detail-card settlement-card">
          <div className="checklist-head">
            <div><h3>세무·증빙</h3><p>세무 유형, 증빙 상태, 브랜드사 세금계산서 금액을 확인합니다.</p></div>
            <button className="secondary-button" onClick={() => syncAction(() => settlementService.updateEvidence(settlement.id, 'confirmed', true, true))} type="button">증빙·계좌 확인</button>
          </div>
          <div className="settlement-summary-grid">
            <Summary label="세무 유형" value={settlement.taxType === 'tax_invoice' ? '세금계산서' : settlement.taxType === 'cash_receipt' ? '현금영수증' : '3.3% 원천징수'} />
            <Summary label="증빙 상태" value={settlement.evidenceStatus === 'confirmed' ? '확인 완료' : '미확인'} />
            <Summary label="계좌 확인" value={settlement.accountConfirmed ? '확인 완료' : '미확인'} />
            <Summary label="적용 세금" value={money(settlement.currentCalculation.taxAmount)} amount />
            {campaign?.linkOwner === '브랜드사' && <Summary label="브랜드사 세금계산서 발행 금액" value={money(settlement.currentCalculation.grossCommission)} amount />}
          </div>
        </section>}

        {activeDetailTab === '검토·승인' && <section className="detail-card settlement-card">
          <div className="checklist-head">
            <div><h3>검토 체크리스트</h3><p>모든 필수 항목이 완료되어야 매니저 검토 완료가 가능합니다.</p></div>
            <strong>{Object.values(settlement.reviewChecklist).filter(Boolean).length}/10</strong>
          </div>
          <div className="settlement-checklist">
            {Object.entries(checklistLabels).map(([key, label]) => (
              <label className="checklist-item" key={key}>
                <input checked={settlement.reviewChecklist[key as keyof typeof settlement.reviewChecklist]} onChange={(event) => {
                  settlementService.updateReviewChecklist(settlement.id, { ...settlement.reviewChecklist, [key]: event.target.checked })
                  onSync()
                }} type="checkbox" />
                {label}
              </label>
            ))}
          </div>
          <div className="settlement-preview">
            <p>승인 상태: {statusLabel(settlement.status)} / 증빙: {settlement.evidenceStatus === 'confirmed' ? '확인 완료' : '미확인'}</p>
            <p>매니저 지급액 {money(settlement.currentCalculation.managerAmount)} / 회사 귀속액 {money(settlement.currentCalculation.companyAmount)}</p>
          </div>
        </section>}

        {activeDetailTab === '정산서' && <section className="detail-card settlement-card settlement-document-tab">
          <div className="checklist-head">
            <div><h3>정산서</h3><p>내부 검토용과 셀러 전달용 정산서를 분리해서 확인합니다.</p></div>
            <div className="action-row settlement-document-actions">
              <button className="secondary-button" onClick={() => setDocumentMode('내부 검토용')} type="button">내부 검토용</button>
              <button className="secondary-button" onClick={() => setDocumentMode('셀러 전달용')} type="button">셀러 전달용</button>
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
              <SellerSettlementDocument campaignName={campaign?.campaignName ?? settlement.campaignId} rows={salesRows} sellerDocumentRef={sellerDocumentRef} settlement={settlement} />
            </>
          )}
        </section>}

        {activeDetailTab === '이력' && <section className="detail-card settlement-card">
          <div className="checklist-head">
            <div><h3>수정·활동 이력</h3><p>계산, 수정, 검토, 승인, 지급 이력을 확인합니다.</p></div>
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
                <span>{version.changedAt} · {version.changedBy}</span>
                <p>{version.reason}</p>
                <dl><div><dt>변경 전</dt><dd>{money(version.beforeAmount)}</dd></div><div><dt>변경 후</dt><dd>{money(version.afterAmount)}</dd></div><div><dt>승인 상태</dt><dd>{statusLabel(version.status)}</dd></div></dl>
              </article>
            ))}
          </div>
        </section>}

        <div className="preview-drawer__actions">
          <SettlementStatusActions
            checklistDone={checklistDone}
            onHistory={() => setActiveDetailTab('이력')}
            onSetDocument={() => setActiveDetailTab('정산서')}
            reviewReady={reviewReady}
            settlement={settlement}
            syncAction={syncAction}
          />
        </div>

        {compareOpen && <VersionCompareModal versions={versions} onClose={() => setCompareOpen(false)} />}
      </aside>
    </div>
  )
}

function Summary({ label, value, amount }: { label: string; value: string; amount?: boolean }) {
  return <div className="settlement-summary-item"><span>{label}</span><strong className={amount ? 'amount-cell' : ''}>{value}</strong></div>
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

function applyLocationLabel(location: SettlementDeduction['applyLocation']) {
  const labels: Record<SettlementDeduction['applyLocation'], string> = {
    net_company_commission: '최종 배분 대상 금액 차감',
    seller_payment: '셀러 지급액 차감',
    manager_payment: '매니저 지급액 차감',
    record_only: '기록만 유지',
    needs_review: '확인 필요',
  }
  return labels[location]
}

function SampleDeductionDetails({ deductions, samples }: { deductions: SettlementDeduction[]; samples: SampleRequest[] }) {
  const sampleDeductions = deductions.filter((item) => item.type === 'sample' && item.linkedData.startsWith('sample:'))
  if (!sampleDeductions.length) return <div className="empty-state"><strong>반영 대상 샘플비가 없습니다.</strong><span>실제 발주된 유상 Sample 확정값만 표시됩니다.</span></div>

  return (
    <div className="sample-deduction-list">
      {sampleDeductions.map((deduction) => {
        const sampleId = deduction.linkedData.replace('sample:', '')
        const sample = samples.find((item) => item.id === sampleId)
        const unitPrice = sample?.unitPrice ?? sample?.sampleCost ?? 0
        const sampleCost = sample ? unitPrice * sample.quantity : deduction.amount
        const shippingCost = sample?.shippingCost ?? 0
        const totalCost = sampleCost + shippingCost
        const proposalWarning = sample ? getProposalSampleWarning(sample, unitPrice, totalCost) : null
        return (
          <article className="sample-deduction-card" key={deduction.id}>
            <div className="checklist-head">
              <div>
                <h4>{sample?.productName ?? deduction.title}</h4>
                <p>{sample?.optionName ?? 'Sample 원본 확인 필요'}</p>
              </div>
              <Badge label={deduction.reflected ? '정산 반영' : '기록만 유지'} tone={deduction.reflected ? 'complete' : 'muted'} />
            </div>
            <dl>
              <div><dt>수량</dt><dd>{sample?.quantity.toLocaleString('ko-KR') ?? '-'}개</dd></div>
              <div><dt>단가</dt><dd className="amount-cell">{money(unitPrice)}</dd></div>
              <div><dt>샘플비</dt><dd className="amount-cell">{money(sampleCost)}</dd></div>
              <div><dt>배송비</dt><dd className="amount-cell">{money(shippingCost)}</dd></div>
              <div><dt>총비용</dt><dd className="amount-cell">{money(totalCost)}</dd></div>
              <div><dt>비용 부담자</dt><dd>{sample?.costOwner ?? deduction.costOwner}</dd></div>
              <div><dt>발주 상태</dt><dd>{sample?.orderStatus ?? sample?.status ?? '-'}</dd></div>
              <div><dt>수령 상태</dt><dd>{sample?.deliveryStatus ?? '-'}</dd></div>
              <div><dt>정산 반영 상태</dt><dd>{sample?.settlementReflected ? `완료 (${sample.settlementId ?? deduction.settlementId})` : '대기'}</dd></div>
              <div><dt>원본 Sample 바로가기</dt><dd>{sample?.id ?? deduction.linkedData}</dd></div>
            </dl>
            {sample && sample.quantity === 2 && unitPrice === 56_000 && totalCost === 112_000 && (
              <p className="mock-notice">회사 부담 유상 샘플 56,000원 × 2개가 실제 Sample 값으로 반영되었습니다.</p>
            )}
            {proposalWarning && <p className="settlement-warning-text">{proposalWarning}</p>}
          </article>
        )
      })}
    </div>
  )
}

function getProposalSampleWarning(sample: SampleRequest, actualUnitPrice: number, actualTotal: number) {
  const hasExpected = sample.proposalExpectedQuantity !== undefined || sample.proposalExpectedUnitPrice !== undefined || sample.proposalExpectedCostOwner !== undefined || sample.proposalExpectedTotalAmount !== undefined
  if (!hasExpected) return null
  const differs =
    (sample.proposalExpectedQuantity !== undefined && sample.proposalExpectedQuantity !== sample.quantity) ||
    (sample.proposalExpectedUnitPrice !== undefined && sample.proposalExpectedUnitPrice !== actualUnitPrice) ||
    (sample.proposalExpectedCostOwner !== undefined && sample.proposalExpectedCostOwner !== sample.costOwner) ||
    (sample.proposalExpectedTotalAmount !== undefined && sample.proposalExpectedTotalAmount !== actualTotal)
  return differs ? '제안서 예상값과 실제 샘플 비용이 다릅니다.' : null
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

function SellerSettlementDocument({ campaignName, rows, sellerDocumentRef, settlement }: { campaignName: string; rows: SalesDataRow[]; sellerDocumentRef: RefObject<HTMLDivElement | null>; settlement: Settlement }) {
  const campaign = getCampaign(settlement)
  const totalQuantity = rows.reduce((total, row) => total + row.netQuantity, 0)
  const evidenceLabel = settlement.taxType === 'tax_invoice' ? '세금계산서 발행금액' : settlement.taxType === 'cash_receipt' ? '현금영수증 발행금액' : '최종 지급액'

  return (
    <div className="seller-document-shell">
      <div className="seller-document" ref={sellerDocumentRef}>
        <header className="seller-document__header">
          <div className="seller-document__logo">T3</div>
          <div>
            <h2>{campaign?.sellerName ?? '셀러'} 공동구매 정산서</h2>
            <p>발행일 {new Date().toISOString().slice(0, 10)}</p>
          </div>
        </header>

        <section className="seller-document__meta">
          <div><span>공동구매명</span><strong>{campaignName}</strong></div>
          <div><span>공급 기간</span><strong>{campaign?.startDate ?? '-'} ~ {campaign?.endDate ?? '-'}</strong></div>
          <div><span>진행 상품</span><strong>{campaign?.productName ?? '-'}</strong></div>
          <div><span>셀러명</span><strong>{campaign?.sellerName ?? '-'}</strong></div>
        </section>

        <table className="seller-document__table">
          <thead><tr><th>상품명</th><th>옵션</th><th>판매수량</th><th>판매가</th><th>매출액</th><th>수수료율</th><th>셀러 수수료</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{campaign?.productName ?? '-'}</td>
                <td>{row.optionName}</td>
                <td className="amount-cell">{row.netQuantity.toLocaleString('ko-KR')}</td>
                <td className="amount-cell">{money(row.unitPrice)}</td>
                <td className="amount-cell">{money(row.grossSales)}</td>
                <td className="amount-cell">{settlement.currentCalculation.sellerCommissionRate}%</td>
                <td className="amount-cell">{money(Math.round(row.grossSales * (settlement.currentCalculation.sellerCommissionRate / 100)))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="seller-document__totals">
          <div><span>총 판매수량</span><strong>{totalQuantity.toLocaleString('ko-KR')}개</strong></div>
          <div><span>총매출</span><strong>{money(settlement.currentCalculation.grossSales)}</strong></div>
          <div><span>셀러 수수료율</span><strong>{settlement.currentCalculation.sellerCommissionRate}%</strong></div>
          <div><span>셀러 정산금액</span><strong>{money(settlement.currentCalculation.finalSellerPaymentAmount)}</strong></div>
        </section>

        <section className="seller-document__tax">
          <h3>세무·증빙</h3>
          {settlement.taxType === 'withholding_3_3' ? (
            <dl>
              <div><dt>정산금액</dt><dd>{money(settlement.currentCalculation.sellerCommissionAmount)}</dd></div>
              <div><dt>3.3% 원천징수액</dt><dd>{money(settlement.currentCalculation.taxAmount)}</dd></div>
              <div><dt>{evidenceLabel}</dt><dd>{money(settlement.currentCalculation.finalSellerPaymentAmount)}</dd></div>
            </dl>
          ) : (
            <dl>
              <div><dt>{evidenceLabel}</dt><dd>{money(settlement.currentCalculation.finalSellerPaymentAmount)}</dd></div>
              <div><dt>증빙 요청 안내</dt><dd>정산 확인 후 증빙 발행을 요청드립니다.</dd></div>
            </dl>
          )}
        </section>

        <footer className="seller-document__footer">
          <p>입금 계좌: ****-***-****** (확인 후 별도 안내)</p>
          <p>지급 예정일: {settlement.paymentDueDate}</p>
          <p>T3 Company · 사업자등록번호 000-00-00000 · 대표자 이현지 · settlement@t3.company</p>
          <p>본 정산서는 셀러 전달용으로 내부 벤더 수수료, 매니저 지급액, 회사 귀속액을 표시하지 않습니다.</p>
        </footer>
      </div>
    </div>
  )
}

function SettlementDocumentActions({ onCopyMessage, onCopyText, onPreview, onPrint, onSaveImage }: { onCopyMessage: () => void; onCopyText: () => void; onPreview: () => void; onPrint: () => void; onSaveImage: () => void }) {
  return (
    <div className="action-row seller-document-actions no-print">
      <button className="secondary-button" onClick={onPreview} type="button">이미지 미리보기</button>
      <button className="primary-button" onClick={onSaveImage} type="button">이미지로 저장</button>
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
      {logs.map((log) => <p key={log.id}>{log.at} · {actionLabels[log.action]} · {log.previousStatus ? statusLabel(log.previousStatus) : '-'} → {log.nextStatus ? statusLabel(log.nextStatus) : '-'} · v{log.version}</p>)}
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
