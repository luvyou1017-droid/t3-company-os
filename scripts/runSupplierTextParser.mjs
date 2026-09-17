import assert from 'node:assert/strict'
import { findSupplierDuplicates, mergeSupplier, parseSupplierText } from '../src/features/supplierMaster/services/supplierTextParser.ts'
import { sanitizeAccountNumberInput } from '../src/shared/utils/accountNumber.ts'

const parsed = parseSupplierText(`
거래처 마르스랩스
브랜드: 브릭글로, 세이프핸즈
담당자 또는 연락처 김철수 010-1234-5678
사업자등록번호 123-45-67890
대표 이메일 hello@marslabs.co.kr
은행명 신한은행
계좌번호 110-123-456789
예금주 (주)마르스랩스
정산 담당 settlement@marslabs.co.kr
발주 방식 지정 엑셀을 이메일로 전달
메모 사업자등록증 추후 등록
`)

assert.equal(parsed.supplier.companyName, '마르스랩스')
assert.deepEqual(parsed.supplier.brands, ['브릭글로', '세이프핸즈'])
assert.equal(parsed.supplier.businessNumber, '123-45-67890')
assert.equal(parsed.supplier.mainContact, '김철수 010-1234-5678')
assert.equal(parsed.supplier.bankName, '신한은행')
assert.equal(parsed.supplier.bankAccount, '110-123-456789')
assert.equal(parsed.supplier.businessRegistrationDocumentStatus, 'missing')
assert.equal(parsed.warnings.length, 0)

const existing = { id: 'vendor-1', companyName: '주식회사 마르스 랩스', businessNumber: '1234567890', linkedProductCount: 2, brands: ['브릭글로'], source: 'manual' }
const duplicates = findSupplierDuplicates(parsed.supplier, [existing])
assert.equal(duplicates.length, 1)
assert.equal(duplicates[0].kind, 'exact')
assert.ok(duplicates[0].reasons.includes('사업자등록번호 일치'))

const merged = mergeSupplier(existing, parsed.supplier)
assert.equal(merged.id, 'vendor-1')
assert.equal(merged.linkedProductCount, 2)
assert.deepEqual(merged.brands, ['브릭글로', '세이프핸즈'])
assert.equal(merged.bankName, '신한은행')

const incomplete = parseSupplierText('업체: 뉴월드\n브랜드: 애니블리')
assert.equal(incomplete.supplier.companyName, '뉴월드')
assert.ok(incomplete.warnings.some((warning) => warning.includes('사업자등록번호')))
assert.ok(incomplete.warnings.some((warning) => warning.includes('계좌정보')))

const marsLabs = parseSupplierText(String.raw`
거래처명 : ㈜마르스랩스
사업자등록번호 : 827-81-02644
세금발행메일 : imkt\@marslabs.co.kr
주소 : 서울특별시 성동구 연무장13길 9, 5662호(성수동2가, 아이템플)
계좌 : 신한 140-013-654140 ㈜마르스랩스
업무시간: 오전 10시 \~ 오후 5시
링크제공 여부 : 공급사링크(차감X) / 외부링크 사용시 +5%
발주 담당자 연락처/메일 : imkt\@marslabs.co.kr
CS 담당자 연락처/메일 : [http://pf.kakao.com/_xjiCIb/chat](http://pf.kakao.com/_xjiCIb/chat)
정산 담당자 연락처/메일 : imkt\@marslabs.co.kr
대표 업무 메일 : imkt\@marslabs.co.kr
발주 마감 시간 : 공급사 오후 2시 / 외부몰 오전 11시
샘플 지원여부 : 고무장갑 컬러별 1개씩, 지퍼백 혼합팩 1개 / 미진행시 공급가 청구
매출 허들 : 1,000만원 이상`)

assert.equal(marsLabs.supplier.companyName, '㈜마르스랩스')
assert.equal(marsLabs.supplier.taxEmail, 'imkt@marslabs.co.kr')
assert.equal(marsLabs.supplier.bankName, '신한은행')
assert.equal(marsLabs.supplier.bankAccount, '140-013-654140')
assert.equal(marsLabs.supplier.accountHolder, '㈜마르스랩스')
assert.equal(marsLabs.supplier.csContact, 'http://pf.kakao.com/_xjiCIb/chat')
assert.equal(marsLabs.supplier.orderContact, 'imkt@marslabs.co.kr')
assert.equal(marsLabs.supplier.settlementContact, 'imkt@marslabs.co.kr')
assert.equal(marsLabs.supplier.mainEmail, 'imkt@marslabs.co.kr')
assert.equal(marsLabs.supplier.orderDeadline, '공급사 오후 2시 / 외부몰 오전 11시')
assert.equal(marsLabs.supplier.sampleSupport, '고무장갑 컬러별 1개씩, 지퍼백 혼합팩 1개 / 미진행시 공급가 청구')
assert.equal(marsLabs.supplier.salesHurdle, '1,000만원 이상')
assert.deepEqual(marsLabs.supplier.memo, undefined)
assert.equal(sanitizeAccountNumberInput('140–013 654140'), '140-013654140')
assert.equal(sanitizeAccountNumberInput('110-123-456789'), '110-123-456789')

console.log('supplier text parser: 5/5 checks passed')
