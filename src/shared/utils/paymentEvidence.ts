import type { EvidenceDocumentType, EvidenceOwnerType, PaymentEvidence } from '../types/paymentEvidence'
import type { SellerBusinessType } from '../types/sellerSettlement'

export function getRequiredEvidenceType(businessType: SellerBusinessType): EvidenceDocumentType | undefined {
  if (businessType === 'corporation' || businessType === 'general_business') return 'tax_invoice'
  if (businessType === 'simplified_business') return 'cash_receipt'
  return undefined
}

export function validateEvidenceRecords(
  evidence: PaymentEvidence[],
  settlementId: string,
  ownerType: EvidenceOwnerType,
  businessType: SellerBusinessType,
  withholdingRegistered = false,
) {
  void withholdingRegistered
  const requiredType = getRequiredEvidenceType(businessType)
  if (!requiredType) return {
    valid: true,
    reasons: [],
    requiredType: 'withholding_entry' as const,
  }
  const record = evidence.filter((item) =>
    item.settlementId === settlementId && item.ownerType === ownerType && item.evidenceType === requiredType)
    .sort((a, b) => (b.revision ?? 1) - (a.revision ?? 1))[0]
  const reasons: string[] = []
  if (!record) reasons.push(requiredType === 'tax_invoice' ? '세금계산서 캡처본이 없습니다.' : '현금영수증 캡처본이 없습니다.')
  else if (record.reviewStatus !== 'approved') reasons.push('증빙 검수가 완료되지 않았습니다.')
  return { valid: reasons.length === 0, reasons, requiredType }
}

export function runEvidenceAssertions() {
  const base = {
    id: 'test', campaignId: 'campaign', settlementId: 'settlement', ownerId: 'owner', ownerName: '테스트',
    fileName: 'evidence.png', fileType: 'image/png', fileSize: 100, uploadedBy: '허수정', uploadedAt: '2026-07-24',
  }
  const corporatePending = { ...base, ownerType: 'seller' as const, businessType: 'corporation' as const, evidenceType: 'tax_invoice' as const, reviewStatus: 'review_pending' as const }
  const simplifiedApproved = { ...base, ownerType: 'manager' as const, businessType: 'simplified_business' as const, evidenceType: 'cash_receipt' as const, reviewStatus: 'approved' as const }
  const checks = {
    corporateMissingBlocked: !validateEvidenceRecords([], 'settlement', 'seller', 'corporation').valid,
    corporatePendingBlocked: !validateEvidenceRecords([corporatePending], 'settlement', 'seller', 'corporation').valid,
    corporateApprovedAllowed: validateEvidenceRecords([{ ...corporatePending, reviewStatus: 'approved' }], 'settlement', 'seller', 'corporation').valid,
    managerCashReceiptApproved: validateEvidenceRecords([simplifiedApproved], 'settlement', 'manager', 'simplified_business').valid,
    freelancerAutoRegisters: validateEvidenceRecords([], 'settlement', 'manager', 'freelancer').valid,
    freelancerWithListAllowed: validateEvidenceRecords([], 'settlement', 'manager', 'freelancer', true).valid,
  }
  return { passed: Object.values(checks).every(Boolean), checks }
}
