type SupplyRecord = { supplyAudience?: 'seller' | 'vendor'; settlementVendorId?: string; settlementVendorName?: string }

export function resolveSupplyAudience(...sources: Array<SupplyRecord | undefined>): 'seller' | 'vendor' | 'unknown' {
  const explicit = new Set(sources.map(source => source?.supplyAudience).filter(Boolean))
  if (explicit.size > 1) return 'unknown'
  if (explicit.size === 1) return [...explicit][0]!
  // Settlement vendor is an explicit outbound counterparty. Names in parentheses,
  // supplier/brand names, and the absence of a vendor are not direction evidence.
  if (sources.some(source => source?.settlementVendorId || source?.settlementVendorName?.trim())) return 'vendor'
  return 'unknown'
}
