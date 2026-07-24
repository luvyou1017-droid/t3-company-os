import { useState } from 'react'
import { campaignService } from '../../shared/services/campaignService'
import { paymentRequestService } from '../../shared/services/paymentRequestService'
import { sellerSettlementService } from '../../shared/services/sellerSettlementService'
import type { PaymentRequest, PaymentRequestStatus } from '../../shared/types/sellerSettlement'

const money = (value: number) => `${Math.round(value).toLocaleString('ko-KR')}원`
const channelLabel = { supplier_link: '공급사 링크', wise_shop_link: '와이즈샵 링크', seller_checkout: '셀러 결제창' }
const businessLabel = { corporation: '법인', general_business: '일반 개인사업자', simplified_business: '간이사업자', freelancer: '개인 프리랜서' }
const evidenceLabel = { tax_invoice: '세금계산서', cash_receipt: '현금영수증', withholding_3_3: '3.3% 원천징수' }
const statusLabel: Record<PaymentRequestStatus, string> = {
  draft: '초안', evidence_pending: '증빙 대기', request_ready: '요청 생성 대기', approval_pending: '대표 승인 대기',
  approved: '승인 완료', sent: '셀러 전달 완료', payment_completed: '지급 완료',
  remittance_confirmed: '입금 확인 완료', on_hold: '보류', rejected: '반려',
}
const statusTone: Record<PaymentRequestStatus, string> = {
  draft: 'waiting', evidence_pending: 'waiting', request_ready: 'progress', approval_pending: 'settlement',
  approved: 'settlement', sent: 'progress', payment_completed: 'done', remittance_confirmed: 'done', on_hold: 'error', rejected: 'error',
}

