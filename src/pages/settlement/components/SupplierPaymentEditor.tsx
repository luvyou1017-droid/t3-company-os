import { useState } from 'react'
import type { ProductMaster } from '../../../features/productMaster/types'
import type { SalesDataRow } from '../../../shared/types/salesData'
import { calculateSupplierPayment, type SupplierPayment } from '../../../shared/utils/supplierPayment'
export function SupplierPaymentEditor({ rows, products, value, onSave }: { rows: SalesDataRow[]; products: ProductMaster[]; value?: SupplierPayment; onSave: (value: SupplierPayment) => Promise<void> }) {
  const [draft,setDraft] = useState<SupplierPayment>(() => value ?? { lines: rows.map(row => ({ rowId: row.id, skuId: row.skuId, quantity: Math.max(row.quantity-row.canceledQuantity-row.refundedQuantity,0) })), shipping: {}, adjustments: [], reviewedBy: '', reviewedAt: '' })
  const [busy,setBusy]=useState(false), [error,setError]=useState('')
  const amount=(text:string)=>text===''?undefined:Number(text)
  const loadCosts=()=>setDraft(d=>({...d,lines:rows.map(row=>{const sku=products.flatMap(p=>p.skus).find(s=>s.id===row.skuId);return {rowId:row.id,skuId:row.skuId,quantity:Math.max(row.quantity-row.canceledQuantity-row.refundedQuantity,0),companySupplyPrice:sku?.currentTradeTerms?.companySupplyPrice}})}))
  const save=async()=>{setError('');const calc=calculateSupplierPayment(draft,rows);if(calc.amount===undefined||Object.values(draft.shipping).some(v=>v!==undefined&&(!Number.isFinite(v)||v<0)))return setError('회사 실제 공급가와 공급사 지급 배송비를 확인해주세요. 배송비가 없으면 0원을 입력해주세요.');setBusy(true);try{await onSave(draft)}catch(e){setError(e instanceof Error?e.message:'저장 실패')}finally{setBusy(false)}}
  return <details><summary>공급사 지급조건 확인·저장</summary><button type="button" disabled={busy} onClick={loadCosts}>SKU 회사 실제 공급가 불러오기</button>
    <table><thead><tr><th>옵션</th><th>수량</th><th>회사 실제 공급가</th></tr></thead><tbody>{draft.lines.map((line,i)=><tr key={line.rowId}><td>{rows.find(r=>r.id===line.rowId)?.optionName}</td><td>{line.quantity}</td><td><input aria-label={`회사 실제 공급가 ${i+1}`} type="number" min="0" value={line.companySupplyPrice??''} placeholder="회사 실제 공급가 확인 필요" onChange={e=>setDraft(d=>({...d,lines:d.lines.map((l,j)=>j===i?{...l,companySupplyPrice:amount(e.target.value)}:l)}))}/></td></tr>)}</tbody></table>
    <p>원본 배송비는 자동 배분하지 않습니다. 공급사 지급 대상 여부를 확인하고 입력해주세요.</p>
    {(['seller','company','supplier'] as const).map((key,i)=><label key={key}>{['셀러 부담 배송비','회사 부담 배송비','공급사 지급 배송비'][i]}<input type="number" min="0" value={draft.shipping[key]??''} placeholder="확인 필요" onChange={e=>setDraft(d=>({...d,shipping:{...d.shipping,[key]:amount(e.target.value)}}))}/></label>)}
    <p>부담주체별 금액과 공급사 지급액은 별도 정보입니다. 세 금액을 합산하지 않습니다.</p>
    {draft.adjustments.map((a,i)=><div key={a.id}><select value={a.kind} onChange={e=>setDraft(d=>({...d,adjustments:d.adjustments.map((v,j)=>i===j?{...v,kind:e.target.value}:v)}))}>{['샘플비','선지급금','반품/취소','배송비 조정','기타 상계','추가 지급'].map(k=><option key={k}>{k}</option>)}</select><select value={a.direction} onChange={e=>setDraft(d=>({...d,adjustments:d.adjustments.map((v,j)=>i===j?{...v,direction:e.target.value as 'add'|'subtract'}:v)}))}><option value="subtract">차감 −</option><option value="add">추가 +</option></select><input aria-label="조정금액" type="number" min="0" value={a.amount} onChange={e=>setDraft(d=>({...d,adjustments:d.adjustments.map((v,j)=>i===j?{...v,amount:Number(e.target.value)}:v)}))}/><input placeholder="근거·중복 반영 여부 확인" value={a.memo} onChange={e=>setDraft(d=>({...d,adjustments:d.adjustments.map((v,j)=>i===j?{...v,memo:e.target.value}:v)}))}/><button type="button" onClick={()=>setDraft(d=>({...d,adjustments:d.adjustments.filter(v=>v.id!==a.id)}))}>삭제</button></div>)}
    <button type="button" onClick={()=>setDraft(d=>({...d,adjustments:[...d.adjustments,{id:crypto.randomUUID(),kind:'기타 상계',direction:'subtract',amount:0,memo:''}]}))}>상계·조정 추가</button>
    <button type="button" disabled={busy} onClick={()=>void save()}>확인한 공급사 지급조건 저장</button>{error&&<p role="alert">{error}</p>}
  </details>
}
