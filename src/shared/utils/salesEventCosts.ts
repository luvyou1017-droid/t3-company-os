import type { SalesDataImport, SalesEventCost } from '../types/salesData'

export function getSalesEventCosts(salesImport: SalesDataImport): SalesEventCost[] {
  if (salesImport.eventCosts?.length) {
    return salesImport.eventCosts.map((event) => ({
      ...event,
      name: event.name.trim(),
      unitPrice: event.unitPrice === undefined ? undefined : Math.max(Math.round(event.unitPrice), 0),
      companyUnitCost: event.companyUnitCost === undefined ? undefined : Math.max(Math.round(event.companyUnitCost), 0),
      quantity: event.quantity === undefined ? undefined : Math.max(Math.round(event.quantity), 0),
      supplierSupportRate: event.supplierSupportRate === undefined ? undefined : Math.min(Math.max(event.supplierSupportRate, 0), 100),
      amount: event.unitPrice !== undefined && event.quantity !== undefined
        ? Math.max(Math.round(event.unitPrice * event.quantity * (1 - (event.supplierSupportRate ?? 0) / 100)), 0)
        : Math.max(Math.round(event.amount), 0),
    }))
  }

  const legacyName = salesImport.eventName?.trim() ?? ''
  const legacyAmount = Math.max(Math.round(salesImport.eventDeductionAmount ?? 0), 0)
  if (!legacyName && !legacyAmount) return []

  return [{
    id: 'legacy',
    name: legacyName || '이벤트 비용',
    amount: legacyAmount,
    owner: salesImport.eventCostOwner ?? 'company',
  }]
}

export function getSalesEventCostTotal(salesImport: SalesDataImport) {
  return getSalesEventCosts(salesImport).reduce((sum, event) => sum + event.amount, 0)
}

export function getCompanySalesEventCostTotal(salesImport: SalesDataImport) {
  return getSalesEventCosts(salesImport)
    .filter((event) => !event.direction && (event.owner === 'company' || event.owner === 'company_manager_prepaid'))
    .reduce((sum, event) => sum + event.amount, 0)
}
