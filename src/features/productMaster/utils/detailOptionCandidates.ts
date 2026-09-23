import type { ProductSku } from '../types'

// Suggestions only. Never modify identity or persist until the operator accepts.
export function detailOptionCandidates(sku: Pick<ProductSku, 'optionName' | 'productName' | 'optionValues'>): Record<string, string> {
  if (Object.values(sku.optionValues ?? {}).some(value => value.trim())) return {}
  const text = `${sku.optionName} ${sku.productName ?? ''}`
  const result: Record<string, string> = {}
  const colors = text.match(/베이지|아이보리|화이트|블랙|민트|스카이|오렌지|핑크|그레이|네이비|브라운|블루|그린|옐로우|퍼플|레드|크림|카키|white|black|mint|beige|ivory|pink|gray|grey|navy/gi)
  if (colors) result['컬러'] = [...new Set(colors)].join(' / ')
  const sizes = text.match(/\b(?:XS|S|M|L|XL|XXL)\b|\d+(?:\.\d+)?\s*(?:cm|mm|ml|kg|리터|단)|소형|중형|대형/gi)
  if (sizes) result['사이즈'] = [...new Set(sizes)].join(' / ')
  const configuration = text.match(/\d+\s*(?:개입|매입|세트|개|매|입|팩|롤)/g)
  if (configuration) result['구성'] = [...new Set(configuration)].join(' / ')
  return result
}
