import type { Campaign } from '../types/campaign'
import type { Settlement } from '../types/settlement'
import type { SalesDataImport } from '../types/salesData'

export function campaignSettlementStage(campaign: Pick<Campaign, 'endDate' | 'sellerPaymentCompleted' | 'managerPaymentCompleted' | 'settlementDocumentCompleted' | 'sellerPaymentRequestStatus' | 'managerPaymentRequestStatus'>, settlement?: Settlement, sales?: SalesDataImport, today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })) {
  if (settlement?.status === 'completed' || (campaign.sellerPaymentCompleted && campaign.managerPaymentCompleted)) return '지급 완료'
  const states = [settlement?.sellerPaymentRequestStatus ?? campaign.sellerPaymentRequestStatus, settlement?.managerPaymentRequestStatus ?? campaign.managerPaymentRequestStatus]
  if (states.includes('approval_pending') || settlement?.status === 'approval_pending') return '대표 승인 대기'
  if (states.some(state => state === 'approved' || state === 'sent') || settlement?.status === 'approved' || settlement?.status === 'payment_ready') return '입금 대기'
  if (states.some(state => state === 'payment_completed' || state === 'remittance_confirmed')) return '일부 지급 완료'
  if (states.includes('on_hold')) return '지급 보류'
  if (states.some(state => state === 'request_ready' || state === 'evidence_pending')) return '지급 요청'
  if (settlement?.settlementConfirmed || campaign.settlementDocumentCompleted) return '정산서 작성 완료'
  if (settlement && settlement.status !== 'canceled') return '정산서 작성중'
  if (sales && sales.reviewStatus !== '업로드 대기') return '판매데이터 확인'
  if (!campaign.endDate) return '종료일 확인 필요'
  return campaign.endDate < today ? '판매데이터 대기' : '판매 종료 전'
}
