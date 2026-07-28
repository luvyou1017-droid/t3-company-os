import type { ProductMaster } from './types'

const createdAt = '2026-07-28T00:00:00.000Z'

export const mockProductMasters: ProductMaster[] = [
  {
    id: 'product-test-001', productCode: 'TEST-PRD-001', brandId: 'brand-test-living', brandName: '[TEST] 리빙랩',
    productName: '[TEST] 올인원 밀폐용기 세트', category: '주방', regularPrice: 69000, salePrice: 39900,
    supplyPrice: 25500, shippingFee: 0, freeShippingThreshold: 0, totalCommissionRate: 25,
    sellerCommissionRate: 17, companyCommissionRate: 8, defaultSalesChannelType: 'wise_shop_link',
    wiseShopAvailable: true, sellerCheckoutAvailable: true, brandPgSupportAvailable: true, brandPgSupportRate: 4,
    courierName: 'CJ대한통운', jejuExtraFee: 3000, islandExtraFee: 5000, bundleShippingAvailable: true,
    orderDeadlineTime: '14:00', sampleSupportType: '지원 가능', active: true, testData: true,
    memo: 'TEST 개발용 상품', createdAt, updatedAt: createdAt, version: 1,
  },
  {
    id: 'product-test-002', productCode: 'TEST-PRD-002', brandId: 'brand-test-beauty', brandName: '[TEST] 클리어뷰티',
    productName: '[TEST] 수분 크림 듀오', category: '뷰티', regularPrice: 72000, salePrice: 45900,
    supplyPrice: 29000, shippingFee: 3000, freeShippingThreshold: 50000, totalCommissionRate: 27,
    sellerCommissionRate: 18, companyCommissionRate: 9, defaultSalesChannelType: 'wise_shop_link',
    wiseShopAvailable: true, sellerCheckoutAvailable: false, brandPgSupportAvailable: false,
    courierName: '한진택배', jejuExtraFee: 3000, islandExtraFee: 5000, bundleShippingAvailable: false,
    orderDeadlineTime: '12:00', sampleSupportType: '협의 필요', active: true, testData: true,
    memo: 'TEST 개발용 상품', createdAt, updatedAt: createdAt, version: 1,
  },
  {
    id: 'product-test-003', productCode: 'TEST-PRD-003', brandId: 'brand-test-food', brandName: '[TEST] 데일리푸드',
    productName: '[TEST] 단백질 쉐이크 14팩', category: '식품', regularPrice: 48000, salePrice: 34900,
    supplyPrice: 21000, shippingFee: 3000, totalCommissionRate: 24, sellerCommissionRate: 16,
    companyCommissionRate: 8, defaultSalesChannelType: 'supplier_link', wiseShopAvailable: false,
    sellerCheckoutAvailable: false, brandPgSupportAvailable: false, courierName: '롯데택배',
    jejuExtraFee: 3000, islandExtraFee: 5000, bundleShippingAvailable: true, orderDeadlineTime: '11:00',
    sampleSupportType: '지원 불가', active: true, testData: true, memo: 'TEST 개발용 상품',
    createdAt, updatedAt: createdAt, version: 1,
  },
]
