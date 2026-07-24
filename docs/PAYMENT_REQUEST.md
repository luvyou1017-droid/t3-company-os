# 지급·입금 요청

## 목적

확정된 셀러 정산을 실제 송금 전 운영 흐름으로 연결한다. MVP는 localStorage 상태 관리와 수동 완료 체크만 제공하며 실제 자금 이동은 하지 않는다.

## 요청 방향

- `company_to_seller`: 공급사 링크 또는 와이즈샵 링크의 회사 → 셀러 지급
- `seller_to_company`: 셀러 결제창의 셀러 → 회사 입금

정산서, 요청, Campaign은 각각 `settlementId`, `campaignId`, `sellerId`로 연결한다.

## 승인과 완료 흐름

회사 → 셀러는 증빙 확인 후 `approval_pending`으로 요청하고, 대표 승인 후 `approved`, 담당자의 지급 완료 수동 체크 후 `payment_completed`가 된다.

셀러 → 회사는 증빙 확인 후 `request_ready`, 셀러 전달 후 `sent`, 실제 입금 확인 후 `remittance_confirmed`가 된다. 입금 요청액은 증빙 요청 금액과 별도 필드로 저장한다.

## 상태

| 상태 | 의미 |
| --- | --- |
| `draft` | 요청 초안 |
| `evidence_pending` | 증빙 최종 확인 대기 |
| `request_ready` | 지급·입금 요청 생성 가능 |
| `approval_pending` | 대표 승인 대기 |
| `approved` | 승인 완료, 지급 예정 |
| `sent` | 셀러에게 입금 요청 전달 |
| `payment_completed` | 회사 → 셀러 지급 수동 확인 완료 |
| `remittance_confirmed` | 셀러 → 회사 입금 확인 완료 |
| `on_hold` | 사유가 있는 보류 |
| `rejected` | 반려 |

## 실제 은행 이체 연동 시 교체할 부분

`paymentRequestService`의 승인 이후 실행 부분을 은행 지급 어댑터로 교체한다. 요청 데이터와 UI 계약은 유지하고, 멱등성 키, 계좌 검증, 승인 권한, 웹훅 서명, 실패·재시도, 거래 원장과 일일 대사를 추가한다. 홈택스·증빙 API는 지급 실행과 분리된 어댑터로 연결한다.
