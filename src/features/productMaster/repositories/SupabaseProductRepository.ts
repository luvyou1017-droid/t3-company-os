import type { SupabaseClient } from '@supabase/supabase-js'
import type { ProductMaster } from '../types'
import type { ProductRepository } from './productRepository'

export class SupabaseProductRepository implements ProductRepository {
  private client: SupabaseClient
  constructor(client: SupabaseClient) { this.client = client }
  private fromRow(row: Record<string, unknown>) { return { ...((row.metadata ?? row) as ProductMaster), id: String(row.id), version: Number(row.version ?? (row.metadata as ProductMaster)?.version ?? 1) } }
  private toRow(product: ProductMaster) {
    return {
      id: product.id,
      product_name: product.productName,
      category: product.category ? [product.category] : [],
      group_buy_price: product.salePrice,
      supply_price: product.supplyPrice,
      total_commission_rate: product.totalCommissionRate,
      seller_commission_rate: product.sellerCommissionRate,
      landing_page_url: product.productUrl || null,
      sample_policy: product.sampleSupportType || null,
      shipping_policy: product.shippingFee === 0 ? '무료배송' : `배송비 ${product.shippingFee}원`,
      active: product.active,
      version: product.version,
      metadata: product,
      created_at: product.createdAt,
      updated_at: product.updatedAt,
    }
  }
  async listProducts() {
    const { data, error } = await this.client.from('products').select('*').order('updated_at', { ascending: false })
    if (error) throw error
    return (data ?? []).filter((row) => {
      const metadata = row.metadata as Record<string, unknown> | null
      return Boolean(metadata?.productName && metadata?.brandId)
    }).map((row) => this.fromRow(row))
  }
  async getProductById(id: string) {
    const { data, error } = await this.client.from('products').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return data ? this.fromRow(data) : null
  }
  async createProduct(product: ProductMaster) {
    const { data, error } = await this.client.from('products').insert(this.toRow(product)).select().single()
    if (error) throw error
    return this.fromRow(data)
  }
  async updateProduct(product: ProductMaster, expectedVersion?: number) {
    if (expectedVersion !== undefined) {
      const { data, error } = await this.client.from('products').update(this.toRow(product)).eq('id', product.id).eq('version', expectedVersion).select().maybeSingle()
      if (error) throw error
      if (!data) throw new Error('다른 사용자가 상품을 변경했습니다. 다시 비교해주세요.')
      return this.fromRow(data)
    }
    const { data, error } = await this.client.from('products').upsert(this.toRow(product)).select().single()
    if (error) throw error
    return this.fromRow(data)
  }
  async deactivateProduct(id: string) {
    return this.setProductActive(id, false)
  }
  async setProductActive(id: string, active: boolean) {
    const product = await this.getProductById(id)
    if (!product) throw new Error('상품을 찾을 수 없습니다.')
    return this.updateProduct({ ...product, active, lifecycleStatus: active ? 'active' : 'inactive', updatedAt: new Date().toISOString(), version: product.version + 1 })
  }
  async searchProductsByBrand(brandId: string, query = '') {
    const products = await this.listProducts()
    const normalized = query.trim().toLowerCase()
    return products.filter((product) => product.brandId === brandId && (!normalized || `${product.productCode} ${product.productName}`.toLowerCase().includes(normalized)))
  }
}
