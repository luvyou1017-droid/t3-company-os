# Campaign Creation V2

## 목적과 등록 화면

공구 일정 등록은 정산 계산 화면이 아니라 Campaign 운영의 시작점이다. 기존 단계형 Wizard는 제거하고 한 페이지에서 아래로 스크롤하며 입력한다.

1. 셀러 및 상품 정보
2. 일정 및 담당자
3. 판매 링크 및 제안 조건
4. 이벤트
5. 최종 확인

정산은 Campaign 생성 이후 Campaign 상세의 정산 영역에서 수행한다.

상단 anchor navigation은 화면을 전환하지 않고 해당 섹션으로만 스크롤한다. 하단 고정 영역은 저장 상태, 필수값 누락 수, 최종 확인 이동, 오류 위치 이동과 일정 등록을 제공한다.

## 셀러·상품 연속 입력과 공동구매명

셀러, 사업자 유형, 브랜드 검색, 상품 다중 선택을 하나의 섹션에 연속 배치한다. 상품 선택 바로 아래에서 자동 공동구매명을 강조해 표시하며 상품 추가·삭제·순서 변경 시 즉시 다시 계산한다. MD/admin 권한의 기존 등록 흐름에서만 직접 수정 모드를 사용한다.

## 날짜·시간 표시

`formatDateWithWeekday`는 `YYYY-MM-DD`를 로컬 달력 날짜로 해석해 `2026-07-27 (월)` 형식으로 표시한다. 시작일, 종료일, 정산 예정일, 발표자 선정일과 최종 확인의 모든 날짜에 적용한다.

Campaign에는 선택 입력인 `linkOpenTime`, `linkCloseTime`을 저장한다. 값이 없으면 최종 확인에 `미입력`으로 표시한다.

## 공동구매명 자동 생성

`generateCampaignName`은 셀러와 선택 상품의 표시 순서를 사용한다.

- 단일 상품: `셀러명 × 브랜드명 상품명`
- 다중 상품: `셀러명 × 첫 번째 브랜드명 첫 번째 상품명 외 N종`

기본은 읽기 전용이다. 직접 수정 모드를 켠 뒤 상품이 바뀌면 자동 이름 복귀 여부를 확인한다.

## 브랜드·상품 선택과 다중 상품

Mock 상품 마스터 service가 브랜드 검색, 브랜드별 상품 조회와 정책 완성 여부를 제공한다. 컴포넌트는 localStorage나 Supabase를 직접 조회하지 않는다.

Campaign에는 `campaignProducts` 배열을 저장한다. 기존 `productId/productName`과 `brandId/brandName`은 표시 순서가 첫 번째인 대표 상품으로 계속 저장한다. 기존 Campaign은 읽을 때 단일 상품을 배열 한 건으로 보정하며 자동 마이그레이션하지 않는다.

## 사업자 유형

신규 화면은 `general_business`, `simplified_business`, `freelancer` 세 값만 표시한다. 기존 `corporation`, `sole_proprietor`, `individual_business`는 읽을 때 `general_business`로 보정한다. 기존 정산용 `businessType` 필드는 호환 표시값을 유지한다.

## 판매 링크 유형 통합

신규 화면은 `supplier_link`, `wise_shop_link`, `seller_checkout`만 입력받는다. 저장 시 기존 `linkOwner`와 `landingPageType`도 mapper로 채워 기존 목록과 상세 화면을 보호한다.

## 상품 제안 조건 snapshot

상품 선택 시 정상가, 공구가, 배송비, 공급가, 총 수수료율, 기본 셀러 수수료율, 추가 PG 지원율과 기타 조건을 불러온다. 최종 셀러 수수료율은 기본+추가 지원, 회사 수수료율은 총 수수료율-최종 셀러 수수료율이다.

Campaign 저장 시 `proposalSnapshots`에 값, 상품 master version과 capturedAt을 저장한다. 필수 정책이 빠진 상품은 저장을 차단한다. 이후 상품 마스터가 변경돼도 기존 snapshot은 변경하지 않는다.

## 셀러 제안서 미리보기

상품별 카드에 가격, 할인율, 배송비, 수수료, 예상 셀러 수익/개, 기간, 판매 링크와 메모를 표시한다.

```text
예상 셀러 수익 / 개 = 공구가 × 최종 셀러 수수료율
```

배송비에는 수수료를 적용하지 않는다. PDF 생성은 이번 범위에 포함하지 않는다.

## 정산 예정일

`calculateSettlementDueDate(endDate)`는 로컬 달력 날짜로 종료일에 21일을 더한다. 수동 수정 시 override를 저장하며, 종료일 변경 전에 자동 날짜 적용 여부를 확인한다. 자동 재설정 버튼을 제공한다.

## 발표자 선정일과 이벤트 기간

이벤트가 하나 이상이면 Campaign 공통 `winnerAnnouncementDate`를 표시한다. 기본값은 `calculateWinnerAnnouncementDate(endDate)`로 종료일 +7일이며 수동 수정 여부는 `winnerAnnouncementDateOverride`에 저장한다.

신규 이벤트 UI에서는 이벤트별 `startDate`, `endDate`를 입력하거나 저장하지 않는다. 기존 데이터 읽기 호환을 위해 두 필드는 deprecated optional 필드로 유지하며 자동 마이그레이션하거나 삭제하지 않는다.

## 이벤트 구조와 금액

Campaign은 여러 `campaignEvents`를 가진다. 부담 주체는 vendor, seller, company_support이며 이벤트 종류는 first_come, purchase_complete, try_it, other다.

```text
estimatedTotalAmount = rewardUnitPrice × plannedQuantity
confirmedTotalAmount = rewardUnitPrice × confirmedQuantity
```

대상 상품은 Campaign 선택 상품에서 고른다. 제공 상품은 master 선택 또는 직접 입력이며 master 단가를 수정하면 override 상태를 저장한다. 상단 합계는 부담 주체별로 분리한다.

최종 확인은 공통 label mapper로 사업자 유형, 판매 링크 유형, 이벤트 부담 주체와 이벤트 종류를 한글로 표시한다. 이벤트 카드에는 부담 주체, 종류, 대상·제공 상품, 수량, 단가와 예상 총금액을 표시하고 부담 주체별 합계 및 발표자 선정일을 함께 보여준다.

## Notion 연동 예정 구조

`CampaignImportProvider`가 preview/import 계약을 제공하고 현재는 `MockNotionCampaignImportProvider`만 사용한다. 실제 Notion API key는 브라우저에 두지 않고 향후 서버 또는 Supabase Edge Function adapter에서 처리한다. 자동 저장하지 않고 preview와 사용자 적용을 거친다.

## AI 초안 생성 예정 구조

Mock parser는 자연어에서 셀러, 브랜드, 상품 후보, 기간, 정산일, 판매 링크, 이벤트, confidence와 unresolvedFields를 반환한다.

```text
AI 초안 → 사용자 검토 → 상품 master 매칭 → 최종 적용 → 저장
```

실제 AI API는 연결하지 않는다.

## 기존 데이터 호환

- 단일 product → `campaignProducts` 한 건
- 기존 business type → 신규 3종 mapper
- linkOwner/landingPageType → salesChannelType mapper
- 신규 저장도 대표 단일 상품과 기존 수수료 필드를 함께 유지
- 기존 이벤트의 개별 기간 필드는 삭제하지 않고 신규 입력만 중단
- 신규 링크 시간과 Campaign 공통 발표자 선정일은 optional 필드로 추가
- 기존 Campaign 상세와 정산 계산식은 변경하지 않음
