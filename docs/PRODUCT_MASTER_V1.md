# Product Master V1

## 목적

상품 마스터는 Campaign 등록 전에 반복 입력되는 상품 기본 조건을 한 곳에서 관리한다. 가격, 수수료, 판매 링크, 배송, 샘플 조건을 Campaign에 제공하되 Campaign에서 확정한 실제 조건과 사람의 판단을 대체하지 않는다.

## 필드 정의

- 식별: `id`, `productCode`, `brandId`, `brandName`, `productName`, `category`, `imageUrl`
- 가격: `regularPrice`, `salePrice`, `supplyPrice`, `shippingFee`, `freeShippingThreshold`
- 수수료: `totalCommissionRate`, `sellerCommissionRate`, `companyCommissionRate`
- 링크: `defaultSalesChannelType`, `wiseShopAvailable`, `sellerCheckoutAvailable`
- PG: `brandPgSupportAvailable`, `brandPgSupportRate`
- 배송: `courierName`, `jejuExtraFee`, `islandExtraFee`, `bundleShippingAvailable`, `orderDeadlineTime`
- 운영: `sampleSupportType`, `manufactureInfo`, `shelfLifeInfo`, `orderMemo`, `settlementMemo`, `internalMemo`
- 상태·이력: `active`, `createdAt`, `updatedAt`, `version`

## 가격 정책

금액은 원 단위 정수로 저장하고 화면에서는 `ko-KR` 원화로 표시한다. 할인율은 `(정상가 - 공구가) / 정상가`로 표시하며 공구가 대비 공급가 차액은 `공구가 - 공급가`이다. 배송비는 수수료 계산 대상이 아니며 가격 정보의 `shippingFee`를 배송 정책에서도 단일 기준값으로 사용한다.

## 수수료 정책

회사 수수료율은 `총 수수료율 - 셀러 기본 수수료율`로 계산한다. 저장 시 계산값을 사용하며 직접 입력값과 다르면 저장 전 경고한다. 기존 Campaign·Settlement 계산식은 변경하지 않는다.

## 링크 정책

기본 판매 링크는 공급사 링크, 와이즈샵 링크, 셀러 결제창 중 하나다. 공급사 링크는 기본 허용한다. 와이즈샵 링크를 기본값으로 저장하려면 `wiseShopAvailable`이 참이어야 하고, 셀러 결제창을 기본값으로 저장하려면 `sellerCheckoutAvailable`이 참이어야 한다. 두 가능 여부는 독립적으로 관리한다.

## PG 지원 구조

브랜드 PG 지원은 상품의 기본 조건이며 지원율은 1~5%다. 지원 없음이면 지원율을 저장하지 않는다. 이 값은 Campaign에서 셀러에게 실제 지급하는 추가 PG 수수료율과 같은 값으로 자동 처리하지 않는다.

## 배송 정책

택배사, 기본 배송비, 무료배송 기준, 제주·도서산간 추가 배송비, 합배송 가능 여부, 발주 마감 시간을 관리한다. 기본 배송비와 무료배송 기준은 가격 섹션의 필드를 재사용해 중복 저장하지 않는다.

## Campaign 연결

`productService.searchProductsByBrand`로 브랜드별 상품을 조회할 수 있다. 새 공구 일정 화면은 열릴 때 상품 마스터를 조회하고 `campaignProductCatalogService.registerProductMasters()`로 활성 상품을 기존 호환 카탈로그에 병합한다. Provider 조회에 실패하면 기존 카탈로그를 유지한다. 상품 선택 시 `createCampaignProductSnapshot`은 가격, 배송비, 수수료, 링크 가능 여부, 브랜드 PG 기본 조건, 배송 정책, 샘플 지원 여부를 반환한다.

## Snapshot 원칙

Campaign 저장 시 상품 마스터의 현재값과 `productMasterId`, `productMasterVersion`, `capturedAt`을 함께 snapshot으로 저장한다. 이후 상품 마스터가 수정되어도 이미 생성된 Campaign의 계산 및 확정 조건은 소급 변경하지 않는다. Campaign의 실제 셀러 추가 PG 지급률은 snapshot의 브랜드 지원율과 별도 필드로 유지한다.

## Repository와 Provider

화면은 `productService`만 호출한다. Supabase 환경변수가 없으면 `LocalProductRepository`가 `t3_company_os_product_masters`를 사용한다. 환경변수가 있으면 `SupabaseProductRepository`가 `product_masters` 테이블을 사용하도록 선택된다.

## 권한

- admin: 조회, 등록, 수정, 비활성화
- md: 조회, 등록, 수정
- settlement: 조회
- manager: 조회

화면 권한은 `getProductMasterPermission`의 capability 결과를 사용하도록 준비한다. 실제 로그인 Role Provider가 연결되면 이 capability에 현재 역할을 전달한다.

## CSV Import 예정 구조

V1에는 CSV 일괄등록을 구현하지 않는다. 다음 단계에서 다운로드 템플릿, 컬럼 매핑, 행 단위 검증, 중복 상품 코드 처리, dry-run 결과, 성공·실패 리포트, version 증가와 감사 로그를 Repository 위의 import service로 추가한다.

## Product hierarchy와 Seller Catalog 확장

기존 ProductMaster의 평면 가격·수수료·링크 필드는 Campaign 호환 기준값으로 유지한다. 신규 관계는 `Vendor 1:N Brand`, `Brand 1:N ProductMaster`, `ProductMaster 1:N ProductSku`다. SKU는 제품 상세 안에서 추가, 수정, 복제, 비활성화, 대표 지정하며 별도 사이드바 메뉴로 만들지 않는다.

정책은 공급처, 브랜드, 제품, SKU 순으로 상속하고 가장 가까운 하위 값을 사용한다. `resolveProductPolicy`는 각 결과에 `PolicySource`를 포함한다. SKU 선택 Campaign snapshot은 SKU ID·코드, 제품 버전, 캡처 시각, 해석된 정책값과 출처를 저장한다.

셀러 공개는 `sellerPortalVisible`과 `sellerPortalStatus`로 관리한다. 공개 데이터는 내부 ProductMaster를 직접 사용하지 않고 `SellerCatalogProduct`로 변환한다. 공급가, 내부 수수료, 브랜드 PG 조건, 정산·내부 메모와 공급처 연락처는 이 DTO에 존재하지 않는다. 상세 설계는 `PRODUCT_CATALOG_ARCHITECTURE.md`를 따른다.

향후 Proposal은 `vendorId`, `brandIds`, `productIds`, `skuIds`로 여러 제품과 SKU를 참조한다. Proposal은 내부 자산이며 카탈로그 전체 공개 대상이 아니다.
