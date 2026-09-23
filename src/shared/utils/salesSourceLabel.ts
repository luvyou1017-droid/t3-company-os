import type { SalesDataImport } from '../types/salesData'
export function salesSourceLabel(source: SalesDataImport): string {
  if (source.sourceType === 'manual') return '수기 입력'
  if (source.fileOrigin === 'order_hub') return '발주모아'
  if (source.fileOrigin === 'srookpay') return '스룩페이'
  const format = source.fileAnalysis?.formatName ?? ''
  if (/발주모아|order.?hub/i.test(format)) return '발주모아'
  if (/스룩|srook/i.test(format)) return '스룩페이'
  if (source.fileAnalysis?.sourceDocumentType === 'supplier_settlement' || source.sourceType === 'brand-email') return '공급사 정산서'
  if (source.sourceType === 'file') return 'Excel 업로드'
  return '기타'
}
