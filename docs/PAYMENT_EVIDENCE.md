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

## 업로드와 검수 위치

증빙 업로드와 재업로드는 셀러 또는 매니저의 지급요청 상세에서 수행한다. 검수 요청된 자료는 `/payments?tab=evidence-review`의 허수정 담당자 전용 목록에 표시되며, 행을 선택하면 `/payments/evidence-review/:evidenceId`의 넓은 검수 상세를 연다.

## 허수정 검수 흐름

현재 mock 사용자 중 `u-002` 허수정 정산 담당자를 기본 검수자로 사용한다. 검수 요청 시 `review_pending`이 되고 허수정이 승인하면 `approved`, 반려하면 필수 사유와 함께 `rejected`가 된다. 승인 시 `reviewedBy`, `reviewedAt`, `reviewStatus`, `reviewMemo`를 저장하고 반려 시 `rejectionReason`도 저장한다.

## Revision 관리

반려 후 재업로드는 기존 파일을 삭제하거나 덮어쓰지 않는다. 새 `PaymentEvidence`에 증가한 `revision`과 `previousEvidenceId`를 저장하며 검수 상세에서 이전 revision의 상태와 처리 이력을 확인한다.

## 알림과 My Work

`증빙 검수 요청` 시 허수정에게 “새 증빙자료 검수 요청이 도착했습니다.” 알림을 만들고 `sourceType = payment_evidence`, `sourceId = evidenceId`인 Work Item을 생성한다. 동일 evidence ID의 Work Item은 중복 생성하지 않는다. 알림과 My Work의 관련 링크는 해당 증빙 검수 상세로 연결한다.

## 뒤로가기와 진입 출처

지급요청·증빙 검수 상세 진입 시 History state에 `from`과 `label`을 기록한다. 뒤로가기는 이 출처 경로, 브라우저 history, 지급 요청 기본 탭 순서로 fallback한다. 지급 화면의 탭과 스크롤 위치는 업무 데이터와 분리해 sessionStorage에 보관한다.
