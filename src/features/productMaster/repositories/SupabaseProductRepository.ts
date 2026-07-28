import type { SupabaseClient } from '@supabase/supabase-js'
import type { ProductMaster } from '../types'
import type { ProductRepository } from './productRepository'

export class SupabaseProductRepository implements ProductRepository {
  private client: SupabaseClient
  constructor(client: SupabaseClient) { this.client = client }
  private fromRow(row: Record<string, unknown>) { return (row.metadata ?? row) as ProductMaster }
  private toRow(product: ProductMaster) {
    return { id: product.id, product_code: product.productCode, brand_id: product.brandId, active: product.active, metadata: product, created_at: product.createdAt, updated_at: product.updatedAt }
  }
  async listProducts() {
    const { data, error } = await this.client.from('product_masters').select('*').order('updated_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map((row) => this.fromRow(row))
  }
  async getProductById(id: string) {
    const { data, error } = await this.client.from('product_masters').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return data ? this.fromRow(data) : null
  }
  async createProduct(product: ProductMaster) {
    const { data, error } = await this.client.from('product_masters').insert(this.toRow(product)).select().single()
    if (error) throw error
    return this.fromRow(data)
  }
  async updateProduct(product: ProductMaster) {
    const { data, error } = await this.client.from('product_masters').upsert(this.toRow(product)).select().single()
    if (error) throw error
    return this.fromRow(data)
  }
  async deactivateProduct(id: string) {
    const product = await this.getProductById(id)
    if (!product) throw new Error('상품을 찾을 수 없습니다.')
    return this.updateProduct({ ...product, active: false, updatedAt: new Date().toISOString(), version: product.version + 1 })
  }
  async searchProductsByBrand(brandId: string, query = '') {
    const products = await this.listProducts()
    const normalized = query.trim().toLowerCase()
    return products.filter((product) => product.brandId === brandId && (!normalized || `${product.productCode} ${product.productName}`.toLowerCase().includes(normalized)))
  }
}
