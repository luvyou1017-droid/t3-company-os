import { useState } from 'react'
import type { SupplierPilotRow } from '../../../shared/data/notionSupplierPilot10'
import type { SalesDataImport } from '../../../shared/types/salesData'
import { storageService, STORAGE_KEYS } from '../../../shared/services/storageService'
import { cloudSyncService } from '../../../shared/services/cloudSyncService'
import { salesDataService } from '../../../shared/services/salesDataService'
const key = 't3-suppliers-v1'
export function VendorPartnerDetails({ source, canEdit, onSaved }: { source: SalesDataImport; canEdit: boolean; onSaved: () => void }) {
  const partners = storageService.getItem<SupplierPilotRow[]>(key, [])
  const match = partners.filter(item => item.id === source.settlementVendorId || (!source.settlementVendorId && item.companyName.trim() === source.settlementVendorName?.trim()))
  const [draft, setDraft] = useState<SupplierPilotRow>(() => match.length === 1 ? {...match[0]} : {id:crypto.randomUUID(), companyName:source.settlementVendorName || '',partnerType:'vendor',linkedProductCount:0,source:'manual'})
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!canEdit || busy) return
    if (!draft.companyName.trim()) { setMessage('벤더명을 입력해주세요.'); return }
    setBusy(true)
    try {
      const current = storageService.getItem<SupplierPilotRow[]>(key, [])
      if (current.some(item => item.id !== draft.id && item.companyName.trim() === draft.companyName.trim())) throw new Error('동일한 벤더명이 있습니다. 등록 거래처에서 선택해주세요.')
      const next = {...draft, partnerType: draft.partnerType === 'supplier' || draft.partnerType === 'both' ? 'both' as const : 'vendor' as const}
      storageService.setItem(key,[...current.filter(item=>item.id!==draft.id),next])
      const latest = salesDataService.getSalesDataImportById(source.id)
      if (!latest) throw new Error('판매 데이터를 찾을 수 없습니다.')
      salesDataService.updateSalesDataImport({...latest,settlementVendorId:next.id,settlementVendorName:next.companyName})
      await cloudSyncService.syncKeys([key,STORAGE_KEYS.salesDataImports])
      setMessage('벤더 정보를 거래처 DB에 저장하고 이번 정산에 연결했습니다.'); onSaved()
    } catch(error) { setMessage(error instanceof Error ? error.message : '저장에 실패했습니다.') } finally { setBusy(false) }
  }
  return <section className="vendor-partner-form"><h2>벤더 정보 · {source.settlementVendorName}</h2><p>이번 정산의 거래 상대방 정보입니다. 판매 셀러 정보와 별도로 관리합니다.</p>
    <label className="form-field"><span>등록 거래처 연결</span><select disabled={!canEdit || busy} value={partners.some(item=>item.id===draft.id)?draft.id:''} onChange={event=>{const found=partners.find(item=>item.id===event.target.value); if(found)setDraft({...found})}}><option value="">새 벤더 등록</option>{partners.filter(item=>item.partnerType==='vendor'||item.partnerType==='both'||item.id===draft.id).map(item=><option key={item.id} value={item.id}>{item.companyName}</option>)}</select></label>
    <label className="form-field"><span>벤더 사업자 유형</span><select disabled={!canEdit||busy} value={draft.businessType??''} onChange={event=>setDraft({...draft,businessType:event.target.value as SupplierPilotRow['businessType']})}><option value="">선택해주세요</option><option value="corporation">법인사업자</option><option value="sole_proprietor">개인사업자</option><option value="simplified_business">간이사업자</option></select></label>
    <div className="settlement-revision-grid">{([['companyName','벤더명'],['legalName','사업자명'],['businessNumber','사업자등록번호'],['taxEmail','세금계산서 이메일'],['address','사업장 주소'],['bankName','은행명'],['bankAccount','계좌번호'],['accountHolder','예금주']] as const).map(([field,label])=><label className="form-field" key={field}><span>{label}</span><input disabled={!canEdit||busy} value={draft[field]??''} onChange={event=>setDraft({...draft,[field]:event.target.value})}/></label>)}</div>
    <button type="button" className="primary-button" disabled={!canEdit||busy} onClick={()=>void save()}>{busy?'저장 중…':'벤더 정보 저장'}</button>{message&&<p role="status">{message}</p>}
  </section>
}
