# 지급 증빙자료 MVP

## 사업자 유형별 필수 증빙

| 사업자 유형 | 추천·필수 자료 |
| --- | --- |
| 법인 | 세금계산서 캡처본 |
| 일반 개인사업자 | 세금계산서 캡처본 |
| 간이사업자 | 현금영수증 캡처본 |
| 개인 프리랜서 | 원천세 리스트 등록. 실제 신분·계좌 개인정보 파일은 저장하지 않음 |

사업자 유형은 추천값만 만든다. 정산 담당자가 최종 증빙 유형을 확정해야 한다.

## 셀러와 매니저 분리

증빙은 `settlementId + ownerType + ownerId`로 구분한다. 셀러 증빙 승인 상태가 매니저 증빙에 전파되지 않으며 지급요청도 각 소유자의 상태만 검증한다.

## 업로드와 검수

MVP는 파일명, MIME type, 크기, 업로드 담당자·시간과 임시 object URL만 저장한다. 파일 자체는 localStorage에 저장하지 않으므로 새로고침 뒤 미리보기가 사라질 수 있다.

상태는 `uploaded → review_pending → approved`이며 반려 시 `rejected`가 된다. 반려 사유는 필수이고 재업로드 뒤 다시 검수를 요청한다. 기본 검수 담당자는 허수정이다.

## 지급요청 차단

정산 확정, 사업자·증빙 유형 확인, 필수 증빙 업로드 및 승인, 지급 계좌 확인, 최종 지급액 계산 완료와 계산 오류 없음이 모두 필요하다. 프리랜서는 파일 대신 원천세 리스트 등록이 필수다.

## Supabase Storage 전환

`paymentEvidenceService`의 `PaymentEvidenceRepository` 구현을 Storage adapter로 교체한다. 이후 private bucket, signed URL, 권한, 감사 로그, 보존·파기 정책을 추가한다. UI와 `PaymentEvidence` 계약은 유지한다.
