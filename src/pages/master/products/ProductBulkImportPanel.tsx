import { useState } from 'react'
import { productService } from '../../../features/productMaster/services/productService'
import type { ProductMaster } from '../../../features/productMaster/types'
import { inferProposalProductName, parseWiseProposalFile } from '../../../features/productMaster/utils/wiseProposalParser'
import { applyReviewed, reviewBatch, sourceOption, type Candidate, type ReviewCandidate, type ReviewState } from '../../../features/productMaster/utils/proposalImportReview'
import { ensureProposalSupplier, reviewProposalSupplier } from '../../../features/productMaster/services/proposalSupplierService'

const errorText = (error: unknown) => error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error)
const states: ReviewState[] = ['기존', '신규', '조건변경', '확인필요']
export function ProductBulkImportPanel({ onClose, onDone }: { existingProducts: ProductMaster[]; onClose: () => void; onDone: () => Promise<void> }) {
  const [vendorMode, setVendorMode] = useState(false)
  const [vendorName, setVendorName] = useState('')
  const [candidates, setCandidates] = useState<ReviewCandidate[]>([])
  const [reading, setReading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const readFiles = async (files?: FileList | null) => {
    if (!files?.length) return
    if (vendorMode && !vendorName.trim()) { setMessage('정산 벤더명을 먼저 입력해주세요.'); return }
    setReading(true); setMessage(''); setCandidates([])
    try {
      const products = await productService.listProductsForImport()
      const inputs: Candidate[] = []
      const failures: ReviewCandidate[] = []
      for (const file of Array.from(files).slice(0, 250)) {
        const key = crypto.randomUUID()
        try {
          const parsed = await parseWiseProposalFile(file)
          const supplierReview = reviewProposalSupplier(parsed.metadata)
          inputs.push({ key, fileName: file.name, productName: inferProposalProductName(parsed.rows, file.name, parsed.metadata.brandName), rows: parsed.rows, metadata: parsed.metadata, vendorId: supplierReview.status === 'existing' ? supplierReview.supplier.id : undefined, supplierIssue: supplierReview.status === 'review' ? supplierReview.reason : undefined, settlementVendorName: vendorMode ? vendorName.trim() : undefined })
        } catch (error) {
          failures.push({ key, fileName: file.name, productName: '-', rows: [], metadata: { brandName: '-', vendorName: '-', productUrl: '', shippingFee: 0, courierName: '', sampleSupportType: '', draft: false }, items: [], error: errorText(error) })
        }
      }
      setCandidates([...reviewBatch(inputs, products), ...failures])
    } catch (error) { setMessage(`상품 조회 실패: ${errorText(error)}`) }
    finally { setReading(false) }
  }
  const save = async () => {
    setSaving(true); setMessage('')
    let saved = 0
    try {
      let products = await productService.listProductsForImport()
      for (const candidate of candidates.filter(item => !item.saved && !item.error && item.items.some(row => row.selected))) {
        try {
          const supplier = await ensureProposalSupplier(candidate.metadata)
          const workingCandidate = { ...candidate, vendorId: supplier.id }
          const input = applyReviewed(workingCandidate, products)
          if (!input) continue
          const product = candidate.existingId ? await productService.updateProduct(candidate.existingId, input, candidate.baseline) : await productService.createProduct(input)
          products = [...products.filter(item => item.id !== product.id), product]
          saved += candidate.items.filter(item => item.selected && item.state !== '기존').length
          // Persist completion immediately: a partial failure must never repeat successful inserts.
          setCandidates(current => current.map(item => item.key === candidate.key ? { ...item, saved: true, items: item.items.map(row => ({ ...row, selected: false })) } : item))
        } catch (error) {
          setCandidates(current => current.map(item => item.key === candidate.key ? { ...item, error: errorText(error), items: item.items.map(row => ({ ...row, state: '확인필요', selected: false })) } : item))
        }
      }
      setMessage(`${saved}개 SKU 반영 완료. 확인필요 항목은 원본을 확인한 뒤 다시 업로드해주세요.`)
      if (saved) await onDone()
    } catch (error) { setMessage(errorText(error)) }
    finally { setSaving(false) }
  }
  const selectedCount = candidates.filter(item => !item.saved && !item.error).flatMap(item => item.items).filter(item => item.selected && item.state !== '기존' && item.state !== '확인필요').length
  return <div className="bulk-import-backdrop"><section className="bulk-import-panel" role="dialog" aria-modal="true" aria-labelledby="bulk-import-title">
    <header><div><p className="page-eyebrow">PROPOSAL IMPORT</p><h2 id="bulk-import-title">제안서 비교·선택 반영</h2><p>상품과 SKU를 비교하고 반영할 항목을 선택하세요. 기존 SKU와 정산 이력은 유지됩니다.</p></div><button className="secondary-button" disabled={reading || saving} onClick={onClose}>닫기</button></header>
    <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" style={{ width: 18, height: 18, minHeight: 18 }} disabled={reading || saving} checked={vendorMode} onChange={event => { setVendorMode(event.target.checked); setCandidates([]) }} />벤더 전용 제안서</label>
    {vendorMode && <label>정산 벤더명<input disabled={reading || saving} value={vendorName} onChange={event => { setVendorName(event.target.value); setCandidates([]) }} /></label>}
    <label className="bulk-import-drop"><strong>{reading ? '제안서를 비교하고 있습니다…' : '제안서 파일 선택'}</strong><span>엑셀 파일 1개를 상품 1개로 비교합니다. 확인필요 항목은 반영되지 않습니다.</span><input type="file" accept=".xlsx,.xls" multiple disabled={reading || saving} onChange={event => { void readFiles(event.target.files); event.target.value = '' }} /></label>
    {!!candidates.length && <><div className="bulk-import-summary">{states.map(state => <span key={state}>{state} <b>{candidates.reduce((sum, candidate) => sum + candidate.items.filter(item => item.state === state).length + (state === '확인필요' && !candidate.items.length && candidate.error ? 1 : 0), 0)}</b></span>)}</div>
      <div className="bulk-import-table"><table><thead><tr><th>상태</th><th>상품 / SKU</th><th>기존값 → 새값</th><th>선택</th></tr></thead><tbody>{candidates.map(candidate => candidate.error && !candidate.items.length ? <tr key={candidate.key}><td>확인필요</td><td>{candidate.fileName}</td><td colSpan={2}>{candidate.error}</td></tr> : candidate.items.map(item => {
        const row = candidate.rows[item.index]
        return <tr key={item.key}><td><strong>{candidate.saved ? '반영 완료' : item.state}</strong></td><td>{candidate.metadata.brandName} · {candidate.productName}<br />{sourceOption(row)}<br /><small>{candidate.fileName}</small></td><td>
          {item.state === '조건변경' && item.comparisons.map(diff => <div key={diff.label} style={diff.before !== diff.after ? { color: '#a13b00', fontWeight: 700 } : undefined}>{diff.label}: {diff.before.toLocaleString('ko-KR')} → {diff.after.toLocaleString('ko-KR')}{diff.label === '셀러 수수료' ? '%' : ''}</div>)}
          {item.state === '기존' && '변경 없음 · 저장하지 않음'}
          {item.state === '신규' && <div>판매가 {row['공구판매가'].toLocaleString()}원 · 공급가 {row['총 매입가(VAT포함)'].toLocaleString()}원<br />셀러 수수료 {row['셀러 수수료율']}% · 배송비 {candidate.metadata.shippingFee.toLocaleString()}원</div>}
          {(candidate.error || item.reason) && <div role="status">{candidate.error || item.reason}{candidate.candidateProductIds?.length ? ` · 상품 후보 ${candidate.candidateProductIds.length}개` : ''}{item.candidateSkuIds?.length ? ` · SKU 후보 ${item.candidateSkuIds.length}개` : ''}</div>}
        </td><td><select aria-label={`${sourceOption(row)} 반영 여부`} disabled={reading || saving || candidate.saved || !!candidate.error || item.state === '확인필요' || item.state === '기존'} value={item.selected ? 'apply' : 'exclude'} onChange={event => setCandidates(current => current.map(value => value.key === candidate.key ? { ...value, items: value.items.map(valueRow => valueRow.key === item.key ? { ...valueRow, selected: event.target.value === 'apply' } : valueRow) } : value))}><option value="exclude">제외</option><option value="apply">반영</option></select></td></tr>
      }))}</tbody></table></div></>}
    <footer><p role="status">{message || '모든 항목은 기본 제외입니다. 변경 내용을 확인한 뒤 반영을 선택하세요.'}</p><button className="primary-button" disabled={!selectedCount || saving || reading} onClick={() => void save()}>{saving ? '반영 중…' : `선택 항목 상품DB 반영 (${selectedCount})`}</button></footer>
  </section></div>
}
