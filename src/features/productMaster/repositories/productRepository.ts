import type { ProductMaster } from '../types'

export interface ProductRepository {
  listProducts(): Promise<ProductMaster[]>
  getProductById(id: string): Promise<ProductMaster | null>
  createProduct(product: ProductMaster): Promise<ProductMaster>
  updateProduct(product: ProductMaster): Promise<ProductMaster>
  deactivateProduct(id: string): Promise<ProductMaster>
  searchProductsByBrand(brandId: string, query?: string): Promise<ProductMaster[]>
}
