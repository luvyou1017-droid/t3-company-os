import type { SellerMaster, SellerBusinessProfile } from '../services/sellerMasterService'

// Older settlement editors saved root fields without a businesses array.
// Seed the editor from those fields; never replace them with an empty profile.
export function sellerEditorBusinesses(seller: SellerMaster): SellerBusinessProfile[] {
  if (seller.businesses?.length) return seller.businesses.map(business => ({ ...business }))
  return [{ id: crypto.randomUUID(), businessName: seller.businessName ?? '',
    representativeName: seller.realName ?? '', businessType: seller.businessType ?? 'general_business',
    bankName: seller.bankName, accountNumber: seller.accountNumber, accountHolder: seller.accountHolder,
    isPrimary: true, active: true }]
}

export function validateSellerBusinesses(seller: SellerMaster, residentNumbers: Record<string, string> = {}) {
  for (const business of seller.businesses ?? []) {
    if (business.businessType === 'freelancer') {
      if (!(business.representativeName ?? seller.realName ?? '').trim()) return '프리랜서 실명을 입력해주세요.'
      const number = residentNumbers[business.id] ?? ''
      if (number && number.replace(/\D/g, '').length !== 13) return '주민등록번호를 입력하는 경우 13자리를 입력해주세요.'
    } else if (!business.businessName.trim()) return '각 사업자의 사업자명을 입력해주세요.'
  }
  return ''
}
