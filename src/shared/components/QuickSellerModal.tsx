import { useEffect, useState } from 'react'
import { DEFAULT_MD_USER_ID } from '../data/users'
import { sellerMasterService, type SellerMaster } from '../services/sellerMasterService'
import { managerDirectoryService, type ManagerOption } from '../services/managerDirectoryService'
import { historicalSellers, sellerSearchKey } from './SellerHistoryNotice'

export function QuickSellerModal({ name, managerId, managers, onClose, onSaved }: { name: string; managerId: string; managers: ManagerOption[]; onClose: () => void; onSaved: (seller: SellerMaster) => void }) {
  const [form, setForm] = useState<SellerMaster>(() => ({ id: crypto.randomUUID(), name, instagramId: '', contact: '', defaultMdId: DEFAULT_MD_USER_ID, defaultManagerId: managerId, active: true }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [historyConfirmed, setHistoryConfirmed] = useState(false)
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape' && !saving) { event.stopPropagation(); onClose() } }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [saving, onClose])
  const all = sellerMasterService.listSellers(true)
  const duplicates = all.filter(seller => sellerSearchKey(seller.name) === sellerSearchKey(form.name) || (form.instagramId?.trim() && sellerSearchKey(seller.instagramId ?? '') === sellerSearchKey(form.instagramId)))
  const historic = historicalSellers(all).filter(seller => sellerSearchKey(seller.name) === sellerSearchKey(form.name))
  const save = async () => {
    if (!form.name.trim()) return setError('셀러명을 입력해주세요.')
    setSaving(true); setError('')
    try {
      // Recheck against the latest Master before inserting; never overwrite a match.
      const latest = await sellerMasterService.loadSellers(true)
      if (latest.some(seller => sellerSearchKey(seller.name) === sellerSearchKey(form.name) || (form.instagramId?.trim() && sellerSearchKey(seller.instagramId ?? '') === sellerSearchKey(form.instagramId)))) throw new Error('동일한 셀러명 또는 인스타그램이 이미 등록되어 있습니다. 기존 셀러를 선택해주세요.')
      if (historic.length && !historyConfirmed) throw new Error('기존 일정의 셀러 정보를 먼저 확인해주세요.')
      onSaved(await sellerMasterService.saveSellerProfile(form))
    } catch (reason) { setError(reason instanceof Error ? reason.message : '셀러를 저장하지 못했습니다. 다시 시도해주세요.') }
    finally { setSaving(false) }
  }
  return <div className="nested-modal-backdrop"><section role="dialog" aria-modal="true" aria-labelledby="quick-seller-title" className="helper-modal seller-editor"><header><h3 id="quick-seller-title">신규 셀러 간편 등록</h3><button type="button" className="icon-button" aria-label="셀러 등록 닫기" disabled={saving} onClick={onClose}>×</button></header><p>일정 작성 내용을 유지하고 등록한 셀러를 바로 선택합니다.</p><div className="seller-editor__grid"><label>셀러명 *<input autoFocus value={form.name} onChange={event => { setForm({ ...form, name: event.target.value }); setHistoryConfirmed(false) }} /></label><label>인스타그램<input value={form.instagramId} onChange={event => setForm({ ...form, instagramId: event.target.value })} /></label><label>연락처<input value={form.contact} onChange={event => setForm({ ...form, contact: event.target.value })} /></label><label>담당 매니저<select value={form.defaultManagerId} onChange={event => setForm({ ...form, defaultManagerId: event.target.value })}><option value="">선택</option>{form.defaultManagerId && !managers.some(user => user.id === form.defaultManagerId) && <option value={form.defaultManagerId}>{managerDirectoryService.name(form.defaultManagerId) || form.defaultManagerId} · 기존 담당자</option>}{managers.map(user => <option key={user.id} value={user.id}>{managerDirectoryService.label(user)}</option>)}</select></label><label>사업자 유형 (선택)<select value={form.businessType ?? ''} onChange={event => setForm({ ...form, businessType: event.target.value ? event.target.value as SellerMaster['businessType'] : undefined })}><option value="">확인 후 등록</option><option value="general_business">일반과세자</option><option value="simplified_business">간이과세자</option><option value="freelancer">프리랜서(3.3%)</option></select></label><label>사업자명 (선택)<input value={form.businessName ?? ''} onChange={event => setForm({ ...form, businessName: event.target.value })} /></label></div>{duplicates.length > 0 && <p role="alert">이미 등록된 셀러입니다: {duplicates.map(seller => `${seller.name}${seller.active === false ? ' (비활성)' : ''}`).join(', ')}. 기존 셀러를 확인해주세요.</p>}{duplicates.filter(seller => seller.active !== false).map(seller => <button key={seller.id} type="button" className="secondary-button" disabled={saving} onClick={() => onSaved(seller)}>{seller.name} · 기존 셀러 선택</button>)}{historic.length > 0 && <label className="checkbox-label"><input type="checkbox" checked={historyConfirmed} onChange={event => setHistoryConfirmed(event.target.checked)} />기존 일정에 같은 이름이 있음을 확인했으며 별도 신규 셀러로 등록합니다.</label>}{error && <p role="alert" className="campaign-policy-warning">{error}</p>}<div className="button-row"><button type="button" className="secondary-button" disabled={saving} onClick={onClose}>취소</button><button type="button" className="primary-button" disabled={saving || !!duplicates.length || (!!historic.length && !historyConfirmed)} onClick={() => void save()}>{saving ? '등록 중…' : '등록하고 선택'}</button></div></section></div>
}
