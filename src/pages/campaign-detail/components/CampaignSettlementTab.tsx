import { salesDataService } from '../../../shared/services/salesDataService'
import { settlementService } from '../../../shared/services/settlementService'
import { statusLabel } from '../../../shared/utils/settlement'
import { formatCurrency } from '../../../shared/utils/salesData'

type CampaignSettlementTabProps = {
  campaignId: string
  onOpenSettlement?: (settlementId: string) => void
}

export function CampaignSettlementTab({ campaignId, onOpenSettlement }: CampaignSettlementTabProps) {
  const settlements = settlementService.getSettlementByCampaignId(campaignId)
  const readySales = salesDataService.getSalesDataByCampaignId(campaignId).imports.find((item) => item.reviewStatus === '확정 완료' && item.settlementStatus === '정산 가능')

  const createSettlement = () => {
    if (!readySales) return
    const settlement = settlementService.createSettlementFromSalesData(readySales.id)
    if (settlement) onOpenSettlement?.(settlement.id)
  }

  if (!settlements.length) {
    return (
      <section className="detail-card">
        <div className="checklist-head">
          <div>
            <h3>정산</h3>
            <p className="muted-text">확정 완료 및 정산 가능 상태의 Sales Data로 정산을 생성합니다.</p>
          </div>
          <button className="primary-button" disabled={!readySales} onClick={createSettlement} type="button">정산 생성</button>
        </div>
        <div className="empty-state"><strong>연결된 정산이 없습니다.</strong><span>{readySales ? '정산 생성 버튼으로 초안을 만들 수 있습니다.' : '정산 가능한 Sales Data가 없습니다.'}</span></div>
      </section>
    )
  }

  return (
    <section className="detail-card">
      <div className="checklist-head">
        <div>
          <h3>정산</h3>
          <p className="muted-text">Campaign 중심 Settlement 데이터를 표시합니다.</p>
        </div>
        <button className="primary-button" disabled={!readySales} onClick={createSettlement} type="button">정산 생성</button>
      </div>
      <div className="comparison-table-wrap">
        <table className="comparison-table campaign-settlement-table">
          <thead><tr><th>상태</th><th>버전</th><th>총매출</th><th>총수수료</th><th>벤더 수수료</th><th>차감 합계</th><th>최종 배분 대상 금액</th><th>매니저 지급액</th><th>회사 귀속액</th><th>셀러 지급액</th><th>증빙 상태</th><th>지급 상태</th><th>액션</th></tr></thead>
          <tbody>
            {settlements.map((settlement) => (
              <tr key={settlement.id}>
                <td>{statusLabel(settlement.status)}</td>
                <td>v{settlement.settlementVersion}</td>
                <td className="amount-cell">{formatCurrency(settlement.currentCalculation.grossSales)}</td>
                <td className="amount-cell">{formatCurrency(settlement.currentCalculation.grossCommission)}</td>
                <td className="amount-cell">{formatCurrency(settlement.currentCalculation.vendorCommission)}</td>
                <td className="amount-cell">{formatCurrency(settlement.currentCalculation.deductionTotal)}</td>
                <td className="amount-cell">{formatCurrency(settlement.currentCalculation.distributableVendorCommission)}</td>
                <td className="amount-cell">{formatCurrency(settlement.currentCalculation.managerAmount)}</td>
                <td className="amount-cell">{formatCurrency(settlement.currentCalculation.companyAmount)}</td>
                <td className="amount-cell">{formatCurrency(settlement.currentCalculation.finalSellerPaymentAmount)}</td>
                <td>{settlement.evidenceStatus === 'confirmed' ? '확인 완료' : '미확인'}</td>
                <td>{settlement.status === 'completed' ? '완료' : settlement.status === 'payment_ready' ? '지급 준비' : '대기'}</td>
                <td>
                  <div className="action-row">
                    <button className="secondary-button" onClick={() => onOpenSettlement?.(settlement.id)} type="button">정산 상세</button>
                    <button className="secondary-button" onClick={() => onOpenSettlement?.(settlement.id)} type="button">계산 로그</button>
                    <button className="secondary-button" onClick={() => onOpenSettlement?.(settlement.id)} type="button">정산서 미리보기</button>
                    <button className="secondary-button" onClick={() => onOpenSettlement?.(settlement.id)} type="button">수정 이력</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
