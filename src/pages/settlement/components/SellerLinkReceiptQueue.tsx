import type { Settlement } from '../../../shared/types/settlement'
import type { Campaign } from '../../../shared/types/campaign'
import type { SalesDataImport } from '../../../shared/types/salesData'
import { salesDataService } from '../../../shared/services/salesDataService'
import { settlementService } from '../../../shared/services/settlementService'
import { sellerLinkReceiptAmount } from '../../../shared/utils/sellerLinkReceipt'
import { formatCurrency } from '../../../shared/utils/salesData'

export function SellerLinkReceiptQueue({ settlements, campaigns, sales, onOpenDetail }: { settlements: Settlement[]; campaigns: Map<string, Campaign>; sales: Map<string, SalesDataImport>; onOpenDetail: (id: string) => void }) {
  if (!settlements.length) return <p className="empty-state">검색 조건에 맞는 셀러링크 입금 확인 대기 건이 없습니다.</p>
  return <div className="schedule-table-wrap payment-recipient-table"><table className="schedule-table"><thead><tr><th>공동구매 / 입금 주체</th><th>정산서 상태</th><th>입금 요청액</th><th>입금 확인</th></tr></thead><tbody>{settlements.map(item => {
    const campaign = campaigns.get(item.campaignId)
    const source = sales.get(item.salesDataImportId)
    const amount = source ? sellerLinkReceiptAmount(item, source, salesDataService.getSettlementRowsByImportId(source.id), campaign) : undefined
    return <tr key={item.id}><td><strong>{campaign?.campaignName ?? item.campaignId}</strong><br/><small>{source?.supplyAudience === 'vendor' ? '벤더 거래처' : '셀러'} · {campaign?.sellerName ?? '확인 필요'}</small></td><td>{settlementService.isSettlementConfirmed(item) ? '확정 완료' : '확정 필요'}</td><td className="amount-cell">{amount === undefined ? '정산 조건 확인 필요' : formatCurrency(amount)}</td><td><button className="secondary-button" type="button" onClick={() => onOpenDetail(item.id)}>입금 확인하기</button></td></tr>
  })}</tbody></table><p className="inline-notice">실제 은행 입금내역을 확인한 뒤 상세에서 입금액·날짜를 기록합니다. 지급신청 일괄 처리와 별도입니다.</p></div>
}
