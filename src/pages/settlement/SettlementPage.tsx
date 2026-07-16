import { useState } from 'react'
import { campaignService } from '../../shared/services/campaignService'
import { salesDataService } from '../../shared/services/salesDataService'
import { settlementService } from '../../shared/services/settlementService'
import type { Settlement, SettlementDeduction, SettlementStatus, SettlementVersion } from '../../shared/types/settlement'
import { canMoveToReview, runSettlementAssertions, statusLabel, validateSettlement } from '../../shared/utils/settlement'
import { formatCurrency } from '../../shared/utils/salesData'

type PreviewTab = '내부 검토용 정산서' | '셀러 전달용 정산서' | '계산 로그' | '수정 이력' | '승인 이력'

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

  const dueThisWeek = settlements.filter((item) => item.status !== 'completed').reduce((total, item) => total + item.currentCalculation.finalPaymentAmount + item.currentCalculation.sellerPaymentAmount, 0)
  const sellerDue = settlements.filter((item) => item.status !== 'completed').reduce((total, item) => total + item.currentCalculation.sellerPaymentAmount, 0)
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
                  <th>공동구매</th><th>셀러</th><th>브랜드</th><th>판매 기간</th><th>정산 버전</th><th>총매출</th><th>총수수료</th><th>차감 합계</th><th>회사 잔여 수수료</th><th>매니저 지급액</th><th>회사 귀속액</th><th>셀러 지급액</th><th>증빙 상태</th><th>정산 상태</th><th>정산 담당자</th><th>지급 예정일</th>
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
                      <td className="amount-cell">{money(settlement.currentCalculation.deductionTotal)}</td>
                      <td className="amount-cell">{money(settlement.currentCalculation.netCompanyCommission)}</td>
                      <td className="amount-cell">{money(settlement.currentCalculation.managerAmount)}</td>
                      <td className="amount-cell">{money(settlement.currentCalculation.companyAmount)}</td>
                      <td className="amount-cell">{money(settlement.currentCalculation.sellerPaymentAmount)}</td>
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
  const [activeTab, setActiveTab] = useState<PreviewTab>('내부 검토용 정산서')
  const [compareOpen, setCompareOpen] = useState(false)
  if (!settlement) return null

  const campaign = getCampaign(settlement)
  const deductions = settlementService.getDeductionsBySettlementId(settlement.id)
  const versions = settlementService.getSettlementVersionsBySettlementId(settlement.id)
  const logs = settlementService.getActivityLogsBySettlementId(settlement.id)
  const validation = validateSettlement(settlement)
  const salesImport = salesDataService.getSalesDataImportById(settlement.salesDataImportId)
  const salesDataConfirmed = salesImport?.reviewStatus === '확정 완료'
  const reviewReady = canMoveToReview(settlement, salesDataConfirmed)
  const checklistDone = Object.values(settlement.reviewChecklist).every(Boolean)

  const syncAction = (action: () => unknown) => {
    action()
    onSync()
  }

  const copySummary = async () => {
    const summary = `${campaign?.campaignName ?? settlement.campaignId} 정산 요약: 총매출 ${money(settlement.currentCalculation.grossSales)}, 총수수료 ${money(settlement.currentCalculation.grossCommission)}, 매니저 지급액 ${money(settlement.currentCalculation.managerAmount)}, 회사 귀속액 ${money(settlement.currentCalculation.companyAmount)}, 셀러 지급액 ${money(settlement.currentCalculation.sellerPaymentAmount)}`
    await navigator.clipboard?.writeText(summary)
  }

  return (
    <div className="drawer-backdrop">
      <aside className="preview-drawer settlement-drawer" onClick={(event) => event.stopPropagation()}>
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

        <section className="settlement-summary-grid">
          <Summary label="정산 상태" value={statusLabel(settlement.status)} />
          <Summary label="버전" value={`v${settlement.settlementVersion}`} />
          <Summary label="총매출" value={money(settlement.currentCalculation.grossSales)} amount />
          <Summary label="총수수료" value={money(settlement.currentCalculation.grossCommission)} amount />
          <Summary label="차감 합계" value={money(settlement.currentCalculation.deductionTotal)} amount />
          <Summary label="회사 잔여 수수료" value={money(settlement.currentCalculation.netCompanyCommission)} amount />
          <Summary label="매니저 지급액" value={money(settlement.currentCalculation.managerAmount)} amount />
          <Summary label="회사 귀속액" value={money(settlement.currentCalculation.companyAmount)} amount />
          <Summary label="셀러 지급액" value={money(settlement.currentCalculation.sellerPaymentAmount)} amount />
          <Summary label="증빙 상태" value={settlement.evidenceStatus === 'confirmed' ? '확인 완료' : '미확인'} />
          <Summary label="지급 상태" value={settlement.status === 'completed' ? '완료' : settlement.status === 'payment_ready' ? '지급 준비' : '대기'} />
          <Summary label="세무 유형" value={settlement.taxType === 'tax_invoice' ? '세금계산서' : settlement.taxType === 'cash_receipt' ? '현금영수증' : '3.3% 원천징수'} />
        </section>

        <section className="detail-card settlement-card">
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
        </section>

        <section className="detail-card settlement-card">
          <div className="checklist-head">
            <div><h3>차감 항목</h3><p>브랜드사 부담 비용은 기록만 유지하고 계산에는 반영하지 않습니다.</p></div>
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
        </section>

        <section className="detail-card settlement-card">
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
        </section>

        <section className="detail-card settlement-card">
          <div className="checklist-head">
            <div><h3>정산서 미리보기</h3><p>실제 PDF·엑셀 생성 없이 화면 미리보기와 요약 복사만 제공합니다.</p></div>
            <button className="secondary-button" onClick={copySummary} type="button">요약 복사</button>
          </div>
          <div className="view-tabs settlement-preview-tabs">
            {(['내부 검토용 정산서', '셀러 전달용 정산서', '계산 로그', '수정 이력', '승인 이력'] as PreviewTab[]).map((tab) => (
              <button className={activeTab === tab ? 'view-tab is-active' : 'view-tab'} key={tab} onClick={() => setActiveTab(tab)} type="button">{tab}</button>
            ))}
          </div>
          <PreviewContent activeTab={activeTab} settlement={settlement} logs={logs} />
        </section>

        <section className="detail-card settlement-card">
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
        </section>

        <div className="preview-drawer__actions">
          <button className="secondary-button" onClick={() => syncAction(() => settlementService.recalculateSettlement(settlement.id))} type="button">계산 실행</button>
          <button className="secondary-button" disabled={!reviewReady} onClick={() => syncAction(() => settlementService.requestReview(settlement.id))} type="button">매니저 검토 요청</button>
          <button className="secondary-button" disabled={!checklistDone} onClick={() => syncAction(() => settlementService.completeManagerReview(settlement.id))} type="button">매니저 검토 완료</button>
          <button className="secondary-button" onClick={() => syncAction(() => settlementService.updateEvidence(settlement.id, 'confirmed', true, true))} type="button">증빙·계좌 확인</button>
          <button className="secondary-button" onClick={() => syncAction(() => settlementService.requestApproval(settlement.id))} type="button">대표 승인 요청</button>
          <button className="secondary-button" onClick={() => syncAction(() => settlementService.approveSettlement(settlement.id))} type="button">대표 승인</button>
          <button className="secondary-button" onClick={() => syncAction(() => settlementService.markPaymentReady(settlement.id))} type="button">지급 준비</button>
          <button className="secondary-button" onClick={() => syncAction(() => settlementService.markCompanySettlementCompleted(settlement.id))} type="button">업체 정산 완료</button>
          <button className="secondary-button" onClick={() => syncAction(() => settlementService.markSellerPaymentCompleted(settlement.id))} type="button">셀러 지급 완료</button>
          <button className="primary-button" onClick={() => syncAction(() => settlementService.markManagerPaymentCompleted(settlement.id))} type="button">매니저 지급 완료</button>
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
    net_company_commission: '회사 잔여 수수료 차감',
    seller_payment: '셀러 지급액 차감',
    manager_payment: '매니저 지급액 차감',
    record_only: '기록만 유지',
    needs_review: '확인 필요',
  }
  return labels[location]
}

