export const DEFAULT_SROOKPAY_FEE_RATE = 3.08

export function calculateSrookPayFee(productNetSales: number, shippingRevenue: number, feeRate = DEFAULT_SROOKPAY_FEE_RATE) {
  const feeBase = Math.max(productNetSales, 0) + Math.max(shippingRevenue, 0)
  return Math.round(feeBase * Math.max(feeRate, 0) / 100)
}
