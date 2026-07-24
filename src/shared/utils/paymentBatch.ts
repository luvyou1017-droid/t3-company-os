export type PaymentBatchAmount = {
  grossAmount: number
  incomeTaxAmount: number
  localIncomeTaxAmount: number
  finalAmount: number
}

export function createPaymentBatchId(existingIds: string[], year = new Date().getFullYear()) {
  const max = existingIds.reduce((current, id) => {
    const match = id.match(/PAYMENT-BATCH-\d{4}-(\d+)$/)
    return Math.max(current, Number(match?.[1] ?? 0))
  }, 0)
  return `PAYMENT-BATCH-${year}-${String(max + 1).padStart(4, '0')}`
}

export function summarizePaymentBatch(items: PaymentBatchAmount[]) {
  const incomeTaxAmount = items.reduce((sum, item) => sum + item.incomeTaxAmount, 0)
  const localIncomeTaxAmount = items.reduce((sum, item) => sum + item.localIncomeTaxAmount, 0)
  return {
    itemCount: items.length,
    grossAmount: items.reduce((sum, item) => sum + item.grossAmount, 0),
    incomeTaxAmount,
    localIncomeTaxAmount,
    totalWithholdingTaxAmount: incomeTaxAmount + localIncomeTaxAmount,
    finalAmount: items.reduce((sum, item) => sum + item.finalAmount, 0),
  }
}

export function runPaymentBatchAssertions() {
  const uniqueSelection = [...new Set(['settlement-a', 'settlement-b', 'settlement-a'])]
  const summary = summarizePaymentBatch([
    { grossAmount: 100_000, incomeTaxAmount: 3_000, localIncomeTaxAmount: 300, finalAmount: 96_700 },
    { grossAmount: 200_000, incomeTaxAmount: 6_000, localIncomeTaxAmount: 600, finalAmount: 193_400 },
  ])
  const checks = {
    multipleSelection: uniqueSelection.length === 2,
    itemCount: summary.itemCount === 2,
    grossTotal: summary.grossAmount === 300_000,
    taxTotal: summary.totalWithholdingTaxAmount === 9_900,
    finalTotal: summary.finalAmount === 290_100,
    batchFormat: createPaymentBatchId([], 2026) === 'PAYMENT-BATCH-2026-0001',
    nextBatch: createPaymentBatchId(['PAYMENT-BATCH-2026-0001'], 2026) === 'PAYMENT-BATCH-2026-0002',
  }
  return { passed: Object.values(checks).every(Boolean), checks, summary }
}
