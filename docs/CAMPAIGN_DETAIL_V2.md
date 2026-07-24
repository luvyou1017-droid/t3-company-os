# Campaign Detail V2

## 목적

Campaign Detail V2는 공동구매 한 건에 연결된 일정, 업무, 파일, 소통, 샘플, CS, 판매 데이터, 정산과 변경 이력을 한 화면에서 확인하고 처리하는 Campaign 중심 운영 워크스페이스다.

정보량이 많은 업무 화면이므로 좁은 drawer 대신 전용 페이지를 사용한다. 화면 상단에는 현재 상태에서 가장 중요한 Primary 행동 하나를 제시하고, `오늘 해야 할 일`을 탭보다 먼저 노출한다.

## 전용 페이지 구조

1. Campaign 제목, 상태, 코드와 주요 담당자
2. 상태별 Primary 행동
3. D-Day, 업무, CS, 샘플, 판매 데이터, 정산, 매출 요약
4. 이 Campaign의 오늘 해야 할 일
5. 10개 상세 탭
6. 통합 활동·변경 이력

데스크톱 요약은 4열 grid를 사용하고, tablet은 2열, mobile은 1열과 카드형 테이블로 전환한다.

## 탭 구조

- 개요: 기본 정보, 현재/다음 단계, 핵심 업무, 담당자, 위험 신호, 최근 활동과 관련 링크
- 타임라인: Campaign 생성부터 판매 시작·종료, 저장된 운영 이벤트를 시간 순서로 표시
- 업무: Campaign의 체크리스트와 Work Item 조회, 필터, 생성, 완료
- 제안서·파일: 실제 파일을 저장하지 않고 메타데이터 등록·조회
- 소통: 브랜드사, 셀러, 내부 직원 소통과 후속 업무 기록
- 샘플: 실제 Sample 비용, 배송·수령·정산 반영 상태 조회
- CS: Campaign에 연결된 CS 상태 요약과 고객 연락처 마스킹 목록
- 판매 데이터: 업로드·검수·확정·정산 가능 상태와 매출 요약
- 정산: 기존 계산 결과, 증빙과 지급 상태 조회
- 이력: 업무, 파일, 소통 등 주요 변경 이력 통합 표시

## 오늘 업무

`workService`의 동일한 Work Item을 사용한다. 완료 처리는 `workService.completeWorkItem()`을 호출하므로 My Work에 즉시 반영된다.

우선 노출 대상은 다음과 같다.

- 오늘 또는 기한 초과
- 다음 3일 이내
- 긴급·차단 상태
- 담당자 미배정
- 검토 또는 승인 업무

## 타임라인과 이력

`campaignActivityService`는 Campaign별 구조화 이벤트를 저장한다. Campaign 생성, 판매 시작·종료 기본 이벤트에 파일 등록, 소통 기록, 업무 생성·완료 이벤트를 합쳐 표시한다.

이벤트 필드:

- `campaignId`
- `occurredAt`
- `actor`
- `eventType`
- `description`
- `relatedMenu`
- `relatedDataId`
- `before`, `after`, `memo`

## 파일 구조

`campaignFileService`는 파일 본문이 아닌 다음 메타데이터만 저장한다.

- 파일명, 유형, 업로드 일시·담당자
- 버전, 메모, 연결 단계
- 제안서 예상 샘플 수량·단가·부담자
- 총수수료율, 셀러 수수료율, 주요 판매 조건

Proposal의 샘플 값은 예상값이다. Settlement는 계속 `sampleService`의 실제 확정값만 사용하며 기존 정산 계산식은 변경하지 않는다.

## 소통 기록

`communicationService`는 채널, 대상, 작성자, 제목, 내용과 후속 업무 여부를 저장한다. 후속 업무가 필요한 경우 `workService.createCampaignWorkItem()`을 호출해 My Work에 같은 `campaignId`의 업무를 생성한다. 실제 카카오톡, 이메일 API는 연결하지 않는다.

## 기존 서비스 연동

- Campaign: `campaignService`
- Work Item: `workService`
- Sample: `sampleService`
- CS: `csService`
- Sales Data: `salesDataService`
- Settlement: `settlementService`
- 저장소: `storageService`
- 신규 활동: `campaignActivityService`
- 신규 파일 메타데이터: `campaignFileService`
- 신규 소통: `communicationService`

기존 데이터 타입과 키를 수정하거나 마이그레이션하지 않고, 없는 신규 필드는 화면에서 안전한 기본값으로 처리한다.

## localStorage 구조

기존 키를 유지하면서 다음 키만 추가한다.

- `t3_company_os_campaign_activities`
- `t3_company_os_campaign_files`
- `t3_company_os_communications`
- `t3_company_os_campaign_list_state`

모든 신규 하위 데이터는 `campaignId`를 필수로 가진다. 컴포넌트는 localStorage를 직접 호출하지 않는다.

## 라우팅 방식

전용 경로:

```text
/campaigns/:campaignId?tab=:tabId
```

탭 ID:

```text
overview, timeline, work, files, communications,
samples, cs, sales, settlement, history
```

History API와 `popstate`를 사용해 목록, 알림, My Work, CS, Sample, Sales Data, Settlement에서 관련 탭으로 이동한다. 목록 검색·필터·view tab·스크롤 위치는 `campaignListState`로 복원한다.

## Supabase 전환 시 교체할 부분

UI 컴포넌트는 유지하고 다음 service 구현을 Supabase repository 호출로 교체한다.

- `storageService`
- `campaignActivityService`
- `campaignFileService`
- `communicationService`
- 기존 Campaign, Work, Sample, CS, Sales Data, Settlement service의 persistence

파일 본문은 private Storage bucket에 저장하고 `campaignFileService`에는 storage path와 접근 제어 메타데이터를 추가한다. 고객 연락처와 CS 첨부는 권한·감사 로그가 적용된 별도 정책이 필요하다.

## 현재 mock 처리 기능

- 파일 업로드 본문, 다운로드, 미리보기
- 카카오톡, 이메일, 노션 API 연동
- 외부 접수 URL 배포 설정
- 결제·지급 실행
- Supabase persistence와 실시간 구독
- AI 위험 분석과 자동 분류

현재 MVP는 React + TypeScript + mock data + localStorage만 사용한다.
