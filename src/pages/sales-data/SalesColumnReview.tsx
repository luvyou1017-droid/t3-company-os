import { useState } from 'react'
import { columnFields, suggestColumns, suggestHeader, type ColumnField, type ColumnMap, type SheetSample } from '../../shared/utils/salesColumnLearning'

export function SalesColumnReview({ sheets, busy, onAnalyze, onClose }: { sheets: SheetSample[]; busy: boolean; onAnalyze: (sheet: number, row: number, mapping: ColumnMap) => void; onClose: () => void }) {
  const initial = suggestHeader(sheets)
  const [sheet, setSheet] = useState(initial.sheet)
  const [row, setRow] = useState(initial.row)
  const [mapping, setMapping] = useState<ColumnMap>(initial.mapping)
  const header = sheets[sheet]?.rows[row] ?? []
  const fields = Object.keys(columnFields) as ColumnField[]
  const fieldInput = (field: ColumnField) => <label key={field} className="form-field"><span>{columnFields[field]}</span>
    <select value={mapping[field] ?? ''} disabled={busy} onChange={(event) => setMapping((current) => { const next = { ...current }; if (event.target.value === '') delete next[field]; else next[field] = Number(event.target.value); return next })}>
      <option value="">해당 열 없음 / 아직 확인 필요</option>
      {header.map((cell, index) => <option key={index} value={index}>{index + 1}열 · {String(cell ?? '(제목 없음)')} · 예: {String(sheets[sheet].rows[row + 1]?.[index] ?? '-').slice(0, 45)}</option>)}
    </select></label>
  return <section className="sales-ai-card sales-column-review">
    <h3>인식하지 못한 용어를 확인해주세요</h3>
    <p>확실한 용어는 미리 선택했습니다. 이 업체의 같은 열 구성에만 저장한 규칙을 재사용합니다. 공급사 지급액을 고객 매출로 선택하지 마세요.</p>
    <div className="sales-column-review__grid">
      <label className="form-field"><span>판매내역 시트</span><select disabled={busy} value={sheet} onChange={(event) => { const next = Number(event.target.value); const guessed = suggestHeader([sheets[next]]); setSheet(next); setRow(guessed.row); setMapping(guessed.mapping) }}>{sheets.map((item, index) => <option key={index} value={index}>{item.name}</option>)}</select></label>
      <label className="form-field"><span>열 제목 행</span><input disabled={busy} type="number" min="1" max={sheets[sheet].rows.length} value={row + 1} onChange={(event) => { const next = Math.max(0, Math.min(sheets[sheet].rows.length - 1, Number(event.target.value) - 1)); setRow(next); setMapping(suggestColumns(sheets[sheet].rows[next] ?? [])) }} /></label>
      {fields.filter((field) => mapping[field] === undefined).map(fieldInput)}
    </div>
    <details><summary>자동 분류된 항목 확인·수정 ({fields.filter((field) => mapping[field] !== undefined).length})</summary><div className="sales-column-review__grid">{fields.filter((field) => mapping[field] !== undefined).map(fieldInput)}</div></details>
    <p>판매수량은 취소·반품을 포함한 원수량, 상품 총매출은 배송비를 제외한 금액입니다. 금액의 의미가 불확실하면 업체 확인 후 선택해주세요.</p>
    <div className="sku-match-actions"><button className="primary-button" disabled={busy} onClick={() => onAnalyze(sheet, row, mapping)} type="button">{busy ? '검증 중…' : '선택한 의미로 결과 미리보기'}</button><button className="secondary-button" disabled={busy} onClick={onClose} type="button">닫기</button></div>
  </section>
}