export function PaymentRequestPage() {
  const [requests, setRequests] = useState(() => paymentRequestService.getPaymentRequests())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = requests.find((item) => item.id === selectedId)
  const sync = () => setRequests(paymentRequestService.getPaymentRequests())
  const act = (action: () => unknown) => { action(); sync() }
  const kpis = [
    ['지급 요청 생성 대기', requests.filter((item) => item.status === 'draft' || item.status === 'request_ready').length],
    ['증빙 대기', requests.filter((item) => item.status === 'evidence_pending').length],
    ['대표 승인 대기', requests.filter((item) => item.status === 'approval_pending').length],
    ['지급 예정', requests.filter((item) => item.status === 'approved').length],
    ['셀러 입금 확인 대기', requests.filter((item) => item.direction === 'seller_to_company' && item.status === 'sent').length],
    ['완료', requests.filter((item) => item.status === 'payment_completed' || item.status === 'remittance_confirmed').length],
    ['보류', requests.filter((item) => item.status === 'on_hold').length],
  ] as const

  if (selected) return <PaymentDetail request={selected} onBack={() => setSelectedId(null)} onAction={act} />

  return (
    <section className="payment-page">
      <header className="payment-hero">
        <div><p className="page-eyebrow">Payment Request MVP</p><h1>지급·입금 요청</h1><p>실제 이체 없이 증빙, 대표 승인, 지급 및 셀러 입금 확인을 관리합니다.</p></div>
        <button className="primary-button" type="button" onClick={() => setSelectedId(requests[0]?.id ?? null)}>가장 긴급한 요청 확인</button>
      </header>
      <div className="payment-kpi-grid">{kpis.map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
      <section className="workspace-card">
        <div className="section-heading"><div><h2>요청 목록</h2><p>행을 선택하면 넓은 전용 상세 화면에서 계산 근거와 정산서를 확인할 수 있습니다.</p></div><strong>{requests.length}건</strong></div>
        <div className="responsive-table payment-table"><table><thead><tr>
          <th>공동구매</th><th>셀러</th><th>결제 방식</th><th>요청 방향</th><th>사업자 유형</th><th>증빙 유형</th><th>정산 기준 금액</th><th>세무 차감</th><th>최종 지급액 / 회사 입금액</th><th>예정일</th><th>상태</th><th>담당자</th>
        </tr></thead><tbody>{requests.map((request) => {
          const campaign = campaignService.getCampaignById(request.campaignId)
          const keyAmount = request.direction === 'seller_to_company' ? request.sellerRemittanceToCompany : request.finalPaymentAmount
          return <tr key={request.id} tabIndex={0} onClick={() => setSelectedId(request.id)} onKeyDown={(event) => { if (event.key === 'Enter') setSelectedId(request.id) }}>
            <td><strong>{campaign?.campaignName ?? request.campaignId}</strong></td><td>{campaign?.sellerName ?? request.sellerId}</td>
            <td>{channelLabel[request.salesChannelType]}</td><td><strong>{request.direction === 'company_to_seller' ? '회사 → 셀러 지급' : '셀러 → 회사 입금'}</strong></td>
            <td>{businessLabel[request.businessType]}</td><td>{evidenceLabel[request.evidenceType]}</td>
            <td className="money-cell">{money(request.grossSettlementAmount)}</td><td className="money-cell">{money(request.withholdingTaxAmount + request.deductions)}</td>
            <td className="money-cell"><strong>{money(keyAmount)}</strong></td><td>{request.dueDate}</td>
            <td><span className={`status-badge ${statusTone[request.status]}`}>{statusLabel[request.status]}</span></td><td>{request.requestedBy}</td>
          </tr>
        })}</tbody></table></div>
      </section>
    </section>
  )
}

function PaymentDetail({ request, onBack, onAction }: { request: PaymentRequest; onBack: () => void; onAction: (action: () => unknown) => void }) {
  const campaign = campaignService.getCampaignById(request.campaignId)
  const document = sellerSettlementService.getDocumentBySettlementId(request.settlementId)
  const calculation = document?.calculation
  const isIncoming = request.direction === 'seller_to_company'
  const primary = request.status === 'approval_pending'
    ? () => onAction(() => paymentRequestService.approvePaymentRequest(request.id))
    : isIncoming && request.status === 'sent'
      ? () => onAction(() => paymentRequestService.markSellerRemittanceConfirmed(request.id))
      : !isIncoming && request.status === 'approved'
        ? () => onAction(() => paymentRequestService.markPaymentCompleted(request.id))
        : undefined
  const primaryLabel = request.status === 'approval_pending' ? '대표 승인' : isIncoming ? '입금 확인 완료' : '지급 완료 체크'

  return <section className="payment-detail">
    <header className={`payment-direction ${isIncoming ? 'incoming' : 'outgoing'}`}>
      <button className="text-button" onClick={onBack} type="button">← 요청 목록</button>
      <div className="payment-direction__row"><div><span>지급 방향</span><h1>{isIncoming ? '셀러 → 회사 입금' : '회사 → 셀러 지급'}</h1><p>{campaign?.campaignName} · {campaign?.sellerName}</p></div>
      {primary && <button className="primary-button" onClick={primary} type="button">{primaryLabel}</button>}</div>
    </header>
    <div className="payment-summary-grid">
      <article><span>{isIncoming ? '회사 입금 요청액' : '최종 지급액'}</span><strong>{money(isIncoming ? request.sellerRemittanceToCompany : request.finalPaymentAmount)}</strong></article>
      <article><span>현재 상태</span><strong>{statusLabel[request.status]}</strong></article>
      <article><span>예정일</span><strong>{request.dueDate}</strong></article>
      <article><span>증빙 유형</span><strong>{evidenceLabel[request.evidenceType]}</strong></article>
    </div>
    {document && calculation && <div className="payment-detail-grid">
      <section className="workspace-card seller-statement">
        <p className="page-eyebrow">{channelLabel[request.salesChannelType]}</p>
        <h2>{isIncoming ? '회사 입금 요청 정산서' : '셀러 지급 정산서'}</h2>
        {request.salesChannelType === 'wise_shop_link' && <div className="payment-notice">결제 주체: 와이즈샵 · 지급 주체: 와이즈벤더</div>}
        <dl className="statement-meta"><div><dt>셀러명</dt><dd>{document.sellerName}</dd></div><div><dt>공동구매명</dt><dd>{document.campaignName}</dd></div><div><dt>판매기간</dt><dd>{document.salesPeriod}</dd></div><div><dt>상품</dt><dd>{document.productName}</dd></div></dl>
        <div className="responsive-table"><table><thead><tr><th>옵션</th><th>최종 판매수량</th><th>판매가</th><th>상품 매출</th></tr></thead><tbody>{document.items.map((item) => <tr key={item.optionName}><td>{item.optionName}</td><td>{item.quantity}</td><td className="money-cell">{money(item.unitPrice)}</td><td className="money-cell">{money(item.amount)}</td></tr>)}</tbody></table></div>
        <dl className="statement-totals">
          <div><dt>상품 매출</dt><dd>{money(calculation.productSalesAmount)}</dd></div>
          {isIncoming && <><div><dt>배송비</dt><dd>{money(calculation.shippingAmount)}</dd></div><div><dt>총 결제금액</dt><dd>{money(calculation.totalCollectedAmount)}</dd></div></>}
          <div><dt>셀러 기본 수수료율</dt><dd>{calculation.sellerCommissionRate}%</dd></div>
          <div><dt>외부몰 추가 수수료율</dt><dd>{calculation.externalMallExtraRate}%</dd></div>
          <div><dt>최종 셀러 수수료</dt><dd>{calculation.effectiveSellerCommissionRate}% · {money(calculation.sellerCommissionAmount)}</dd></div>
          <div><dt>사업자·증빙</dt><dd>{businessLabel[document.businessType]} · {evidenceLabel[document.evidenceType]}</dd></div>
          <div><dt>증빙 요청 금액</dt><dd>{money(document.evidenceRequestAmount)}</dd></div>
          {isIncoming ? <><div><dt>셀러 보유액</dt><dd>{money(calculation.sellerKeepsAmount)}</dd></div><div className="statement-key"><dt>회사 입금 요청액</dt><dd>{money(calculation.sellerRemittanceToCompany)}</dd></div><div><dt>회사 계좌</dt><dd>{document.companyAccountPlaceholder}</dd></div><div><dt>입금 확인 상태</dt><dd>{request.status === 'remittance_confirmed' ? '입금 확인 완료' : '입금 확인 대기'}</dd></div></>
            : <><div><dt>부가세 제외 기준 금액</dt><dd>{money(calculation.vatExcludedAmount)}</dd></div><div><dt>원천징수액</dt><dd>{money(calculation.withholdingTaxAmount)}</dd></div><div><dt>셀러 부담 차감</dt><dd>{money(calculation.sellerDeductions)}</dd></div><div className="statement-key"><dt>최종 지급액</dt><dd>{money(calculation.finalSellerPaymentAmount)}</dd></div></>}
        </dl>
      </section>
      <aside className="workspace-card calculation-proof"><h2>계산 근거</h2>
        <Step label="부가세 포함 셀러 수수료" value={calculation.sellerGrossSettlementAmount} />
        <Step label="부가세 제외 기준 금액" value={calculation.vatExcludedAmount} />
        <Step label="3.3% 원천징수" value={calculation.withholdingTaxAmount} negative />
        <Step label="셀러 부담 차감" value={calculation.sellerDeductions} negative />
        <Step label={isIncoming ? '회사 입금 요청액 (별도 흐름)' : '최종 지급액'} value={isIncoming ? calculation.sellerRemittanceToCompany : calculation.finalSellerPaymentAmount} strong />
        {isIncoming && <p className="payment-notice">증빙 요청 금액과 회사 입금 요청액은 서로 다른 값입니다. 배송비는 수수료·원천징수 기준에 포함되지 않습니다.</p>}
      </aside>
    </div>}
  </section>
}

function Step({ label, value, negative, strong }: { label: string; value: number; negative?: boolean; strong?: boolean }) {
  return <div className={`calculation-step ${strong ? 'is-strong' : ''}`}><span>{label}</span><strong>{negative && value ? '− ' : ''}{money(value)}</strong></div>
}
