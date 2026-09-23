import type { SalesDataRow } from '../types/salesData'
export type SupplierPayment = {
  lines: Array<{ rowId: string; skuId?: string; quantity: number; companySupplyPrice?: number }>
  shipping: { seller?: number; company?: number; supplier?: number }
  adjustments: Array<{ id: string; kind: string; direction: 'add' | 'subtract'; amount: number; memo: string }>
  reviewedBy: string
  reviewedAt: string
}
export function calculateSupplierPayment(terms: SupplierPayment | undefined, rows: SalesDataRow[]) {
  const valid = (n: number | undefined): n is number => n !== undefined && Number.isFinite(n) && n >= 0
  const lines = rows.map(row => {
    const quantity = Math.max(row.quantity - row.canceledQuantity - row.refundedQuantity, 0)
    const saved = terms?.lines.find(line => line.rowId === row.id && line.skuId === row.skuId && line.quantity === quantity)
    return { row, quantity, companySupplyPrice: saved?.companySupplyPrice }
  })
  const supply = lines.length && lines.every(line => valid(line.companySupplyPrice)) ? lines.reduce((sum, line) => sum + Math.round(line.companySupplyPrice! * line.quantity), 0) : undefined
  const shipping = valid(terms?.shipping.supplier) ? terms.shipping.supplier : undefined
  const adjustments = terms?.adjustments ?? []
  const adjustment = adjustments.every(item => valid(item.amount) && ['add','subtract'].includes(item.direction)) ? adjustments.reduce((sum,item) => sum + item.amount * (item.direction === 'add' ? 1 : -1), 0) : undefined
  const base = supply !== undefined && shipping !== undefined ? supply + shipping : undefined
  return { lines, supply, shipping, base, adjustment, amount: base !== undefined && adjustment !== undefined ? base + adjustment : undefined }
}
