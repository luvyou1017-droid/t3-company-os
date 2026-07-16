# CS 파일 업로드 계획

## Storage 버킷

- `cs-attachments`: private bucket
- 경로: `campaigns/{campaignId}/cs/{csCaseId}/{attachmentId}-{fileName}`

## 제한

- 이미지: jpg, jpeg, png, webp, 파일당 최대 10MB
- 영상: mp4, mov, webm, 파일당 최대 100MB
- CS 1건당 첨부 최대 5개
- 영상은 최대 1개

## 관계

- `cs_cases.id` 1건에 `cs_attachments` 여러 건을 연결한다.
- `cs_attachments.storage_path`에 private bucket path를 저장한다.

## 접근 방식

- 내부 직원만 signed URL로 접근한다.
- 외부 고객에게는 업로드 전용 signed URL 또는 Edge Function을 제공한다.
- signed URL은 짧은 만료 시간을 사용한다.

## 개인정보와 삭제

- 처리 완료 후 회사 정책에 따라 보관 기간을 둔다.
- 보관 기간 종료 시 `cs_attachments` 메타데이터와 Storage 파일을 함께 삭제한다.
- 고객 요청 삭제가 들어오면 CS 처리 상태와 법적 보관 필요 여부를 확인한다.
