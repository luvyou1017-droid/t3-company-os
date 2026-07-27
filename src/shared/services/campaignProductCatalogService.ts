import type { ProductMaster } from '../types/campaignCreation'

const products: ProductMaster[] = [
  { id: 'prd-lock-001', brandId: 'brand-locknlock', brandName: '락앤락', productName: '밀폐용기 6종 세트', regularPrice: 69000, salePrice: 39900, shippingAmount: 0, supplyPrice: 25500, totalCommissionRate: 25, sellerCommissionRate: 17, extraPgSupportRate: 2, notes: '무료배송 · 색상 혼합 구성', version: 3 },
  { id: 'prd-lock-002', brandId: 'brand-locknlock', brandName: '락앤락', productName: '메트로 텀블러', regularPrice: 42000, salePrice: 29900, shippingAmount: 3000, supplyPrice: 19000, totalCommissionRate: 24, sellerCommissionRate: 16, extraPgSupportRate: 1, notes: '배송비에는 수수료 미적용', version: 2 },
  { id: 'prd-lock-003', brandId: 'brand-locknlock', brandName: '락앤락', productName: '비스프리 모듈러', regularPrice: 89000, salePrice: 54900, shippingAmount: 0, supplyPrice: 36000, totalCommissionRate: 26, sellerCommissionRate: 18, extraPgSupportRate: 0, notes: '4개 구성', version: 1 },
  { id: 'prd-fit-001', brandId: 'brand-fit', brandName: 'Fit Table', productName: '단백질 쉐이크', regularPrice: 48000, salePrice: 34900, shippingAmount: 3000, supplyPrice: 21000, totalCommissionRate: 25, sellerCommissionRate: 17, extraPgSupportRate: 0, notes: '초코·곡물 옵션', version: 4 },
  { id: 'prd-lumi-001', brandId: 'brand-lumi', brandName: 'Lumi Skin', productName: '수분 크림 세트', regularPrice: 72000, salePrice: 45900, shippingAmount: 0, supplyPrice: 29000, totalCommissionRate: 27, sellerCommissionRate: 18, extraPgSupportRate: 2, notes: '2개 세트', version: 2 },
  { id: 'prd-missing-001', brandId: 'brand-demo', brandName: '정책 미등록 브랜드', productName: '수수료 미등록 상품', regularPrice: 30000, salePrice: 20000, shippingAmount: 3000, supplyPrice: 15000, notes: '수수료 정책 등록 필요', version: 1 },
]
let recentBrandIds: string[] = []

export const campaignProductCatalogService = {
  listBrands() {
    return Array.from(new Map(products.map((product) => [product.brandId, { id: product.brandId, name: product.brandName }])).values())
  },
  searchBrands(query: string) {
    const normalized = query.trim().toLowerCase()
    return this.listBrands().filter((brand) => !normalized || brand.name.toLowerCase().includes(normalized))
  },
  getRecentBrands() {
    const brands = this.listBrands()
    return recentBrandIds.map((id) => brands.find((brand) => brand.id === id)).filter((brand): brand is { id: string; name: string } => Boolean(brand))
  },
  rememberBrand(brandId: string) {
    recentBrandIds = [brandId, ...recentBrandIds.filter((id) => id !== brandId)].slice(0, 3)
  },
  listProductsByBrand(brandId: string, query = '') {
    const normalized = query.trim().toLowerCase()
    return products.filter((product) => product.brandId === brandId && (!normalized || product.productName.toLowerCase().includes(normalized)))
  },
  getProduct(productId: string) { return products.find((product) => product.id === productId) },
  hasCompletePolicy(productId: string) {
    const product = this.getProduct(productId)
    return Boolean(product && product.totalCommissionRate && product.sellerCommissionRate !== undefined && product.extraPgSupportRate !== undefined)
  },
}
