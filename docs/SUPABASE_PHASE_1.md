# Supabase Phase 1

## 범위

1단계는 Campaign, Settlement/Payment Request, Payment Evidence와 기존 원천세 항목의 데이터 접근 기반만 준비한다. CS, Sample, Sales Data 전체 마이그레이션과 실제 은행·홈택스·AI API는 포함하지 않는다. 기존 계산식과 localStorage 데이터는 변경하거나 자동 삭제하지 않는다.

## 환경변수와 데이터 모드

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

두 값이 모두 있으면 `supabase`, 하나라도 없으면 `local` 모드다. 실제 key는 `.env.local`에만 두고 커밋하지 않는다. `src/shared/lib/supabase.ts`가 nullable client를 만들며 컴포넌트는 client를 직접 사용하지 않는다.

## 테이블

`SUPABASE_SCHEMA.sql`은 profiles, campaigns, settlements, seller_settlements, payment_requests, payment_request_batches, payment_evidence, withholding_tax_items, activity_logs를 만든다. 공통 version, metadata, 생성·수정 시각과 작업자 컬럼을 사용한다. 승인된 정산의 과거 계산은 `calculation_snapshot`과 source/version으로 보존한다.

현재 문자열 legacy ID는 마이그레이션 시 결정적 UUID로 변환하며 원본 객체와 legacy ID는 metadata에 보존한다.

## Storage

private bucket은 `payment-evidence`다. 경로는 다음 규칙을 사용한다.

```text
campaigns/{campaignId}/settlements/{settlementId}/{ownerType}/{ownerId}/{evidenceId}/{fileName}
```

PNG, JPEG, WebP, PDF만 허용하고 최대 크기는 10MB다. 미리보기는 public URL이 아니라 만료되는 signed URL을 사용한다.

## Repository 구조와 fallback

`src/shared/repositories`의 interface 아래에 Local/Supabase 구현을 둔다. 환경변수가 없으면 Local repository가 기존 storageService와 기존 key를 그대로 사용한다. Supabase 오류가 발생해도 기존 local 데이터는 삭제하지 않는다. 증빙 업로드는 Storage 업로드와 메타데이터 저장이 모두 성공한 경우에만 완료로 표시하고 실패 시 재시도할 수 있다.

## Migration 계획

`dataMigrationService`는 Local 건수, 원격 ID 중복과 신규 건수 미리보기, 영역별 명시적 migration 함수를 제공한다. 앱 시작 시 자동 migration하지 않는다. 개발 도구 카드에서도 미리보기와 연결 테스트만 제공한다.

권장 순서는 Campaign → Settlement → Payment Request → Payment Evidence → Withholding Tax다. 각 단계 후 건수, FK, 금액 snapshot, 상태와 감사 로그를 대조한다.

## RLS 주의사항

SQL에는 authenticated 조회, manager 담당 Campaign, settlement_cs 정산·증빙 처리, ceo 승인, admin 전체 관리 방향의 Phase 1 정책 초안이 있다. CEO 전용 승인 동작은 운영 전에 RPC 또는 Edge Function으로 강제해야 한다. 주석의 개발용 전체 허용 정책은 실제 데이터 투입 전에 반드시 제거한다. Storage도 private bucket과 역할 정책을 유지한다.

## 아직 연결하지 않은 기능

- CS, Sample, Sales Data repository/migration
- 실제 로그인·초대와 mock 사용자의 auth.users 연결
- 서버 측 승인 RPC와 activity log 자동 trigger
- 실제 은행, 홈택스, AI/OCR
- 실시간 구독, offline queue, 충돌 해결

## 운영 전 점검

- Supabase 프로젝트와 지역 선택
- SQL 검토 및 별도 개발 프로젝트에서 실행
- Auth 사용자 생성 후 profiles에 허윤정, 허수정, 배민성, 유시철, 김병희, 서주희, 고정원, 이규빈의 표시명·역할만 등록
- 실제 개인정보를 metadata나 브라우저 저장소에 넣지 않기
- RLS 역할별 테스트와 개발 정책 제거
- private Storage signed URL 만료·삭제·감사 정책 확인
- migration 미리보기, 백업, 샘플 migration, 금액 대사 후 전체 migration
- anon key만 클라이언트에 사용하고 service role key는 서버/Edge Function에만 보관

## Supabase 파일럿 테스트 절차

전체 마이그레이션 전에 개발 모드의 `Supabase 파일럿 테스트` 화면에서 별도 `testRunId`로 소량 연결을 확인한다.

1. 연결·로그인 세션·필수 테이블·private `payment-evidence` bucket 접근 확인
2. `[TEST]` Campaign, Settlement, Payment Request, Evidence metadata 순서로 생성
3. 사용자가 선택한 실제 파일을 `test-runs/{testRunId}/...` 경로에 업로드
4. 만료되는 signed URL로 이미지 또는 PDF 미리보기
5. 기존 원천세 계산 함수로 Withholding Tax Item 생성
6. Activity Log 생성 후 Repository 재조회와 FK 관계 확인
7. 동일 키 재실행 시 Payment Request와 Withholding Tax 중복 방지 확인
8. metadata 세 조건이 일치하는 현재 파일럿 데이터만 자식부터 정리

SQL은 자동 실행하지 않으며, 누락된 테이블은 SQL Editor에서 `docs/SUPABASE_SCHEMA.sql`을 사람이 검토한 뒤 적용한다. 상세 절차와 RLS 대응은 `docs/SUPABASE_PILOT.md`를 따른다.
