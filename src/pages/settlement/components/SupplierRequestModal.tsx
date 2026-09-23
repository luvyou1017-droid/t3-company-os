import { SupplierPaymentEditor } from './SupplierPaymentEditor'
import { calculateSupplierPayment, type SupplierPayment } from '../../../shared/utils/supplierPayment'
import { useEffect, useRef, useState, type RefObject } from 'react'
import type { Campaign } from '../../../shared/types/campaign'
import type { SalesDataImport, SalesDataRow } from '../../../shared/types/salesData'
import type { SettlementDeduction } from '../../../shared/types/settlement'
import type { ProductMaster } from '../../../features/productMaster/types'
import { productService } from '../../../features/productMaster/services/productService'
import { campaignChannel } from '../../../shared/utils/uploadSettlementConditions'
import { supplierDocumentAmounts, supplierOffsetSummary } from '../../../shared/utils/supplierRequestDocument'
import { companySettlementProfile as company } from '../../../shared/data/companySettlementProfile'
import { formatCurrency as money } from '../../../shared/utils/salesData'

export function SupplierRequestModal({ source, rows, campaign, deductions, onClose, createPng, payment, preserveLegacy = false, onSavePayment }: {
  payment?: SupplierPayment; preserveLegacy?: boolean; onSavePayment?: (payment: SupplierPayment) => Promise<void>;
  createPng: (target: RefObject<HTMLDivElement | null>) => Promise<Blob>; source: SalesDataImport; rows: SalesDataRow[]; campaign?: Campaign; deductions: SettlementDeduction[]; onClose: () => void
}) {
  const exportRef = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const [products, setProducts] = useState<ProductMaster[]>([])
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close() }, [])
  useEffect(() => {
    let active = true
    const ids = [...new Set(rows.map(row => row.productId || campaign?.productId).filter((id): id is string => Boolean(id)))]
    void Promise.all(ids.map(id => productService.getProductById(id))).then(items => {
      if (active) setProducts(items.filter((item): item is ProductMaster => Boolean(item)))
    }).catch(() => { /* Missing reference data stays explicitly unknown. */ })
    return () => { active = false }
  }, [rows, campaign?.productId])
  const base = supplierDocumentAmounts(source, rows, campaignChannel(campaign, source), payment, preserveLegacy)
  const offset = base.supplierCollects || preserveLegacy ? supplierOffsetSummary(source, base.amount, base.supplierCollects) : { offset: 0, finalAmount: base.amount, needsReview: false }
  const supplierNames = [...new Set(products.map(p => p.vendorName).filter(Boolean))]
  const totalQuantity = rows.reduce((sum, row) => sum + Math.max(row.quantity - row.canceledQuantity - row.refundedQuantity, 0), 0)
  const totalSales = rows.reduce((sum, row) => sum + row.netSales, 0)
  const currency = (value: number | undefined) => value === undefined || !Number.isFinite(value) ? '확인 필요' : money(value)
  // Existing deductions have no supplier direction or already-included marker.
  // Showing them as references avoids inventing a sign or deducting twice.
  const ambiguous = (payment ? [] : deductions).filter(item => item.amount !== 0)
  const finalAmount = ambiguous.length ? undefined : offset.finalAmount
  const exportImage = async (copy: boolean) => {
    if (busy) return
    setBusy(true); setNotice('')
    try {
      if (copy && (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined')) throw new Error('이 브라우저에서는 이미지 복사를 지원하지 않습니다. PNG 저장을 이용해주세요.')
      const pending = createPng(exportRef)
      if (copy) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': pending })])
      } else {
        const url = URL.createObjectURL(await pending)
        const a = document.createElement('a'); a.href = url; a.download = '공급사_정산서.png'; a.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
      setNotice(copy ? '이미지를 복사했습니다.' : 'PNG를 저장했습니다.')
    } catch (error) { setNotice(error instanceof Error ? error.message : '이미지 생성 실패') }
    finally { setBusy(false) }
  }
  return <dialog ref={dialog} className="supplier-request-modal" aria-labelledby="supplier-request-title" onCancel={onClose}>
    <div className="section-heading"><h2 id="supplier-request-title">공급사 입금 요청용 정산서</h2><button type="button" className="secondary-button" onClick={onClose}>닫기</button></div>
    <div className="button-row"><button type="button" className="primary-button" disabled={busy} onClick={() => void exportImage(true)}>이미지 복사</button><button type="button" className="secondary-button" disabled={busy} onClick={() => void exportImage(false)}>PNG 저장</button></div>
    {notice && <p role="status">{notice}</p>}
    {onSavePayment && !base.supplierCollects && <SupplierPaymentEditor rows={rows} products={products} value={payment} onSave={onSavePayment} />}
    {!base.supplierCollects && !preserveLegacy && base.supply === undefined && <p role="alert">회사 실제 공급가 확인 필요</p>}
    <div ref={exportRef} className="supplier-external-document" style={{padding: 24, background: 'white'}}>
    <h2>공급사 정산서</h2>
    <p><strong>{base.supplierCollects ? '공급사 → 우리 회사 입금' : base.knownChannel ? '우리 회사 → 공급사 지급' : '입금 방향 확인 필요'}</strong></p>
    <dl><dt>공급사명</dt><dd>{supplierNames.join(', ') || '확인 필요'}</dd><dt>브랜드</dt><dd>{campaign?.brandName || '확인 필요'}</dd><dt>공구</dt><dd>{campaign?.campaignName || source.campaignId}</dd></dl>
    <div className="supplier-request-table"><table className="seller-document__table"><thead><tr><th>상품명</th><th>원본 옵션</th><th>세부옵션</th><th>정산 수량</th><th>판매가격</th><th>공급가격</th><th>판매금액</th></tr></thead><tbody>{rows.map(row => {
      const product = products.find(p => p.id === (row.productId || campaign?.productId))
      const sku = product?.skus.find(s => s.id === row.skuId)
      const details = Object.entries(sku?.optionValues ?? {}).map(([k,v]) => `${k}: ${v}`).join(' · ')
      const supplyPrice = !base.supplierCollects && !preserveLegacy ? calculateSupplierPayment(payment, rows).lines.find(line=>line.row.id===row.id)?.companySupplyPrice : row.settlementSupplyPrice ?? (row.totalCommissionRate === undefined ? undefined : Math.round(row.unitPrice * (1 - row.totalCommissionRate / 100)))
      return <tr key={row.id}><td>{row.productName || campaign?.productName || '확인 필요'}</td><td>{row.optionName}</td><td>{details || '—'}</td><td>{Math.max(row.quantity - row.canceledQuantity - row.refundedQuantity, 0)}</td><td>{currency(row.unitPrice)}</td><td>{currency(supplyPrice)}</td><td>{currency(row.netSales)}</td></tr>
    })}</tbody><tfoot><tr><th colSpan={3}>합계</th><td>{totalQuantity}</td><td colSpan={2}>총 판매금액</td><td>{currency(totalSales)}</td></tr></tfoot></table></div>
    {(!payment || base.supplierCollects) && <table className="seller-document__table"><tbody><tr><th>{base.supplierCollects ? '기본 입금 요청금액' : '공급사 지급 예정금액'}</th><td>{currency(base.amount)}</td></tr>{offset.offset !== 0 && <tr><th>공급사 전달 상계금액</th><td>−{currency(offset.offset)}</td></tr>}{!offset.offset && <tr><th>명시된 공급사 상계</th><td>없음</td></tr>}<tr className="manager-final-row"><th>{base.supplierCollects ? '최종 입금 요청금액' : '최종 공급사 지급금액'}</th><td><strong>{currency(finalAmount)}</strong></td></tr></tbody></table>}
    {payment && !base.supplierCollects && <table className="seller-document__table"><tbody><tr><th>회사 실제 공급가 기준 상품대금</th><td>{currency(base.supply)}</td></tr><tr><th>공급사 지급 배송비</th><td>{currency(base.shipping)}</td></tr><tr><th>기본 공급사 지급액</th><td>{currency(calculateSupplierPayment(payment,rows).base)}</td></tr>{payment.adjustments.map(item=><tr key={item.id}><th>{item.kind} · {item.memo}</th><td>{item.direction==='add'?'+':'−'}{currency(item.amount)}</td></tr>)}<tr><th>최종 공급사 지급액</th><td>{currency(finalAmount)}</td></tr></tbody></table>}
    <h3>회사 정보 및 입금계좌</h3><table className="seller-document__table"><tbody>
    <tr><th>회사명</th><td>{company.legalName}</td><th>대표자</th><td>{company.representativeName}</td></tr>
    <tr><th>사업자등록번호</th><td colSpan={3}>{company.businessRegistrationNumber}</td></tr>
    <tr><th>주소</th><td colSpan={3}>{company.businessAddress}</td></tr>
    <tr><th>세금계산서 발행 이메일</th><td colSpan={3}>{company.taxInvoiceEmail}</td></tr>
    <tr><th>회사 정산계좌</th><td colSpan={3}>{company.settlementBankName} {company.settlementBankAccount}<br />예금주: {company.settlementAccountHolder}</td></tr>
    </tbody></table></div>
    {offset.needsReview && <p role="alert">전달 금액·상계 기준 또는 입금 방향이 일치하지 않아 최종 금액 확인이 필요합니다.</p>}
    {ambiguous.length > 0 && <><h3>관리자 확인 · 외부 이미지에 제외</h3><p role="alert">아래 항목은 공급사 상계 여부·가감 방향·기반 금액에 이미 반영됐는지가 기록되어 있지 않습니다. 중복 차감을 방지하기 위해 최종 금액을 확정 표시하지 않습니다.</p><table className="seller-document__table"><thead><tr><th>항목</th><th>금액</th><th>기존 반영 상태</th></tr></thead><tbody>{ambiguous.map(item => <tr key={item.id}><td>{item.title}</td><td>{currency(item.amount)}</td><td>{item.reflected ? '기존 정산 반영' : '미반영'} · 공급사 상계 확인 필요</td></tr>)}</tbody></table></>}
  </dialog>
}
