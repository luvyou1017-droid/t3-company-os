import { useState } from 'react'
import type { ProductMaster } from '../../../features/productMaster/types'
import { productService } from '../../../features/productMaster/services/productService'
import { reviewProposalRates, type ProposalRateEvidence } from '../../../features/productMaster/utils/proposalRateRepair'
import { parseWiseProposalFile } from '../../../features/productMaster/utils/wiseProposalParser'

export function ProposalRateReview({ products, onDone }: { products: ProductMaster[]; onDone: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [evidence, setEvidence] = useState<ProposalRateEvidence[]>([])
  const read = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true); setEvidence([])
    const rows: ProposalRateEvidence[] = []
    const errors: string[] = []
    for (const file of Array.from(files)) {
      try {
        const parsed = await parseWiseProposalFile(file)
        rows.push(...parsed.rows.map((row) => ({ source: file.name, product: row['상품명'], option: row['구성명'], sale: row['공구판매가'], supply: row['총 매입가(VAT포함)'], rate: row['셀러 수수료율'] })))
      } catch (error) { errors.push(`${file.name}: ${error instanceof Error ? error.message : '읽기 실패'}`) }
    }
    setEvidence(rows); setMessage(`${rows.length}개 구성 확인. ${errors.join(' / ')}`); setBusy(false)
  }
  const reviews = products.map((product) => ({ name: product.productName, ...reviewProposalRates(product, evidence) }))
  const pending = reviews.filter((item) => item.changed)
  const needsReview = reviews.filter((item) => item.unresolved.length || item.conflicts.length)
  const save = async () => {
    setBusy(true)
    let saved = 0
    try {
      for (const item of pending) {
        const current = await productService.getProductById(item.product.id)
        if (!current) continue
        const checked = reviewProposalRates(current, evidence)
        if (!checked.changed) continue
        await productService.updateProduct(current.id, checked.product)
        saved++
      }
      setMessage(`${saved}개 상품의 수수료·채널 구분을 저장했습니다.`)
    } catch (error) { setMessage(`${saved}개 저장 완료. ${error instanceof Error ? error.message : '저장하지 못했습니다. 다시 시도해주세요.'}`) }
    finally { await onDone(); setBusy(false) }
  }
  return <section className="panel" aria-label="제안서 수수료 점검">
    <h2>제안서 수수료 점검</h2>
    <p>보관된 제안서와 원본 파일명·상품·구성·판매가·매입가가 모두 일치하는 항목만 보완합니다. 기존에 입력된 다른 수수료는 유지합니다.</p>
    <label>원본 제안서 선택 <input type="file" accept=".xlsx,.xls" multiple disabled={busy} onChange={(event) => void read(event.target.files)} /></label>
    <p>보완 가능 {pending.length}개 상품 · 원본 또는 조건 확인 필요 {needsReview.length}개 상품</p>
    <button className="primary-button" disabled={busy || !pending.length} onClick={() => void save()}>{busy ? '저장 중…' : '확인된 누락 수수료·채널 반영'}</button>
    <p role="status">{message}</p>
    {!!needsReview.length && <details><summary>확인이 필요한 상품 보기</summary><ul>{needsReview.map((item) => <li key={item.product.id}>{item.name}: 원본 일치 미확인 {item.unresolved.length}개 · 기존 수수료와 다름 {item.conflicts.length}개</li>)}</ul></details>}
  </section>
}
