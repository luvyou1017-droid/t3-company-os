# CS Supabase 전환 계획

## 목표

현재 localStorage 기반 CS MVP를 Supabase DB와 Storage로 교체한다.

## 필요한 테이블

- `campaigns`: 공동구매 기본 정보, campaignCode, 링크 주체, 담당자
- `cs_cases`: CS 본문, 고객 입력값, 상태, 우선순위, 담당자, 처리 기한
- `cs_attachments`: 첨부 파일 메타데이터, storage path, 검수 정보
- `cs_activity_logs`: 접수, 상태 변경, 답변, 담당자 변경, 처리 완료 이력
- `work_items`: My Work 자동 생성 업무
- `notifications`: 내부 알림 및 읽음 상태
- `users`: 직원, 역할, 권한

## 전환 원칙

- 주문번호 컬럼은 만들지 않는다.
- 고객 연락처는 접근 권한을 제한한다.
- CS 생성, 업무 생성, 알림 생성을 하나의 트랜잭션 또는 Edge Function 흐름으로 묶는다.
- 첨부 파일은 DB에 저장하지 않고 Storage path만 저장한다.
