import { companySettlementProfile as company } from '../data/companySettlementProfile'

export function companyBusinessMessage() {
  return [
    '안녕하세요! 전달드리는 사업자 정보로 계산서(과세 거래는 세금계산서) 발행 부탁드립니다.',
    '전월 거래분은 매월 10일까지 전월 공급일 기준으로 발행 부탁드립니다. 월합계 발행 시 작성일자는 전월 말일로 부탁드립니다.',
    '',
    '[사업자 정보]',
    `상호: ${company.legalName}`,
    `대표자: ${company.representativeName}`,
    `사업자등록번호: ${company.businessRegistrationNumber}`,
    `사업장 주소: ${company.businessAddress}`,
    `업태: ${company.businessType}`,
    `종목: ${company.businessItem}`,
    `계산서 수신 이메일: ${company.taxInvoiceEmail}`,
    '',
    '[계좌 정보]',
    `은행: ${company.settlementBankName}`,
    `계좌번호: ${company.settlementBankAccount}`,
    `예금주: ${company.legalName} ${company.representativeName}`,
  ].join('\n')
}
