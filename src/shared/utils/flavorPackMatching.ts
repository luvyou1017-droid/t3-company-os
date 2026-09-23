/** A pack is the priced SKU; flavour composition belongs to the order, never the SKU master. */
export function parseFlavorPack(raw: string) {
  const text = raw.replace(/^(?:제품선택|옵션|맛선택|구성)\s*:\s*/, '').trim()
  const pieces = [...text.matchAll(/(매운맛|순한맛)\s*(\d+)\s*개/g)]
  if (!pieces.length) return undefined
  const residue = text.replace(/(매운맛|순한맛)\s*\d+\s*개/g, '').replace(/딩동쭈꾸미|쭈꾸미|닭갈비/g, '').replace(/[\s+/,()[\]:-]/g, '')
  if (residue) return undefined
  const counts = pieces.map(p => Number(p[2]))
  if (counts.some(n => !Number.isSafeInteger(n) || n <= 0)) return undefined
  return { count: counts.reduce((a, b) => a + b, 0),
    detailOption: pieces.length === 1 ? pieces[0][1] : pieces.map(p => `${p[1]} ${Number(p[2])}개`).join(' + ') }
}
export function matchFlavorPack(raw: string, skuName: string, productContext = '', skuProductName = '') {
  const parsed = parseFlavorPack(raw)
  if (!parsed) return undefined
  const shortName = skuName.replace(/\s/g, '')
  const familyName = /쭈꾸미/.test(skuProductName) && !/닭갈비/.test(skuProductName) ? '딩동쭈꾸미' : /닭갈비/.test(skuProductName) && !/쭈꾸미/.test(skuProductName) ? '닭갈비' : ''
  const sku = (/^(1|3|5)개$/.test(shortName) ? familyName + shortName : shortName).match(/^(딩동쭈꾸미|쭈꾸미|닭갈비)(1|3|5)개$/)
  if (!sku || Number(sku[2]) !== parsed.count) return undefined
  const context = `${raw} ${productContext}`
  const chicken = context.includes('닭갈비'), octopus = /쭈꾸미/.test(context)
  if (chicken && octopus) return undefined
  const family = chicken ? '닭갈비' : '쭈꾸미'
  if (!sku[1].includes(family)) return undefined
  return parsed
}
