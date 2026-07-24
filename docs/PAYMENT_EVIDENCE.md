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

## 확대 미리보기

지급요청 상세와 증빙 검수 목록·상세의 썸네일을 선택하면 92vw × 92vh modal을 연다. PNG, JPEG, WebP는 화면 맞춤·확대·축소·원본 크기·90도 회전과 내부 스크롤을 제공하며 PDF는 브라우저 iframe으로 표시한다. 모바일에서는 전체 화면을 사용한다. 파일 자체를 저장하지 않는 MVP이므로 새로고침 뒤 object URL 미리보기가 사라질 수 있다.

## AI 1차 판독과 금액 비교

AI는 문서 유형, 발행 금액, 공급가액, 부가세, 발행일과 상호를 추출하고 정산 기준금액과의 `matched`, `mismatched`, `needs_review` 상태를 추천한다. 허용 오차는 현재 0원이며 원 단위 정수 금액을 비교한다.

- 법인·일반사업자: 세금계산서 합계금액과 부가세 포함 정산 기준금액 비교
- 간이사업자: 현금영수증 발행금액과 회사 정책상 부가세 제외 기준금액 비교
- 프리랜서: 원천세 계산 상태를 사용하며 기타 증빙은 수동 검수
- 셀러 결제창: 입금 요청액과 증빙의 의미가 다르므로 `manual_review`

현재 분석은 파일명의 `matched`, `mismatch`, `unclear`, `failed` 키워드로 재현 가능한 Mock 결과를 만든다. 실제 OCR·Vision API 결과가 아니다.

## 허수정 최종 승인과 예외 승인

AI 일치는 자동 승인이 아니며 지급요청 차단도 기존처럼 허수정의 최종 `approved` 상태를 기준으로 한다. 불일치 자료는 예외 승인 확인과 사유 입력 없이는 승인할 수 없다. 확인 필요·분석 실패 자료는 허수정이 직접 확인한 뒤 메모와 함께 승인 또는 반려한다. AI 결과와 사람의 검수 결과·예외 사유는 증빙별로 분리해 감사 이력에 남긴다.

## 실제 API 미연동

`EvidenceAiProvider` interface와 Mock provider만 사용한다. 실제 연동 시 브라우저에 API 키를 두지 않고 서버 또는 Supabase Edge Function이 Vision API를 호출한 뒤 구조화된 추출 결과만 클라이언트에 반환해야 한다.
