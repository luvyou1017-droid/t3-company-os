import { useMemo, useRef, useState } from 'react'
import { campaignService } from '../../shared/services/campaignService'
import { salesDataService } from '../../shared/services/salesDataService'
import type { Campaign } from '../../shared/types/campaign'
import type { SalesDataImport, SalesDataRow, SalesReviewStatus, SalesSettlementStatus } from '../../shared/types/salesData'
import { buildSalesAnalysis, calculateSalesRow, calculateSalesTotals, formatCurrency, formatFileSize } from '../../shared/utils/salesData'

type SalesQuickFilter = '전체' | '오늘 수신' | '업로드 대기' | '검수 대기' | '오류 확인 필요' | '확정 완료' | '정산 대기'

const quickFilters: Array<Exclude<SalesQuickFilter, '전체'>> = ['오늘 수신', '업로드 대기', '검수 대기', '오류 확인 필요', '확정 완료', '정산 대기']

const reviewTone: Record<SalesReviewStatus, string> = {
  '업로드 대기': 'muted',
  '업로드 완료': 'progress',
  '검수 중': 'progress',
  '오류 확인 필요': 'danger',
  '확정 완료': 'complete',
}

const settlementTone: Record<SalesSettlementStatus, string> = {
  '정산 전': 'muted',
  '정산 가능': 'settlement',
  '정산 생성됨': 'settlement',
  '정산 완료': 'complete',
}

function getImportCampaign(salesImport: SalesDataImport) {
  return campaignService.getCampaignById(salesImport.campaignId)
}

function matchesQuick(salesImport: SalesDataImport, quick: SalesQuickFilter) {
  if (quick === '전체') return true
  if (quick === '오늘 수신') return salesImport.uploadedAt.startsWith('2026-07-16')
  if (quick === '검수 대기') return salesImport.reviewStatus === '업로드 완료' || salesImport.reviewStatus === '검수 중'
  if (quick === '정산 대기') return salesImport.settlementStatus === '정산 가능'
  return salesImport.reviewStatus === quick
}

function makeMockRows(salesImport: SalesDataImport, campaign?: Campaign): SalesDataRow[] {
  const baseName = campaign?.options?.[0] ?? '기본'
  const secondName = campaign?.options?.[1] ?? '추가 옵션'
  return [
    calculateSalesRow({ id: crypto.randomUUID(), salesDataImportId: salesImport.id, campaignId: salesImport.campaignId, optionName: baseName, quantity: 32, unitPrice: 19_900, canceledQuantity: 1, refundedQuantity: 0 }),
    calculateSalesRow({ id: crypto.randomUUID(), salesDataImportId: salesImport.id, campaignId: salesImport.campaignId, optionName: secondName, quantity: 21, unitPrice: 19_900, canceledQuantity: 0, refundedQuantity: 1 }),
  ]
}

function StatusBadge({ label, tone }: { label: string; tone: string }) {
  return <span className={`campaign-status campaign-status--${tone}`}>{label}</span>
}

