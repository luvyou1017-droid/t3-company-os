# 셀러 정산 규칙

## 목적과 범위

셀러 정산은 기존 Settlement의 확정 판매 데이터와 수수료를 참조하는 별도 계층이다. 업체 정산은 발주모아에서 처리하며 이 범위에 포함하지 않는다. 모든 금액은 원 단위 정수이고 기본적으로 부가세 포함이며, 퍼센트는 `25`, `17`, `3` 형식으로 저장한다. 실제 은행, 홈택스, 현금영수증, 세금계산서 API는 연결하지 않는다.

## 세 가지 결제 방식과 돈의 흐름

| 결제 방식 | 결제금 수령 | 정산 방향 | 핵심 흐름 |
| --- | --- | --- | --- |
| 공급사 링크 | 공급사 | 회사 → 셀러 | 공급사가 총매출 수령 → 회사가 공급사에 총수수료 청구 → 회사가 셀러 수수료 지급 |
| 와이즈샵 링크 | 와이즈샵/회사 | 회사 → 셀러 | 와이즈샵이 총매출 수령 → 와이즈벤더가 셀러 수수료 지급 |
| 셀러 결제창 | 셀러 | 셀러 → 회사 | 셀러가 총 결제금액 수령 → 셀러 수수료 보유 → 나머지 상품대금과 배송비를 회사에 입금 |

기존 Campaign에 `salesChannelType`이 없으면 자동 추정하지 않고 “결제 방식 확인 필요”로 처리한다. 사용자가 선택하기 전에는 셀러 정산서나 지급·입금 요청을 만들 수 없다.

## 공통 계산

```text
productSalesAmount = Σ(옵션 판매가 × 최종 판매수량)
shippingAmount = 확정 배송비
totalCollectedAmount = productSalesAmount + shippingAmount
totalCommissionAmount = round(productSalesAmount × totalCommissionRate / 100)
effectiveSellerCommissionRate = sellerCommissionRate + externalMallExtraRate
sellerCommissionAmount = round(productSalesAmount × effectiveSellerCommissionRate / 100)
vendorCommissionAmount = totalCommissionAmount - sellerCommissionAmount
supplierCostAmount = productSalesAmount - totalCommissionAmount
```

배송비에는 어떤 수수료도 적용하지 않으며 원천징수 기준에도 포함하지 않는다.

공급사 링크의 공급사 세금계산서 예정 금액은 `totalCommissionAmount`다. 공급사·와이즈샵 링크의 셀러 정산 기준 금액은 `sellerCommissionAmount`다.

셀러 결제창은 다음과 같이 검산한다.

```text
sellerRemittanceToCompany = productSalesAmount - sellerCommissionAmount + shippingAmount
companyRemittanceToSupplier = supplierCostAmount + shippingAmount
sellerRemittanceToCompany = companyRemittanceToSupplier + vendorCommissionAmount
```

## 외부몰 추가 수수료

`externalMallExtraRate`는 기본 셀러 수수료를 덮어쓰지 않는다. 0보다 크면 `externalMallExtraReason`, `externalMallExtraApprovedBy`, `externalMallExtraApprovedAt`이 모두 필요하다. 예: 기본 17% + 추가 3% = 최종 20%.

## 사업자 유형과 증빙

| 사업자 유형 | 시스템 추천 증빙 | 지급 계산 |
| --- | --- | --- |
| 법인 | 세금계산서 | 부가세 포함 셀러 수수료 전액 - 셀러 부담 차감 |
| 일반 개인사업자 | 세금계산서 | 부가세 포함 셀러 수수료 전액 - 셀러 부담 차감 |
| 간이사업자 | 현금영수증 | `round(부가세 포함 금액 / 1.1)` - 셀러 부담 차감 |
| 개인 프리랜서 | 3.3% 원천징수 | VAT 제외 기준액 - 소득세 - 지방소득세 - 셀러 부담 차감 |

프리랜서 소득세는 기준액의 3%, 지방소득세는 기준액의 0.3%를 각각 계산한다. 각 계산값의 소수점을 제거한 뒤 `truncateToTenWon`으로 10원 미만을 절사하고, 절사된 두 세액을 합산한다. 3.3%를 한 번에 계산하거나 합산 후 절사하지 않는다.

추천은 영구 확정이 아니다. 담당자가 `confirmedEvidenceType`, 확인자, 확인 시각을 저장해야 한다. 최종 확인 전에는 요청을 생성할 수 없다.

셀러 결제창은 회사가 셀러에게 지급하지 않으므로 세무 계산 결과를 “지급액”이라 부르지 않는다. 셀러 수수료 인정액·보유액·증빙 요청 금액과 회사 입금 요청액을 분리한다.

## 셀러 정산서

- 공급사 링크: 셀러 지급 정산서
- 와이즈샵 링크: 셀러 지급 정산서와 “결제 주체: 와이즈샵 / 지급 주체: 와이즈벤더” 안내
- 셀러 결제창: 회사 입금 요청 정산서

외부 정산서에는 벤더 수수료, 공급업체 지급액, 매니저 지급액, 회사 귀속액, 내부 승인 이력과 내부 메모를 포함하지 않는다.

## 지급과 입금 확인

공급사·와이즈샵 링크는 정산서 확정 → 증빙 확인 → 지급 요청 → 대표 승인 → 지급 완료 수동 확인 순서다. 셀러 결제창은 정산서 확정 → 증빙 확인 → 회사 입금 요청 → 셀러 전달 → 입금 확인 순서다.

## 계산 예시

상품 매출 3,136,000원, 배송비 60,000원, 총수수료율 25%, 셀러 수수료율 17%일 때 총수수료 784,000원, 셀러 수수료 533,120원, 벤더 수수료 250,880원, 공급대금 2,352,000원이다. 셀러 결제창 회사 입금액은 2,662,880원, 공급업체 지급액은 2,412,000원이며 차이 250,880원은 벤더 수수료와 일치한다.

추가 수수료 3%일 때 최종 셀러 수수료율은 20%, 셀러 수수료는 627,200원이다.

## localStorage

- `t3_company_os_seller_settlement_rules`: Campaign별 결제 방식, 수수료, 사업자·증빙 확인 정책
- `t3_company_os_seller_settlement_documents`: 외부 전달용으로 변환된 셀러 정산서
- `t3_company_os_payment_requests`: 지급·입금 요청, 승인 및 완료 상태

모든 접근은 `storageService`를 통한다. 기존 Settlement 키와 데이터는 유지한다.

## 실제 API 연결 전 확인

권한 분리, 승인 감사 로그, 계좌 암호화·마스킹, 지급 멱등성 키, 증빙 파일 보관, 세법 전문가 검토, 개인정보 보존·파기 정책, 실패 재처리와 대사 절차를 먼저 확정해야 한다.
