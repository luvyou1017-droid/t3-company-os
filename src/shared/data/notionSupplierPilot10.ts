export type SupplierPilotRow = {
  id: string
  companyName: string
  legalName?: string
  businessType?: 'corporation' | 'sole_proprietor' | 'simplified_business'
  partnerType?: 'supplier' | 'vendor' | 'both'
  businessNumber?: string
  bankAccount?: string
  orderMethod?: string
  orderDeadline?: string
  linkedProductCount: number
  taxEmail?: string
  address?: string
  bankName?: string
  accountHolder?: string
  businessHours?: string
  linkProvision?: string
  orderContact?: string
  csContact?: string
  settlementContact?: string
  mainEmail?: string
  mainContact?: string
  sampleSupport?: string
  salesHurdle?: string
  memo?: string
  brands?: string[]
  businessRegistrationDocumentStatus?: 'missing' | 'registered'
  registrationSourceText?: string
  registeredBy?: string
  source?: 'notion' | 'excel' | 'manual' | 'text'
}

export const lifunSupplier: SupplierPilotRow = {
  id: '192ddc8b71f18094a43dc10258a7ffa6', companyName: '라이펀', businessNumber: '107-86-34538',
  taxEmail: 'lifun6716@hanmail.net', address: '경기도 파주시 운정4길 184(상지석동)', bankName: '기업은행',
  bankAccount: '521-007046-01-012', accountHolder: '(주)라이펀', businessHours: '오전 9시 ~ 오후 5시',
  linkProvision: '공급사 링크 제공', orderContact: 'lifun6716@hanmail.net', csContact: 'lifun6716@hanmail.net',
  settlementContact: 'lifun6716@hanmail.net', mainEmail: 'lifun6716@hanmail.net', orderDeadline: '오전 9시',
  sampleSupport: '월 1회 기준 주문 100건 이하 시 샘플비 청구 · 애니블리 본체/크러시 매출 미달성 시 샘플비 청구',
  salesHurdle: '하루 최소 주문 100건', linkedProductCount: 4, brands: ['매직캔', '고로고로', '먼지더스터'], source: 'excel',
}

export const notionSupplierPilot10: SupplierPilotRow[] = [
  { id: 'f2016c29b5cf4af38831f69cccf9a5cf', companyName: '주식회사 더원스테이스', businessNumber: '464-87-01470', bankAccount: '기업 943-017757-04-016 주식회사 더원스테이스', orderMethod: '샘플 포함 발주서를 지정 양식의 누적 엑셀로 order@theonestays.com에 전달', linkedProductCount: 1 },
  { id: '2e6ddc8b71f1805ab4bbfe905a30680a', companyName: '엠앤제이마케팅', linkedProductCount: 0 },
  { id: '2e1ddc8b71f180438058d5b085b48c61', companyName: 'JBJ', businessNumber: '665-88-00163', bankAccount: '기업 115-152977-04-026 (주)제이비제이', linkedProductCount: 0 },
  { id: '2e1ddc8b71f180e99a10ec4199a48d91', companyName: '엠엔제이 마케팅', linkedProductCount: 0 },
  { id: '2c0ddc8b71f1800ab450c723c7e040d1', companyName: '프레데릭스', linkedProductCount: 1 },
  { id: '2c0ddc8b71f1809e8235cbc6bcc3452e', companyName: '에이제이랩', linkedProductCount: 1 },
  { id: '2c0ddc8b71f1807dbc28d80a920a6ce2', companyName: '지엠홀딩스', linkedProductCount: 1 },
  { id: '2c0ddc8b71f1809a9489c1b9327670cf', companyName: '비트리', linkedProductCount: 1 },
  { id: '2c0ddc8b71f1807783e1fa0b05183d66', companyName: '에코그린', linkedProductCount: 1 },
  { id: '2c0ddc8b71f18021a7a4fe2e04065232', companyName: '뉴라이즌', linkedProductCount: 0 },
]
