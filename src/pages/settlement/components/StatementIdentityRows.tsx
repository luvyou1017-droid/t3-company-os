import { useEffect, useState } from 'react'
import type { Campaign } from '../../../shared/types/campaign'
import type { SalesDataRow } from '../../../shared/types/salesData'
import type { ProductMaster } from '../../../features/productMaster/types'
import { productService } from '../../../features/productMaster/services/productService'
import { statementIdentity } from '../../../shared/utils/statementIdentity'
// Only fetch explicitly linked products; do not scan or fuzzy-match the master.
const reads = new Map<string, Promise<ProductMaster | null>>()
function readProduct(id: string) {
  let read = reads.get(id)
  if (!read) { read = productService.getProductById(id).catch(() => { reads.delete(id); return null }); reads.set(id,read) }
  return read
}
export function StatementIdentityRows({ campaign, rows = [], compact = false }: { campaign?: Campaign; rows?: SalesDataRow[]; compact?: boolean }) {
  return compact ? <tr><th>진행 공구</th><td>{statementIdentity(campaign, rows).campaignName}</td></tr> : <DetailedStatementIdentityRows campaign={campaign} rows={rows} />
}

function DetailedStatementIdentityRows({campaign,rows=[]}:{campaign?:Campaign;rows?:SalesDataRow[]}) {
  const [products,setProducts] = useState<ProductMaster[]>([])
  const ids = [...new Set([campaign?.productId,...rows.map(row=>row.productId)].filter((id):id is string=>!!id))].sort().join(',')
  useEffect(()=> { let active=true; setProducts([]); if(ids) void Promise.all(ids.split(',').map(readProduct)).then(items=>{if(active)setProducts(items.filter((item):item is ProductMaster=>!!item))}); return()=>{active=false} },[ids])
  const identity = statementIdentity(campaign,rows,products)
  return <><tr><th>진행 공구</th><td>{identity.campaignName}</td></tr><tr><th>브랜드</th><td data-statement-product-ids={ids}>{identity.brand}</td></tr><tr><th>공구 차수</th><td>{identity.round}</td></tr><tr><th>진행 물품</th><td>{identity.items}</td></tr></>
}

export async function waitForStatementIdentity(node: HTMLElement) {
  const ids = [...new Set(Array.from(node.querySelectorAll<HTMLElement>('[data-statement-product-ids]')).flatMap(element => (element.dataset.statementProductIds || '').split(',').filter(Boolean)))]
  await Promise.all(ids.map(readProduct))
  // Let the linked-name update render before image generation.
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
}