function PreviewContent({ activeTab, settlement, logs }: { activeTab: PreviewTab; settlement: Settlement; logs: ReturnType<typeof settlementService.getActivityLogsBySettlementId> }) {
  const showInternal = activeTab === '내부 검토용 정산서'
  if (activeTab === '계산 로그') return <div className="preview-text-list">{settlement.calculationSteps.map((step) => <p key={step.id}>{step.order}. {step.label}: {typeof step.result === 'number' ? money(step.result) : step.result}</p>)}</div>
  if (activeTab === '수정 이력') return <div className="preview-text-list">{logs.filter((log) => log.action.includes('deduction') || log.action.includes('revision')).map((log) => <p key={log.id}>{log.at} · {actionLabels[log.action]} · v{log.version} · {log.reason}</p>)}</div>
  if (activeTab === '승인 이력') return <div className="preview-text-list">{logs.filter((log) => ['manager_review_requested', 'manager_review_completed', 'approval_requested', 'approved', 'payment_ready', 'completed'].includes(log.action)).map((log) => <p key={log.id}>{log.at} · {actionLabels[log.action]} · {log.previousStatus ? statusLabel(log.previousStatus) : '-'} → {log.nextStatus ? statusLabel(log.nextStatus) : '-'}</p>)}</div>
  return (
    <div className="settlement-preview">
      <p>총매출 {money(settlement.currentCalculation.grossSales)} / 총수수료 {money(settlement.currentCalculation.grossCommission)}</p>
      <p>셀러 지급액 {money(settlement.currentCalculation.sellerPaymentAmount)}</p>
      {showInternal && <p>매니저 지급액 {money(settlement.currentCalculation.managerAmount)} / 회사 귀속액 {money(settlement.currentCalculation.companyAmount)}</p>}
      {!showInternal && <p>내부 회사 배분정보 숨김</p>}
      <p>세금 {money(settlement.currentCalculation.taxAmount)} / 실지급액 {money(settlement.currentCalculation.finalPaymentAmount)}</p>
    </div>
  )
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
