import type { Settlement } from '../types/settlement'
import type { Campaign } from '../types/campaign'

export const referenceBands = [
  { min: 0, max: 10_000_000, label: '1천만원 미만' },
  { min: 10_000_000, max: 20_000_000, label: '1천만~2천만원 미만' },
  { min: 20_000_000, max: 30_000_000, label: '2천만~3천만원 미만' },
  { min: 30_000_000, max: 50_000_000, label: '3천만~5천만원 미만' },
  { min: 50_000_000, max: 100_000_000, label: '5천만~1억원 미만' },
  { min: 100_000_000, max: Infinity, label: '1억원 이상' },
] as const
export const referenceBandIndex = (amount: number) => referenceBands.findIndex((band) => amount >= band.min && amount < band.max)

export function buildSalesReferences(settlements: Settlement[], campaigns: Campaign[], isConfirmed: (settlement: Settlement) => boolean) {
  const campaignMap = new Map(campaigns.map((campaign) => [campaign.id, campaign]))
  const latest = new Map<string, Settlement>()
  // Pick the latest record before checking eligibility: never resurrect an older confirmation.
  for (const settlement of settlements) {
    const previous = latest.get(settlement.campaignId)
    if (!previous || settlement.updatedAt > previous.updatedAt || (settlement.updatedAt === previous.updatedAt && settlement.settlementVersion > previous.settlementVersion)) latest.set(settlement.campaignId, settlement)
  }
  return [...latest.values()].flatMap((settlement) => {
    const campaign = campaignMap.get(settlement.campaignId)
    const amount = settlement.calculationSnapshot?.netSales
    if (!campaign || settlement.status === 'canceled' || settlement.hasSourceChanged || !isConfirmed(settlement) || amount === undefined || !Number.isFinite(amount) || amount <= 0) return []
    return [{ id: settlement.id, campaignId: campaign.id, campaignName: campaign.campaignName, seller: campaign.sellerName, product: campaign.productName, brand: campaign.brandName, startDate: campaign.startDate, endDate: campaign.endDate, amount, band: referenceBandIndex(amount), confirmedAt: settlement.settlementConfirmedAt ?? settlement.updatedAt }]
  }).sort((a, b) => b.endDate.localeCompare(a.endDate) || b.amount - a.amount)
}
