import { useState } from 'react'
import { campaignService } from '../../../shared/services/campaignService'
import { managerPaymentService } from '../../../shared/services/managerPaymentService'
import { paymentEvidenceService } from '../../../shared/services/paymentEvidenceService'
import { paymentRequestService } from '../../../shared/services/paymentRequestService'
import { salesDataService } from '../../../shared/services/salesDataService'
import { sellerSettlementService } from '../../../shared/services/sellerSettlementService'
import { settlementService } from '../../../shared/services/settlementService'
import { statusLabel } from '../../../shared/utils/settlement'
import { formatCurrency } from '../../../shared/utils/salesData'
import { openPaymentDetail } from '../../../shared/utils/paymentNavigation'

type CampaignSettlementTabProps = {
  campaignId: string
  onOpenSettlement?: (settlementId: string) => void
}

export function CampaignSettlementTab({ campaignId, onOpenSettlement }: CampaignSettlementTabProps) {
  const [, setRevision] = useState(0)
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
        <div className="empty-state"><strong>판매 데이터 확정 후 정산을 생성할 수 있습니다.</strong><span>{readySales ? '정산 생성 버튼으로 초안을 만들 수 있습니다.' : '정산 가능한 Sales Data가 없습니다.'}</span></div>
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
      <div className="campaign-payment-cards">
        {settlements.flatMap((settlement) => {
          const campaign = campaignService.getCampaignById(settlement.campaignId)
          if (!campaign) return []
          const sellerRule = sellerSettlementService.getSellerSettlementRule(campaign.id)
          return (['seller', 'manager'] as const).map((recipientType) => {
            const isSeller = recipientType === 'seller'
            const recipientId = isSeller ? campaign.sellerId : campaign.managerId
            const recipientName = isSeller ? campaign.sellerName : campaign.managerName
            const businessType = isSeller ? sellerRule?.businessType ?? 'general_business' : managerPaymentService.getBusinessType(campaign.managerName)
            const evidence = paymentEvidenceService.getEvidenceBySettlementId(settlement.id, recipientType)
            const reasons = paymentRequestService.getPaymentRequestBlockReasons({
              settlementId: settlement.id, ownerType: recipientType, ownerId: recipientId, businessType,
              evidenceTypeConfirmed: isSeller ? Boolean(sellerRule?.evidenceConfirmed && sellerRule.confirmedEvidenceType) : true,
              accountConfirmed: settlement.accountConfirmed, calculationCompleted: true, calculationErrors: [],
              sourceVersion: settlement.settlementVersion,
            })
            const request = paymentRequestService.getPaymentRequestForRecipient(settlement.id, recipientType, recipientId, settlement.settlementVersion)
            return <article className="readiness-card" key={`${settlement.id}-${recipientType}`}>
              <span className="status-badge waiting">{isSeller ? '셀러 지급요청' : '매니저 지급요청'}</span>
              <h3>{recipientName}</h3>
              <dl>
                <div><dt>사업자·증빙</dt><dd>{businessType} · {isSeller ? sellerRule?.confirmedEvidenceType ?? '미확정' : businessType === 'freelancer' ? 'withholding_3_3' : businessType === 'simplified_business' ? 'cash_receipt' : 'tax_invoice'}</dd></div>
                <div><dt>증빙 상태</dt><dd>{businessType === 'freelancer' ? reasons.some((reason) => reason.includes('원천세')) ? '원천세 미등록' : '원천세 등록' : evidence.some((item) => item.reviewStatus === 'approved') ? '승인' : '대기'}</dd></div>
                <div><dt>최종 지급액</dt><dd>{formatCurrency(isSeller ? settlement.currentCalculation.finalSellerPaymentAmount : settlement.currentCalculation.managerAmount)}</dd></div>
                <div><dt>지급요청 상태</dt><dd>{request?.status ?? '요청 전'}</dd></div>
              </dl>
              <div className="button-row">
                <button className="secondary-button" onClick={() => openPaymentDetail(settlement.id, recipientType, { from: `/campaigns/${encodeURIComponent(campaign.id)}?tab=settlement`, label: '공동구매 상세' })} type="button">지급 상세</button>
                <button className="secondary-button" disabled={Boolean(reasons.length)} onClick={() => {
                  if (isSeller) paymentRequestService.createPaymentRequest(settlement.id, '허수정')
                  else paymentRequestService.createManagerPaymentRequest(settlement.id, '허수정', businessType)
                  setRevision((value) => value + 1)
                }} type="button">{isSeller ? '셀러 지급요청' : '매니저 지급요청'}</button>
              </div>
              {reasons.length > 0 && <small>{reasons.join(' · ')}</small>}
            </article>
          })
        })}
      </div>
    </section>
  )
}