export function SalesDataPage({ initialImportId }: { initialImportId?: string | null }) {
  const [imports, setImports] = useState(() => salesDataService.getSalesDataImports())
  const [rows, setRows] = useState(() => salesDataService.getSalesDataRows())
  const [quick, setQuick] = useState<SalesQuickFilter>('전체')
  const [selectedImportId, setSelectedImportId] = useState<string | null>(initialImportId ?? null)
  const [manualTarget, setManualTarget] = useState<SalesDataImport | null>(null)

  const sync = () => {
    setImports(salesDataService.getSalesDataImports())
    setRows(salesDataService.getSalesDataRows())
  }

  const selectedImport = imports.find((item) => item.id === selectedImportId) ?? null

  const counts = useMemo<Record<Exclude<SalesQuickFilter, '전체'>, number>>(() => ({
    '오늘 수신': imports.filter((item) => matchesQuick(item, '오늘 수신')).length,
    '업로드 대기': imports.filter((item) => item.reviewStatus === '업로드 대기').length,
    '검수 대기': imports.filter((item) => matchesQuick(item, '검수 대기')).length,
    '오류 확인 필요': imports.filter((item) => item.reviewStatus === '오류 확인 필요').length,
    '확정 완료': imports.filter((item) => item.reviewStatus === '확정 완료').length,
    '정산 대기': imports.filter((item) => item.settlementStatus === '정산 가능').length,
  }), [imports])

  const filteredImports = useMemo(() => imports.filter((item) => matchesQuick(item, quick)), [imports, quick])

  return (
    <section className="campaign-schedule-page sales-data-page">
      <section className="schedule-summary">
        <div className="schedule-summary__title">
          <div>
            <p className="page-eyebrow">Sales Data</p>
            <h2>판매 데이터</h2>
          </div>
        </div>
        <div className="schedule-summary__grid">
          {quickFilters.map((filter) => (
            <button className={quick === filter ? 'summary-count-card is-active' : 'summary-count-card'} key={filter} onClick={() => setQuick(quick === filter ? '전체' : filter)} type="button">
              <span>{filter}</span>
              <strong>{counts[filter]}</strong>
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel__header">
          <div>
            <h2>판매 데이터 목록</h2>
            <p>브랜드사 판매 파일과 수기 입력 데이터를 검수하고 정산 가능 상태로 확정합니다.</p>
          </div>
          <strong className="result-count">{filteredImports.length}건</strong>
        </div>
        <div className="schedule-panel__body">
          <div className="schedule-table-wrap sales-data-table-wrap">
            <table className="schedule-table sales-data-table">
              <thead>
                <tr><th>공동구매</th><th>셀러</th><th>브랜드</th><th>상품</th><th>판매 기간</th><th>데이터 출처</th><th>파일명</th><th>업로드일</th><th>판매수량</th><th>총매출</th><th>검수 상태</th><th>정산 상태</th><th>담당자</th></tr>
              </thead>
              <tbody>
                {filteredImports.map((salesImport) => {
                  const campaign = getImportCampaign(salesImport)
                  return (
                    <tr key={salesImport.id} onClick={() => setSelectedImportId(salesImport.id)}>
                      <td><strong>{campaign?.campaignName ?? salesImport.campaignId}</strong><span>{campaign?.campaignCode}</span></td>
                      <td>{campaign?.sellerName ?? '-'}</td>
                      <td>{campaign?.brandName ?? '-'}</td>
                      <td>{campaign?.productName ?? '-'}</td>
                      <td>{salesImport.salesStartDate || '-'} ~ {salesImport.salesEndDate || '-'}</td>
                      <td>{salesImport.sourceType}</td>
                      <td>{salesImport.fileName || '수신 대기'}</td>
                      <td>{salesImport.uploadedAt || '-'}</td>
                      <td>{salesImport.totalQuantity.toLocaleString('ko-KR')}</td>
                      <td>{formatCurrency(salesImport.totalSalesAmount)}</td>
                      <td><StatusBadge label={salesImport.reviewStatus} tone={reviewTone[salesImport.reviewStatus]} /></td>
                      <td><StatusBadge label={salesImport.settlementStatus} tone={settlementTone[salesImport.settlementStatus]} /></td>
                      <td>{salesImport.reviewerName ?? '-'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="schedule-mobile-list">
            {filteredImports.map((salesImport) => {
              const campaign = getImportCampaign(salesImport)
              return (
                <button className="schedule-mobile-card" key={salesImport.id} onClick={() => setSelectedImportId(salesImport.id)} type="button">
                  <div className="schedule-mobile-card__top"><strong>{campaign?.campaignName}</strong><StatusBadge label={salesImport.reviewStatus} tone={reviewTone[salesImport.reviewStatus]} /></div>
                  <dl>
                    <div><dt>브랜드·상품</dt><dd>{campaign?.brandName} · {campaign?.productName}</dd></div>
                    <div><dt>판매수량</dt><dd>{salesImport.totalQuantity.toLocaleString('ko-KR')}개</dd></div>
                    <div><dt>총매출</dt><dd>{formatCurrency(salesImport.totalSalesAmount)}</dd></div>
                    <div><dt>정산 상태</dt><dd>{salesImport.settlementStatus}</dd></div>
                  </dl>
                </button>
              )
            })}
          </div>
        </div>
      </section>

      <SalesDataDrawer
        salesImport={selectedImport}
        rows={rows.filter((row) => row.salesDataImportId === selectedImport?.id)}
        onClose={() => setSelectedImportId(null)}
        onManualInput={(target) => setManualTarget(target)}
        onSync={sync}
      />
      <ManualSalesDataModal
        salesImport={manualTarget}
        rows={rows.filter((row) => row.salesDataImportId === manualTarget?.id)}
        onClose={() => setManualTarget(null)}
        onSave={() => {
          sync()
          setManualTarget(null)
        }}
      />
    </section>
  )
}

function SalesDataDrawer({ salesImport, rows, onClose, onManualInput, onSync }: { salesImport: SalesDataImport | null; rows: SalesDataRow[]; onClose: () => void; onManualInput: (salesImport: SalesDataImport) => void; onSync: () => void }) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  if (!salesImport) return null

  const campaign = getImportCampaign(salesImport)
  const totals = calculateSalesTotals(rows, salesImport)
  const analysis = buildSalesAnalysis(salesImport, rows, campaign)
  const hasError = analysis.validation.status === 'error'

  const uploadFile = (file?: File) => {
    if (!file) return
    const nextImport = salesDataService.updateSalesDataImport({
      ...salesImport,
      fileName: file.name,
      fileSize: file.size,
      sourceType: 'file',
      uploadedBy: '허수정',
      uploadedAt: '2026-07-16 14:30',
      reviewStatus: '업로드 완료',
      uploadedProductName: campaign?.productName,
      salesStartDate: campaign?.startDate,
      salesEndDate: campaign?.endDate,
    })
    salesDataService.addSalesDataRows(salesImport.id, makeMockRows(nextImport, campaign))
    onSync()
  }

  const updateStatus = (nextImport: SalesDataImport) => {
    salesDataService.updateSalesDataImport(nextImport)
    onSync()
  }

  return (
    <div className="drawer-backdrop">
      <aside className="preview-drawer sales-data-drawer">
        <div className="preview-drawer__header">
          <div><p className="page-eyebrow">Sales Detail</p><h2>{campaign?.campaignName ?? salesImport.campaignId}</h2></div>
          <button className="icon-button" onClick={onClose} type="button">×</button>
        </div>

        <dl className="preview-list sales-data-detail-list">
          <div><dt>셀러</dt><dd>{campaign?.sellerName}</dd></div>
          <div><dt>브랜드</dt><dd>{campaign?.brandName}</dd></div>
          <div><dt>상품</dt><dd>{campaign?.productName}</dd></div>
          <div><dt>판매 기간</dt><dd>{salesImport.salesStartDate || '-'} ~ {salesImport.salesEndDate || '-'}</dd></div>
          <div><dt>담당 매니저</dt><dd>{campaign?.managerName}</dd></div>
          <div><dt>MD</dt><dd>{campaign?.mdName}</dd></div>
          <div><dt>링크 주체</dt><dd>{campaign?.linkOwner}</dd></div>
          <div><dt>데이터 출처</dt><dd>{salesImport.sourceType}</dd></div>
          <div><dt>업로드 담당자</dt><dd>{salesImport.uploadedBy || '-'}</dd></div>
          <div><dt>업로드 시간</dt><dd>{salesImport.uploadedAt || '-'}</dd></div>
          <div><dt>검수 담당자</dt><dd>{salesImport.reviewerName}</dd></div>
          <div><dt>검수 상태</dt><dd><StatusBadge label={salesImport.reviewStatus} tone={reviewTone[salesImport.reviewStatus]} /></dd></div>
          <div><dt>정산 상태</dt><dd><StatusBadge label={salesImport.settlementStatus} tone={settlementTone[salesImport.settlementStatus]} /></dd></div>
        </dl>

        <section className="sales-upload-box" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); uploadFile(event.dataTransfer.files[0]) }}>
          <strong>파일 업로드</strong>
          <p>xlsx, xls, csv 메타데이터만 저장합니다. 파일 자체는 저장하지 않습니다.</p>
          <dl>
            <div><dt>파일명</dt><dd>{salesImport.fileName || '-'}</dd></div>
            <div><dt>파일 크기</dt><dd>{formatFileSize(salesImport.fileSize)}</dd></div>
            <div><dt>업로드 시간</dt><dd>{salesImport.uploadedAt || '-'}</dd></div>
            <div><dt>현재 검수 상태</dt><dd>{salesImport.reviewStatus}</dd></div>
          </dl>
          <input accept=".xlsx,.xls,.csv" hidden onChange={(event) => uploadFile(event.target.files?.[0])} ref={fileInputRef} type="file" />
          <button className="secondary-button" onClick={() => fileInputRef.current?.click()} type="button">파일 선택</button>
        </section>

        <section className="sales-summary-grid">
          <SummaryItem label="총 판매수량" value={`${totals.totalQuantity.toLocaleString('ko-KR')}개`} />
          <SummaryItem label="총매출" value={formatCurrency(totals.totalSalesAmount)} />
          <SummaryItem label="취소수량" value={`${totals.canceledQuantity.toLocaleString('ko-KR')}개`} />
          <SummaryItem label="환불수량" value={`${totals.refundedQuantity.toLocaleString('ko-KR')}개`} />
          <SummaryItem label="순판매수량" value={`${totals.netQuantity.toLocaleString('ko-KR')}개`} />
          <SummaryItem label="순매출" value={formatCurrency(totals.netSales)} />
          <SummaryItem label="셀러 수수료율" value={`${salesImport.commissionRate ?? 17}%`} />
          <SummaryItem label="예상 수수료" value={formatCurrency(totals.expectedCommission)} />
          <SummaryItem label="샘플비 차감 예정" value={formatCurrency(salesImport.sampleDeductionAmount ?? 0)} />
          <SummaryItem label="이벤트비 차감 예정" value={formatCurrency(salesImport.eventDeductionAmount ?? 0)} />
          <SummaryItem label="회사 잔여 수수료 예상" value={formatCurrency(totals.companyRemainingCommission)} />
        </section>

        <section className="sales-ai-card">
          <div className="checklist-head"><div><h3>AI 판매 데이터 분석</h3><p>현재 값과 검증 결과 기반 mock 분석입니다.</p></div></div>
          <ul>{analysis.messages.map((message) => <li key={message}>{message}</li>)}</ul>
          <div className="action-row">
            <button className="secondary-button" onClick={() => salesDataService.validateSalesData(salesImport.id) && onSync()} type="button">분석 새로고침</button>
            <button className="secondary-button" onClick={() => updateStatus({ ...salesImport, reviewStatus: '오류 확인 필요' })} type="button">오류만 보기</button>
            <button className="secondary-button" onClick={() => salesDataService.markSettlementReady(salesImport.id) && onSync()} type="button">정산 준비 확인</button>
          </div>
        </section>

        <section className="comparison-table-wrap">
          <table className="comparison-table sales-row-table">
            <thead><tr><th>옵션명</th><th>판매수량</th><th>판매가</th><th>총매출</th><th>취소수량</th><th>환불수량</th><th>순판매수량</th><th>순매출</th><th>검증 상태</th><th>검증 메시지</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}><td>{row.optionName}</td><td>{row.quantity}</td><td>{formatCurrency(row.unitPrice)}</td><td>{formatCurrency(row.grossSales)}</td><td>{row.canceledQuantity}</td><td>{row.refundedQuantity}</td><td>{row.netQuantity}</td><td>{formatCurrency(row.netSales)}</td><td>{row.validationStatus}</td><td>{row.validationMessage}</td></tr>
              ))}
            </tbody>
          </table>
        </section>

        <div className="preview-drawer__actions">
          <button className="secondary-button" onClick={() => fileInputRef.current?.click()} type="button">파일 업로드</button>
          <button className="secondary-button" onClick={() => onManualInput(salesImport)} type="button">수기 입력</button>
          <button className="secondary-button" onClick={() => { salesDataService.validateSalesData(salesImport.id); onSync() }} type="button">검수 시작</button>
          <button className="secondary-button" onClick={() => updateStatus({ ...salesImport, reviewStatus: '오류 확인 필요' })} type="button">오류 표시</button>
          <button className="primary-button" disabled={hasError} onClick={() => salesDataService.confirmSalesData(salesImport.id) && onSync()} type="button">판매 데이터 확정</button>
          <button className="secondary-button" onClick={() => salesDataService.markSettlementReady(salesImport.id) && onSync()} type="button">정산 생성 준비</button>
          <button className="secondary-button" type="button">공동구매 상세 보기</button>
        </div>
      </aside>
    </div>
  )
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return <div className="sales-summary-item"><span>{label}</span><strong>{value}</strong></div>
}

