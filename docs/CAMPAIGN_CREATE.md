# Campaign Create Workflow

## 등록 폼 구조

새 일정 등록은 공동구매 일정 화면의 넓은 modal form에서 처리한다.

폼 섹션:

- 기본 정보
- 담당자
- 판매 일정
- 링크 및 사업자
- 수수료
- 정산
- 메모

필수값:

- 공동구매명
- 셀러
- 브랜드
- 상품
- 담당 매니저
- MD
- 시작일
- 종료일
- 링크 주체
- 사업자 유형
- 총수수료율
- 셀러 수수료율

## Campaign 생성 규칙

Campaign은 `campaignService.createCampaign()`으로만 생성한다.

컴포넌트는 localStorage를 직접 호출하지 않는다.

저장 필드:

- id
- campaignCode
- campaignName
- sellerId
- sellerName
- brandId
- brandName
- productId
- productName
- managerId
- managerName
- mdId
- mdName
- startDate
- endDate
- linkOwner
- businessType
- totalCommissionRate
- sellerCommissionRate
- settlementDueDate
- memo
- createdAt
- updatedAt

## campaignCode 생성 규칙

형식:

```text
CAMPAIGN-YYYY-NNNN
```

예시:

```text
CAMPAIGN-2026-0013
```

`campaignService.generateNextCampaignCode()`가 기존 Campaign 중 같은 연도의 가장 큰 번호를 찾고 다음 번호를 생성한다.

## 체크리스트 자동 생성

Campaign 생성 시 `COMPANY_PLAYBOOK.md`의 D-Day 흐름을 기준으로 기본 체크리스트를 생성한다.

체크리스트 저장 필드:

- campaignId
- title
- category
- dueDate
- assigneeId
- status
- createdAt

기한이 지난 항목은 `overdue` 상태로 저장한다.

## 담당자 배정

기본 배정 규칙:

- 샘플 및 링크 검수: Campaign 담당 매니저
- 브랜드사 링크 요청: 유시철 MD
- CS 확인: 허수정
- 판매 데이터 확인: 허수정
- 정산서 작성: 허수정
- 정산 검토: Campaign 담당 매니저
- 대표 승인: 허윤정

공통 사용자 옵션은 `src/shared/data/users.ts`에서 관리한다.

## My Work 연동

체크리스트 항목마다 Work Item을 자동 생성한다.

Work Item 필드:

- sourceType: checklist
- sourceId: checklistItemId
- campaignId
- title
- assigneeId
- dueAt
- priority
- status: pending
- relatedMenu

같은 `sourceId`를 가진 Work Item은 중복 생성하지 않는다.

## 알림 연동

Campaign 생성 시 다음 알림을 생성한다.

- 담당 매니저: 새 공동구매 일정이 등록되었습니다.
- 유시철 MD: 브랜드사 확인이 필요한 공동구매가 등록되었습니다.
- 허수정: 신규 공동구매 운영 일정이 생성되었습니다.

알림의 `relatedType`은 `campaign`, `relatedId`는 Campaign ID다.

알림을 클릭하면 Campaign 상세 페이지로 이동한다.

## 임시저장

임시저장은 `storageService`를 통해 별도 draft key에 저장한다.

모달을 다시 열면 임시저장된 작성 내용 복구 여부를 묻는다.

등록 완료 후 draft는 삭제한다.

## localStorage 구조

사용 키:

- `t3_company_os_campaigns`
- `t3_company_os_campaign_checklist_items`
- `t3_company_os_work_items`
- `t3_company_os_notifications`
- `t3_company_os_campaign_create_draft`

## Supabase 전환 시 교체할 부분

Supabase 연결 시 우선 교체 대상:

- `storageService`
- `campaignService.createCampaign`
- `campaignService.createDefaultChecklist`
- `campaignService.createWorkItemsFromChecklist`
- `campaignService.createCampaignNotifications`

화면 컴포넌트는 계속 service 계층만 호출한다.
