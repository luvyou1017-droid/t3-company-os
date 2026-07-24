# Campaign별 셀러·매니저 지급요청 MVP

## Campaign별 지급 분리

한 Campaign과 Settlement에는 `seller`와 `manager` 지급요청이 독립적으로 존재한다. 요청 식별 기준은 `settlementId + recipientType + recipientId + sourceVersion`이다. 셀러 증빙과 매니저 증빙은 공유하지 않으며 한쪽의 승인·완료가 다른 쪽의 상태를 변경하지 않는다.

## 매니저별 지급 예정 리스트

지급 관리의 **매니저별 지급 예정** 탭은 선택한 매니저가 담당한 Campaign만 표시한다. 왼쪽은 담당 Campaign의 셀러 지급분을 확인하고, 오른쪽은 매니저 본인의 정산분을 선택한다.

셀러 지급분의 체크박스는 정산 담당자 권한을 유지하기 위해 비활성화한다. 매니저 지급분은 지급 가능 조건을 충족한 Campaign만 선택할 수 있다.

## 다중 선택과 일괄 지급요청

체크박스는 Campaign의 최종 지급액 전액을 선택한다. 부분 금액 요청과 분할지급은 MVP 범위에서 제외한다. 하단 sticky 요약은 선택 건수, 정산 총액, 소득세, 지방소득세, 총 원천징수액과 최종 요청액을 합산한다.

`선택 건 지급요청`은 선택된 모든 항목을 먼저 검증한 뒤 개별 `PaymentRequest`와 하나의 `PaymentRequestBatch`를 생성한다.

## 증빙 차단

- 법인·일반사업자: 세금계산서 캡처 승인
- 간이사업자: 현금영수증 캡처 승인
- 프리랜서: 원천세 리스트 등록
- 공통: 정산 확정, 증빙 유형 확정, 계좌 확인, 계산 오류 없음

차단된 행은 선택할 수 없고 이유를 함께 표시한다.

## 중복 요청 방지

같은 `settlementId + recipientType + recipientId + sourceVersion`의 요청이 `approval_pending`, `approved`, `sent`, `payment_completed`, `remittance_confirmed` 상태이면 다시 생성하지 않는다. `rejected`와 `on_hold`는 수정 후 재요청할 수 있다. 정산 버전이 바뀌면 새 `sourceVersion`으로 요청한다.

## 원천세 연결

프리랜서 매니저는 지급요청 전 원천세 리스트를 자동 upsert한다. 요청의 `withholdingTaxItemId`가 원천세 항목을 가리키며, 세액은 소득세 3%와 지방소득세 0.3%를 각각 10원 미만 절사한 뒤 합산한다.

## Batch 구조

`PaymentRequestBatch`는 batch ID, 매니저, 요청 ID·Campaign ID 배열, 건수, 정산 총액, 소득세, 지방소득세, 총 원천세, 최종 금액, 요청자·요청시각과 상태를 저장한다. localStorage 키는 `t3_company_os_payment_request_batches`다.

ID 형식은 `PAYMENT-BATCH-YYYY-0001`이며 한 Batch의 모든 요청에 같은 `batchRequestId`를 저장한다.

## 상태 흐름

매니저 지급은 `request_ready → approval_pending → approved → payment_completed` 순서다. 요청 상태는 Campaign과 Settlement의 `sellerPaymentRequestStatus` 또는 `managerPaymentRequestStatus`에 반영한다. 완료 시 각각의 완료 시각을 기록하며 셀러·매니저·회사 정산이 모두 완료된 경우에만 Settlement 최종 완료를 검토한다.
