import { mockProductMasters } from '../mockData'
import type { ProductMaster } from '../types'
import type { ProductRepository } from './productRepository'

const STORAGE_KEY = 't3_company_os_product_masters'

export class LocalProductRepository implements ProductRepository {
  private read(): ProductMaster[] {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(mockProductMasters))
      return mockProductMasters
    }
    try {
      const storedProducts = JSON.parse(stored) as ProductMaster[]
      const byId = new Map(mockProductMasters.map((product) => [product.id, product]))
      storedProducts.forEach((product) => byId.set(product.id, { ...byId.get(product.id), ...product } as ProductMaster))
      const products = Array.from(byId.values()).map((product) => ({
        ...product,
        representativeImageUrl: product.representativeImageUrl ?? product.imageUrl,
        skus: product.skus ?? [],
        sampleAvailable: product.sampleAvailable ?? product.sampleSupportType === '지원 가능',
        sellerPortalVisible: product.sellerPortalVisible ?? false,
        sellerPortalStatus: product.sellerPortalStatus ?? 'closed',
      }))
      this.write(products)
      return products
    } catch { return mockProductMasters }
  }
  private write(products: ProductMaster[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(products)) }
  async listProducts() { return this.read() }
  async getProductById(id: string) { return this.read().find((product) => product.id === id) ?? null }
  async createProduct(product: ProductMaster) { this.write([product, ...this.read()]); return product }
  async updateProduct(product: ProductMaster) {
    this.write(this.read().map((candidate) => candidate.id === product.id ? product : candidate))
    return product
  }
  async deactivateProduct(id: string) {
    const product = await this.getProductById(id)
    if (!product) throw new Error('상품을 찾을 수 없습니다.')
    return this.updateProduct({ ...product, active: false, updatedAt: new Date().toISOString(), version: product.version + 1 })
  }
  async searchProductsByBrand(brandId: string, query = '') {
    const normalized = query.trim().toLowerCase()
    return this.read().filter((product) => product.brandId === brandId && (!normalized || `${product.productCode} ${product.productName}`.toLowerCase().includes(normalized)))
  }
}