function ManualSalesDataModal({ salesImport, rows, onClose, onSave }: { salesImport: SalesDataImport | null; rows: SalesDataRow[]; onClose: () => void; onSave: () => void }) {
  const [draftRows, setDraftRows] = useState(() => rows.length ? rows : [])
  if (!salesImport) return null

  const updateRow = (id: string, key: keyof SalesDataRow, value: string) => {
    setDraftRows((current) => current.map((row) => {
      if (row.id !== id) return row
      const next = { ...row, [key]: key === 'optionName' ? value : Number(value || 0) }
      return calculateSalesRow({
        id: next.id,
        salesDataImportId: next.salesDataImportId,
        campaignId: next.campaignId,
        optionName: next.optionName,
        quantity: next.quantity,
        unitPrice: next.unitPrice,
        canceledQuantity: next.canceledQuantity,
        refundedQuantity: next.refundedQuantity,
      })
    }))
  }

  const addRow = () => {
    setDraftRows((current) => [...current, calculateSalesRow({ id: crypto.randomUUID(), salesDataImportId: salesImport.id, campaignId: salesImport.campaignId, optionName: '', quantity: 0, unitPrice: 0, canceledQuantity: 0, refundedQuantity: 0 })])
  }

  const save = () => {
    salesDataService.updateSalesDataImport({ ...salesImport, sourceType: 'manual', uploadedBy: '허수정', uploadedAt: '2026-07-16 14:30' })
    salesDataService.addSalesDataRows(salesImport.id, draftRows)
    salesDataService.validateSalesData(salesImport.id)
    onSave()
  }

  return (
    <div className="drawer-backdrop">
      <section className="complete-modal sales-manual-modal">
        <h3>수기 입력</h3>
        <div className="manual-row-list">
          {draftRows.map((row) => (
            <div className="manual-row" key={row.id}>
              <label><span>옵션명</span><input value={row.optionName} onChange={(event) => updateRow(row.id, 'optionName', event.target.value)} /></label>
              <label><span>판매수량</span><input type="number" value={row.quantity} onChange={(event) => updateRow(row.id, 'quantity', event.target.value)} /></label>
              <label><span>판매가</span><input type="number" value={row.unitPrice} onChange={(event) => updateRow(row.id, 'unitPrice', event.target.value)} /></label>
              <label><span>취소수량</span><input type="number" value={row.canceledQuantity} onChange={(event) => updateRow(row.id, 'canceledQuantity', event.target.value)} /></label>
              <label><span>환불수량</span><input type="number" value={row.refundedQuantity} onChange={(event) => updateRow(row.id, 'refundedQuantity', event.target.value)} /></label>
              <button className="secondary-button" onClick={() => setDraftRows((current) => current.filter((item) => item.id !== row.id))} type="button">삭제</button>
            </div>
          ))}
        </div>
        <div className="action-row">
          <button className="secondary-button" onClick={addRow} type="button">행 추가</button>
          <button className="primary-button" onClick={save} type="button">저장</button>
          <button className="secondary-button" onClick={onClose} type="button">닫기</button>
        </div>
      </section>
    </div>
  )
}
