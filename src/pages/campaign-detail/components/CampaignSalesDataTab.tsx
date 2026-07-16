import { useMemo, useState } from 'react'
import { salesDataService } from '../../../shared/services/salesDataService'
import { formatCurrency } from '../../../shared/utils/salesData'

export function CampaignSalesDataTab({ campaignId, onOpenSalesData }: { campaignId: string; onOpenSalesData?: (salesDataImportId: string) => void }) {
  const [data, setData] = useState(() => salesDataService.getSalesDataByCampaignId(campaignId))
  const latestImport = useMemo(() => data.imports[0], [data.imports])

  const refresh = () => setData(salesDataService.getSalesDataByCampaignId(campaignId))

  if (!latestImport) {
    return (
      <section className="detail-card">
        <div className="checklist-head"><div><h3>판매 데이터</h3><p>아직 연결된 판매 데이터가 없습니다.</p></div></div>
        <div className="empty-state">
          <strong>아직 판매 데이터가 없습니다.</strong>
          <p>파일을 업로드하거나 수기로 입력해주세요.</p>
        </div>
      </section>
    )
  }

  return (
    <section className="detail-card">
      <div className="checklist-head">
        <div><h3>판매 데이터</h3><p>Sales Data 페이지와 같은 service 데이터를 campaignId로 조회합니다.</p></div>
        <strong className="result-count">{data.imports.length}건</strong>
      </div>
      <div className="detail-meta-grid">
        <div><span>업로드 상태</span><strong>{latestImport.reviewStatus}</strong></div>
        <div><span>총 판매수량</span><strong>{latestImport.totalQuantity.toLocaleString('ko-KR')}개</strong></div>
        <div><span>총매출</span><strong>{formatCurrency(latestImport.totalSalesAmount)}</strong></div>
        <div><span>검수 상태</span><strong>{latestImport.reviewStatus}</strong></div>
        <div><span>정산 상태</span><strong>{latestImport.settlementStatus}</strong></div>
        <div><span>마지막 업로드일</span><strong>{latestImport.uploadedAt || '-'}</strong></div>
      </div>
      <div className="preview-drawer__actions">
        <button className="primary-button" onClick={() => onOpenSalesData?.(latestImport.id)} type="button">판매 데이터 상세 보기</button>
        <button className="secondary-button" onClick={() => { salesDataService.updateSalesDataImport({ ...latestImport, reviewStatus: '업로드 완료', uploadedAt: '2026-07-16 14:30', uploadedBy: '허수정' }); refresh() }} type="button">파일 업로드</button>
        <button className="secondary-button" onClick={() => { salesDataService.updateSalesDataImport({ ...latestImport, sourceType: 'manual', reviewStatus: '업로드 완료', uploadedAt: '2026-07-16 14:30', uploadedBy: '허수정' }); refresh() }} type="button">수기 입력</button>
      </div>
    </section>
  )
}
