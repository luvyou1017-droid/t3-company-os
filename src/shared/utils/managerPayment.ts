import type { SellerBusinessType } from '../types/sellerSettlement'

const managerBusinessTypes: Record<string, SellerBusinessType> = {
  허윤정: 'corporation',
  오세린: 'general_business',
  박지훈: 'simplified_business',
  최유진: 'freelancer',
  윤태호: 'corporation',
  김병희: 'freelancer',
  서주희: 'simplified_business',
  고정원: 'general_business',
  배민성: 'freelancer',
  이규빈: 'corporation',
}

export function getManagerBusinessType(managerName: string): SellerBusinessType {
  return managerBusinessTypes[managerName] ?? 'simplified_business'
}

const normalizeManager = (value: string) => value.normalize('NFKC').replace(/\s+/g, '').toLowerCase()

/** 대표가 직접 담당하는 공구는 별도 매니저 지급 대상이 아니다. */
export function isCompanyDirectManager(managerId?: string, managerName?: string) {
  return managerId === 'u-001' || normalizeManager(managerName ?? '') === normalizeManager('허윤정')
}
