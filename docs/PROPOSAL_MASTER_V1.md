# Proposal Master V1

## 목적

공동구매 제안서 DB는 상품 마스터의 제품과 SKU를 조합해 영업 제안 자산을 만들고, 검수·복제·보관하며, 셀러에게 카카오톡으로 전달하기 쉬운 웹 제안서를 준비하는 내부 시스템이다. 제안서 전체를 셀러 포털이나 외부 공개 URL로 제공하지 않는다.

## 기존 스프레드시트 운영 방식

현재 운영 흐름인 `시철님이 스프레드시트 제작 → 원본 링크 공유 → 이미지 캡처 → 내부 게시판 업로드`를 유지한다. 웹 제안서는 이를 즉시 대체하지 않고 원본 스프레드시트 URL, 기존 캡처 이미지 URL, 최종 공유 이미지 URL과 내부 게시판 공유일을 함께 보관할 수 있다.

참고 XLSX가 제공되면 표시 항목과 구성 참고 자료로만 사용한다. 완전한 Excel 자동 변환은 V1 범위가 아니다.

## 공급처·브랜드·제품·SKU 관계

제안서는 공급처와 여러 브랜드를 참조하고 여러 `ProposalProductItem`을 가진다. 각 item은 하나의 Product와 하나 이상의 SKU ID를 참조한다.

```text
Vendor 1:N Brand 1:N Product 1:N ProductSku
Proposal N:M Product / ProductSku
```

선택 흐름은 공급처 → 브랜드 → 제품 → SKU다. 동일 브랜드의 여러 제품과 한 제품의 여러 SKU를 포함할 수 있다.

## 제안서 상품 snapshot

제품 추가 시 정상가, 공구가, 셀러 기본 수수료, 배송·샘플 안내, 이미지, 설명, SKU 선택, 상품 master version과 `capturedAt`을 `ProposalProductItem`에 복사한다. 내부 snapshot에는 공급가, 총·회사 수수료, 브랜드 PG, 링크 정책과 내부 정산 메모를 보존한다. 상품 마스터 변경은 기존 제안서를 자동 갱신하지 않는다.

제안서에서 가격 또는 셀러 수수료를 바꾸면 `priceOverridden`, `commissionOverridden`을 기록한다. 이 값은 Campaign의 실제 셀러 추가 PG 지급률을 의미하지 않으며 기존 Campaign·Settlement 계산식을 변경하지 않는다.

## 내부 정보와 공유 정보 분리

내부 편집 모델은 공급가, 총·회사 수수료, 브랜드 PG, 링크 가능 여부, 정산·내부 메모를 포함할 수 있다. 공유 미리보기는 `SharedProposalView` 허용 목록 변환을 거치며 다음만 포함한다.

- 브랜드, 제품명, 이미지와 구성
- 정상가, 공구가, 할인율, 셀러 수수료
- 배송·샘플 안내
- 전체·상품별 판매 포인트
- 담당 매니저 안내

공유 컴포넌트는 내부 `ProposalMaster` 또는 `internalSnapshot`을 받지 않는다.

## 셀러 공유용 레이아웃

기본은 1080px 세로형 페이지다.

1. 표지, 제목, 기준일과 대표 추천 상품
2. 이후 페이지의 2열 상품 카드(페이지당 최대 4개)
3. 마지막 배송·샘플·운영 안내와 담당자

상품이 늘어나면 한 페이지에서 축소하지 않고 상품 페이지를 추가한다. 정상가는 보조 정보로, 공구가는 가장 크게 강조한다.

## 원본 스프레드시트와 이미지

`spreadsheetUrl`은 기존 원본을 새 탭에서 여는 링크다. `previewImageUrls`는 기존 캡처 이미지, `sharedImageUrls`는 향후 웹 제안서에서 생성한 최종 공유 이미지를 보관한다. 실제 파일 저장을 연결할 때 private Storage 경로와 metadata로 교체한다.

## 이미지·PDF 내보내기

`ProposalExportService`는 PNG, PDF, 인쇄 계약을 제공한다. V1의 인쇄는 브라우저 인쇄를 사용한다. PNG/PDF는 무거운 라이브러리를 추가하지 않고 정확히 “기능 준비 중” 결과를 반환한다. 향후 브라우저 캔버스 또는 서버 렌더러 adapter로 교체한다.

## 제안서 복제

복제 시 새 proposal ID와 item ID를 생성하고 상태를 `draft`로 되돌린다. 상품 snapshot은 복사하지만 기존 캡처·최종 공유 이미지와 내부 게시판 공유일은 복사하지 않는다. `sourceProposalId`로 원본을 추적한다.

## 공구 일정 연결 계획

`proposalService.listCampaignReadyProposals()`는 공유 가능하고 Campaign 연결 준비가 된 제안서의 Product/SKU 선택 정보를 반환한다. 향후 셀러 → 제안서 → 실제 진행 Product/SKU → 일정 → Campaign snapshot 흐름에서 사용한다. 기존 Campaign 생성 화면은 V1에서 변경하지 않는다.

## 권한과 보안

- admin: 생성·수정·검수·미리보기·보관
- md: 생성·수정·미리보기
- team_lead: 조회·검수·미리보기
- manager: 조회·미리보기
- settlement: 조회·내부 정산 조건
- seller: 목록·편집·공유 미리보기 접근 금지

Route Guard는 seller portal 세션의 `/master/proposals` 직접 접근을 차단한다. `/master/proposals/:id/preview`도 인증된 내부 권한만 접근한다. 현재 local mock guard는 향후 Auth Role Provider와 Supabase RLS로 교체한다. 외부 공개 URL은 제공하지 않는다.

## 저장과 임시저장

제안서 편집은 각 proposal ID별로 1.2초 debounce 자동저장을 수행하고 저장 중·완료·실패와 마지막 저장 시간을 표시한다. 저장 전 이탈에는 브라우저 경고를 사용한다. Local mode는 `t3_company_os_proposal_masters`, Supabase mode는 `proposals` repository를 사용한다.
