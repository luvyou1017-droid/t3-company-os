# Supabase 파일럿 연결 테스트

## 목적

전체 운영 데이터 마이그레이션 전에 소량의 명확한 테스트 데이터로 Database, RLS, private Storage, signed URL과 도메인 연결을 확인한다. 파일럿 성공은 운영 모드 전환을 의미하지 않는다.

## 사전 준비와 환경변수

`.env.local`에 브라우저 공개가 허용된 anon key만 설정한다.

```env
VITE_SUPABASE_URL=https://PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=...
```

`service_role` key는 브라우저와 Vite 환경변수에 절대 넣지 않는다. 두 변수가 모두 없거나 하나라도 빠지면 앱은 기존 Local 모드로 동작한다.

## SQL 적용 방법

앱은 SQL을 자동 실행하지 않는다. 별도 개발 Supabase 프로젝트의 SQL Editor에서 `docs/SUPABASE_SCHEMA.sql`을 사람이 검토한 후 실행한다. 개발 도구의 테이블 접근 테스트에서 누락을 확인할 수 있다.

필수 테이블은 profiles, campaigns, settlements, seller_settlements, payment_requests, payment_request_batches, payment_evidence, withholding_tax_items, activity_logs다.

## Storage bucket 준비

`payment-evidence` bucket은 private으로 유지한다. SQL의 bucket 설정과 authenticated 최소 권한 정책을 검토한다. public bucket이나 anon 전체 쓰기 정책으로 바꾸지 않는다.

## 실행 단계

1. `[TEST]` Campaign 생성
2. 기존 계산 snapshot을 사용하는 Settlement 생성
3. 셀러 Payment Request 생성
4. Evidence 메타데이터 생성
5. 사용자가 선택한 실제 파일을 private Storage에 업로드
6. 15분 만료 signed URL 생성 및 미리보기
7. 기존 `calculateWithholding`을 사용하는 프리랜서 원천세 항목 생성
8. Activity Log 생성
9. 각 Repository로 다시 조회
10. Campaign → Settlement → Payment → Evidence/Withholding 연결 및 중복 검증

각 단계는 개별 재실행할 수 있다. 파일을 선택하지 않으면 5단계는 건너뜀으로 기록되며 성공으로 처리하지 않는다.

## 테스트 데이터 구조

모든 도메인 객체에 다음 metadata를 포함한다.

```json
{
  "isTestData": true,
  "source": "supabase-pilot",
  "testRunId": "..."
}
```

Campaign 이름과 사용자 표시값에도 `[TEST]` 접두사를 사용한다.

## Storage 경로와 signed URL

```text
test-runs/{testRunId}/campaigns/{campaignId}/settlements/{settlementId}/{evidenceId}/{fileName}
```

PNG, JPEG, WebP, PDF만 허용하며 최대 10MB다. DB에는 bucket/path와 파일 metadata만 저장한다. private 파일은 public URL 대신 만료되는 signed URL로 이미지 또는 PDF를 미리 본다. 새로고침 후 DB metadata를 다시 조회하고 signed URL을 새로 만든다.

## 중복 방지

- Payment Request: settlement_id + recipient_type + recipient_id + source_version
- Withholding Tax: payment_request_id + owner_id + source_version

재실행 시 기존 항목을 조회하여 재사용하고 결과를 `duplicate`로 표시한다.

## 파일럿 데이터 정리

삭제 전 확인창을 표시한다. 현재 testRunId에 대해 `isTestData=true`, `source=supabase-pilot`, `testRunId`가 모두 일치하는 레코드만 삭제한다.

삭제 순서는 Activity Log → Withholding Tax → Payment Evidence metadata → Storage 파일 → Payment Request → Settlement → Campaign이다. metadata가 불일치하면 삭제하지 않고 항목별 결과에 보고한다.

## RLS 오류 대응

프론트엔드 역할과 RLS는 별개다. 권한 오류가 나면 profiles의 auth 사용자 매핑과 현재 역할에 필요한 테이블별 select/insert/update/delete 정책을 확인한다. anon 전체 수정이나 authenticated 전체 허용 정책을 자동 추가하지 않는다. 운영 전에는 승인 작업을 RPC 또는 Edge Function으로 강제하는 방안을 검토한다.

## 운영 데이터 보호

- 전체 localStorage 자동 이전 금지
- 기존 Mock 데이터 삭제 금지
- SQL 자동 실행 금지
- production 데이터 자동 생성 금지
- 파일럿 실패를 Local 저장 성공으로 대체 금지
- service_role key 브라우저 사용 금지

## 성공 기준

필수 테이블과 private bucket 접근, 10개 단계, 실제 파일 업로드, signed URL, 재조회, 관계 검증, 중복 방지와 파일럿 한정 정리가 모두 통과해야 한다.

## 아직 하지 않는 작업

전체 마이그레이션, 실제 사용자 로그인 강제, 서비스 전체 Supabase 전환, 은행·홈택스·AI 연동, production 데이터 생성은 하지 않는다.
