import type { SupplierPayment } from '../../../shared/utils/supplierPayment'
import type { RefObject } from 'react'
import { supplierDocumentAmounts } from '../../../shared/utils/supplierRequestDocument'
import type { SalesDataImport, SalesDataRow } from '../../../shared/types/salesData'
import type { Campaign } from '../../../shared/types/campaign'
import { campaignChannel, channelLabels } from '../../../shared/utils/uploadSettlementConditions'
import { companySettlementProfile as company } from '../../../shared/data/companySettlementProfile'
import { formatCurrency as money } from '../../../shared/utils/salesData'

export function SupplierSettlementDocument({ source, rows, campaign, documentRef, payment, preserveLegacy = false }: {payment?:SupplierPayment; preserveLegacy?:boolean; source:SalesDataImport; rows:SalesDataRow[]; campaign?:Campaign; documentRef:RefObject<HTMLDivElement|null>}) {
  const channel = campaignChannel(campaign, source)
  const { supplierCollects, knownChannel, supply, shipping, commission, amount } = supplierDocumentAmounts(source, rows, channel, payment, preserveLegacy)
  return <div className="seller-document-shell"><div ref={documentRef} className="seller-document seller-statement vendor-statement">
    <header className="seller-document__header"><h2>공급사 거래 정산서</h2><p>{company.legalName} · {campaign?.brandName || '공급사 확인 필요'}</p></header>
    <table className="seller-document__table"><tbody><tr><th>진행 공구</th><td>{campaign?.campaignName}</td></tr><tr><th>진행 상품</th><td>{campaign?.productName}</td></tr><tr><th>판매 기간</th><td>{source.salesStartDate ?? campaign?.startDate} ~ {source.salesEndDate ?? campaign?.endDate}</td></tr><tr><th>판매 링크</th><td>{channel ? channelLabels[channel] : '확인 필요'}</td></tr><tr><th>정산 방향</th><td>{!knownChannel?'판매대금 수령 주체 확인 필요':supplierCollects?'공급사 → 와이즈벤더 · 합의 수수료 입금':'와이즈벤더 → 공급사 · 물품대금 및 배송비 지급'}</td></tr></tbody></table>
    <h3>품목별 판매 수량</h3><table className="seller-document__table"><thead><tr><th>품목</th><th>정산 수량</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td>{row.optionName}</td><td>{Math.max(row.quantity-row.canceledQuantity-row.refundedQuantity,0)}개</td></tr>)}</tbody></table>
    <h3>정산 내역 (VAT 포함)</h3><table className="seller-document__table"><tbody>{supplierCollects?<tr><th>합의 수수료 합계</th><td>{commission===undefined?'수수료 조건 확인 필요':money(commission)}</td></tr>:<><tr><th>공급사 청구 물품대금</th><td>{supply===undefined?'회사 실제 공급가 확인 필요':money(supply)}</td></tr><tr><th>공급사 청구 배송비</th><td>{shipping===undefined?'원본 청구액 확인 필요':money(shipping)}</td></tr></>}{payment && !supplierCollects && <><tr><th>기본 공급사 지급액</th><td>{supply===undefined||shipping===undefined?'확인 필요':money(supply+shipping)}</td></tr>{payment.adjustments.map(item=><tr key={item.id}><th>{item.kind} · {item.memo}</th><td>{item.direction==='add'?'+':'−'}{money(item.amount)}</td></tr>)}</>}<tr className="manager-final-row"><th>{supplierCollects?'입금 요청액':'공급사 지급 예정액'}</th><td><strong>{amount===undefined?'확인 필요':money(amount)}</strong></td></tr></tbody></table>
    <section className="seller-document__section"><h3>회사 정보</h3><table className="seller-document__table"><tbody><tr><th>회사명</th><td>{company.legalName}</td><th>대표자</th><td>{company.representativeName}</td></tr><tr><th>사업자등록번호</th><td colSpan={3}>{company.businessRegistrationNumber}</td></tr><tr><th>주소</th><td colSpan={3}>{company.businessAddress}</td></tr><tr><th>정산 문의</th><td colSpan={3}>{company.taxInvoiceEmail}</td></tr>{supplierCollects&&<tr><th>입금 계좌</th><td colSpan={3}>{company.settlementBankName} {company.settlementBankAccount} · {company.settlementAccountHolder}</td></tr>}</tbody></table></section>
  </div></div>
}
