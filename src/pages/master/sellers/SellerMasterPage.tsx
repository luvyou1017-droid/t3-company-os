import { useEffect, useMemo, useState, type ClipboardEvent } from 'react'
import { appUsers, DEFAULT_MD_USER_ID } from '../../../shared/data/users'
import { sellerMasterService, type SellerBusinessProfile, type SellerMaster } from '../../../shared/services/sellerMasterService'
import type { CampaignCreationBusinessType } from '../../../shared/types/campaignCreation'
import { sanitizeAccountNumberInput } from '../../../shared/utils/accountNumber'
import { useCompanyAuth } from '../../../features/auth/AuthGate'
import { NotionSellerSyncPanel } from './NotionSellerSyncPanel'

const newBusiness = (primary = false): SellerBusinessProfile => ({ id: crypto.randomUUID(), businessName: '', businessNumber: '', representativeName: '', businessType: 'general_business', taxInvoiceEmail: '', bankName: '', accountNumber: '', accountHolder: '', isPrimary: primary, active: true })
const emptySeller = (): SellerMaster => ({ id: crypto.randomUUID(), name: '', instagramId: '', contact: '', realName: '', defaultMdId: DEFAULT_MD_USER_ID, defaultManagerId: '', active: true, businesses: [newBusiness(true)] })
const businessLabels: Record<CampaignCreationBusinessType, string> = { general_business: '일반과세자', simplified_business: '간이과세자', freelancer: '프리랜서(3.3%)' }

export function SellerMasterPage() {
  const { profile } = useCompanyAuth()
  const [sellers, setSellers] = useState<SellerMaster[]>([])
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<SellerMaster | null>(null)
  const [certificateFiles, setCertificateFiles] = useState<Record<string, File>>({})
  const [bankbookFiles, setBankbookFiles] = useState<Record<string, File>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [notionSyncOpen, setNotionSyncOpen] = useState(false)
  const load = async () => { setLoading(true); setError(''); try { setSellers(await sellerMasterService.loadSellers(true)) } catch (reason) { setError(message(reason, '셀러 목록을 불러오지 못했습니다.')) } finally { setLoading(false) } }
  useEffect(() => { void sellerMasterService.loadSellers(true).then(setSellers).catch((reason) => setError(message(reason, '셀러 목록을 불러오지 못했습니다.'))).finally(() => setLoading(false)) }, [])
  const filtered = useMemo(() => { const keyword = query.trim().toLowerCase(); return sellers.filter((seller) => !keyword || `${seller.name} ${seller.instagramId ?? ''} ${seller.realName ?? ''} ${(seller.businesses ?? []).map((business) => business.businessName).join(' ')}`.toLowerCase().includes(keyword)) }, [query, sellers])

  const patchBusiness = (id: string, patch: Partial<SellerBusinessProfile>) => setEditing((seller) => seller ? ({ ...seller, businesses: (seller.businesses ?? []).map((business) => business.id === id ? { ...business, ...patch } : patch.isPrimary ? { ...business, isPrimary: false } : business) }) : seller)
  const removeBusiness = (id: string) => setEditing((seller) => {
    if (!seller) return seller
    const next = (seller.businesses ?? []).filter((business) => business.id !== id)
    if (next.length && !next.some((business) => business.isPrimary)) next[0] = { ...next[0], isPrimary: true }
    return { ...seller, businesses: next }
  })
  const chooseFile = (businessId: string, kind: 'certificate' | 'bankbook', file?: File) => {
    if (!file) return
    const update = (current: Record<string, File>) => ({ ...current, [businessId]: file })
    if (kind === 'certificate') setCertificateFiles(update)
    else setBankbookFiles(update)
  }
  const pasteFile = (businessId: string, kind: 'certificate' | 'bankbook', event: ClipboardEvent<HTMLDivElement>) => {
    const file = Array.from(event.clipboardData.files).find((item) => item.type.startsWith('image/') || item.type === 'application/pdf')
    if (file) { event.preventDefault(); chooseFile(businessId, kind, file) }
  }
  const viewCertificate = async (path?: string) => { if (!path) return; try { window.open(await sellerMasterService.getCertificateUrl(path), '_blank', 'noopener,noreferrer') } catch (reason) { setError(message(reason, '파일을 열지 못했습니다.')) } }

  const save = async () => {
    if (!editing?.name.trim()) return setError('셀러명은 필수입니다.')
    const businesses = editing.businesses ?? []
    if (!businesses.length) return setError('사업자 정보를 한 개 이상 등록해주세요.')
    if (businesses.some((business) => !business.businessName.trim())) return setError('각 사업자의 사업자명을 입력해주세요.')
    if (!businesses.some((business) => business.isPrimary)) return setError('기본 사업자를 한 개 선택해주세요.')
    setSaving(true); setError('')
    try {
      const uploaded = await Promise.all(businesses.map(async (business) => {
        const certificateFile = certificateFiles[business.id]
        const bankbookFile = bankbookFiles[business.id]
        const certificate = certificateFile ? await sellerMasterService.uploadBusinessCertificate(editing.id, business.id, certificateFile) : undefined
        const bankbook = bankbookFile ? await sellerMasterService.uploadBusinessBankbook(editing.id, business.id, bankbookFile) : undefined
        return { ...business, ...(certificate ? { certificatePath: certificate.path, certificateName: certificate.name } : {}), ...(bankbook ? { bankbookPath: bankbook.path, bankbookName: bankbook.name } : {}) }
      }))
      const primary = uploaded.find((business) => business.isPrimary)!
      const saved = await sellerMasterService.saveSellerProfile({ ...editing, businesses: uploaded, businessName: primary.businessName, businessType: primary.businessType, bankName: primary.bankName, accountNumber: primary.accountNumber, accountHolder: primary.accountHolder })
      setSellers((current) => [saved, ...current.filter((seller) => seller.id !== saved.id)])
      setEditing(null); setCertificateFiles({}); setBankbookFiles({}); setNotice('셀러·사업자·정산계좌 정보가 저장되었습니다. 일정에서 선택한 사업자 기준으로 정산에 연결됩니다.')
    } catch (reason) { setError(message(reason, '저장하지 못했습니다.')) } finally { setSaving(false) }
  }
  const toggleActive = async (seller: SellerMaster) => { if (!window.confirm(`${seller.name} 셀러를 ${seller.active === false ? '활성화' : '비활성화'}할까요?`)) return; try { await sellerMasterService.setActive(seller.id, seller.active === false); await load() } catch (reason) { setError(message(reason, '상태를 변경하지 못했습니다.')) } }
  const openEditor = (seller?: SellerMaster) => { setEditing(seller ? { ...seller, businesses: seller.businesses?.length ? seller.businesses.map((business) => ({ ...business })) : [newBusiness(true)] } : emptySeller()); setCertificateFiles({}); setBankbookFiles({}); setNotice(''); setError('') }

  return <section className="master-page seller-master-page">
    <div className="master-page__heading"><div><p className="page-eyebrow">SELLER DATABASE</p><h1>셀러 DB</h1><p>셀러 한 명에 여러 사업자를 연결하고 일정별 정산 사업자를 선택합니다.</p></div><div className="button-row">{['ceo','admin','settlement_cs'].includes(profile.role) && <button className="secondary-button" onClick={() => setNotionSyncOpen(true)}>노션 셀러 DB 동기화</button>}<button className="primary-button" onClick={() => openEditor()}>신규 셀러 등록</button></div></div>
    {notice && <div className="inline-notice" role="status"><span>{notice}</span><button onClick={() => setNotice('')}>닫기</button></div>}{error && !editing && <p className="campaign-policy-warning" role="alert">{error}</p>}
    <div className="product-filters"><input aria-label="셀러 검색" placeholder="셀러명, 인스타그램, 사업자명 검색" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
    <div className="panel"><div className="panel__header"><div><h2>셀러 목록</h2><p>전체 {sellers.length}명 · 활성 {sellers.filter((seller) => seller.active !== false).length}명</p></div><strong className="result-count">{filtered.length}건</strong></div><div className="table-wrap"><table className="seller-master-table"><thead><tr>{['셀러명','인스타그램','사업자','연락처','기본 MD','담당 매니저','상태','관리'].map((label) => <th key={label}>{label}</th>)}</tr></thead><tbody>
      {loading && <tr><td colSpan={8}>셀러 정보를 불러오는 중입니다.</td></tr>}{!loading && !filtered.length && <tr><td className="master-table-empty" colSpan={8}>등록된 셀러가 없습니다. ‘신규 셀러 등록’부터 시작해주세요.</td></tr>}
      {filtered.map((seller) => { const businesses = seller.businesses ?? []; const primary = businesses.find((business) => business.isPrimary); return <tr key={seller.id}><td><strong>{seller.name}</strong>{seller.realName && <small>{seller.realName}</small>}</td><td>{seller.instagramId || '-'}</td><td><strong>{primary?.businessName || seller.businessName || '미등록'}</strong><small>{businesses.length ? `총 ${businesses.length}개 사업자` : seller.businessType ? businessLabels[seller.businessType] : '사업자 미등록'}</small></td><td>{seller.contact || '-'}</td><td>{appUsers.find((user) => user.id === seller.defaultMdId)?.name || '-'}</td><td>{appUsers.find((user) => user.id === seller.defaultManagerId)?.name || '-'}</td><td><span className={`status-badge ${seller.active !== false ? 'done' : 'waiting'}`}>{seller.active !== false ? '활성' : '비활성'}</span></td><td><div className="table-actions"><button onClick={() => openEditor(seller)}>수정</button><button className="danger-text" onClick={() => void toggleActive(seller)}>{seller.active === false ? '활성화' : '비활성화'}</button></div></td></tr> })}
    </tbody></table></div></div>
    {notionSyncOpen && <NotionSellerSyncPanel sellers={sellers} onClose={() => setNotionSyncOpen(false)} onApplied={load} />}
    {editing && <div className="nested-modal-backdrop"><section aria-modal="true" className="helper-modal seller-editor seller-editor--businesses" role="dialog"><header><div><p className="page-eyebrow">SELLER PROFILE</p><h3>{sellers.some((seller) => seller.id === editing.id) ? '셀러 정보 수정' : '신규 셀러 등록'}</h3><p>셀러 기본정보와 보유 사업자를 등록합니다.</p></div><button aria-label="닫기" className="icon-button" onClick={() => setEditing(null)}>×</button></header>
      <div className="seller-editor__grid"><label><span>셀러명 *</span><input autoFocus value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} /></label><label><span>실명</span><input value={editing.realName ?? ''} onChange={(event) => setEditing({ ...editing, realName: event.target.value })} /></label><label><span>인스타그램 ID</span><input placeholder="@ 없이 입력" value={editing.instagramId ?? ''} onChange={(event) => setEditing({ ...editing, instagramId: event.target.value })} /></label><label><span>연락처</span><input value={editing.contact ?? ''} onChange={(event) => setEditing({ ...editing, contact: event.target.value })} /></label><label><span>기본 MD</span><select value={editing.defaultMdId} onChange={(event) => setEditing({ ...editing, defaultMdId: event.target.value })}>{appUsers.filter((user) => user.role === 'MD').map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label><label><span>담당 매니저</span><select value={editing.defaultManagerId} onChange={(event) => setEditing({ ...editing, defaultManagerId: event.target.value })}><option value="">선택</option>{appUsers.filter((user) => ['대표','팀장','매니저'].includes(user.role)).map((user) => <option key={user.id} value={user.id}>{user.name}{user.name === '허윤정' ? ' · 대표 직속' : ''}</option>)}</select><small>새 공구 생성 시 기본 담당자로 자동 연결됩니다.</small></label></div>
      <section className="seller-business-section"><div className="section-heading"><div><h4>사업자 정보</h4><p>여러 개 등록하고 공구 일정마다 사용할 사업자를 선택할 수 있습니다.</p></div><button className="secondary-button" onClick={() => setEditing({ ...editing, businesses: [...(editing.businesses ?? []), newBusiness(false)] })}>+ 사업자 추가</button></div>
        <div className="seller-business-list">{(editing.businesses ?? []).map((business, index) => <article className="seller-business-card" key={business.id}><header><div><strong>사업자 {index + 1}</strong>{business.isPrimary && <span className="status-badge done">기본 사업자</span>}</div>{(editing.businesses?.length ?? 0) > 1 && <button className="danger-text" onClick={() => removeBusiness(business.id)}>삭제</button>}</header><div className="seller-editor__grid">
          <label><span>사업자명 *</span><input value={business.businessName} onChange={(event) => patchBusiness(business.id, { businessName: event.target.value })} /></label><label><span>대표자명</span><input value={business.representativeName ?? ''} onChange={(event) => patchBusiness(business.id, { representativeName: event.target.value })} /></label><label><span>사업자등록번호</span><input inputMode="numeric" placeholder="숫자만 입력" value={business.businessNumber ?? ''} onChange={(event) => patchBusiness(business.id, { businessNumber: event.target.value.replace(/\D/g, '') })} /></label><label><span>사업자 유형 *</span><select value={business.businessType} onChange={(event) => patchBusiness(business.id, { businessType: event.target.value as CampaignCreationBusinessType })}>{Object.entries(businessLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="span-2"><span>세금계산서 발행 이메일 · 선택</span><input type="email" placeholder="tax@example.com" value={business.taxInvoiceEmail ?? ''} onChange={(event) => patchBusiness(business.id, { taxInvoiceEmail: event.target.value })} /></label>
        </div><div className="business-document-grid"><div className="business-certificate-drop" onPaste={(event) => pasteFile(business.id, 'certificate', event)} tabIndex={0}><div><strong>사업자등록증 · 선택</strong><p>이미지/PDF 파일 선택 또는 붙여넣기(Ctrl+V)</p></div><label className="secondary-button">파일 선택<input accept="image/png,image/jpeg,image/webp,application/pdf" hidden type="file" onChange={(event) => chooseFile(business.id, 'certificate', event.target.files?.[0])} /></label>{certificateFiles[business.id] && <span className="file-chip">새 파일: {certificateFiles[business.id].name}</span>}{!certificateFiles[business.id] && business.certificateName && <><span className="file-chip">저장됨: {business.certificateName}</span><button className="text-button" onClick={() => void viewCertificate(business.certificatePath)}>파일 보기</button></>}</div>
          <section className="business-account-section"><div><strong>정산계좌 · 선택</strong><p>이 사업자로 진행한 공구의 지급 계좌입니다.</p></div><div className="seller-editor__grid"><label><span>은행명</span><input placeholder="예: 신한은행" value={business.bankName ?? ''} onChange={(event) => patchBusiness(business.id, { bankName: event.target.value })} /></label><label><span>예금주</span><input placeholder="사업자 또는 대표자명" value={business.accountHolder ?? ''} onChange={(event) => patchBusiness(business.id, { accountHolder: event.target.value })} /></label><label className="span-2"><span>계좌번호</span><input inputMode="text" placeholder="예: 110-123-456789" value={business.accountNumber ?? ''} onChange={(event) => patchBusiness(business.id, { accountNumber: sanitizeAccountNumberInput(event.target.value) })} /></label></div><div className="business-certificate-drop" onPaste={(event) => pasteFile(business.id, 'bankbook', event)} tabIndex={0}><div><strong>통장사본 · 선택</strong><p>25MB 이하 이미지/PDF · 큰 이미지는 자동으로 줄여 저장합니다.</p></div><label className="secondary-button">파일 선택<input accept="image/png,image/jpeg,image/webp,application/pdf" hidden type="file" onChange={(event) => chooseFile(business.id, 'bankbook', event.target.files?.[0])} /></label>{bankbookFiles[business.id] && <span className="file-chip">새 파일: {bankbookFiles[business.id].name}</span>}{!bankbookFiles[business.id] && business.bankbookName && <><span className="file-chip">저장됨: {business.bankbookName}</span><button className="text-button" onClick={() => void viewCertificate(business.bankbookPath)}>파일 보기</button></>}</div></section></div><label className="checkbox-label"><input checked={business.isPrimary} name="primary-business" type="radio" onChange={() => patchBusiness(business.id, { isPrimary: true })} /> 기본 사업자로 설정</label></article>)}</div>
      </section>{error && <p className="campaign-policy-warning" role="alert">{error}</p>}<div className="button-row seller-editor__actions"><button className="secondary-button" disabled={saving} onClick={() => { setEditing(null); setError('') }}>취소</button><button className="primary-button" disabled={saving} onClick={() => void save()}>{saving ? '파일 업로드 및 저장 중…' : '저장'}</button></div></section></div>}
  </section>
}

function message(reason: unknown, fallback: string) { return reason instanceof Error ? reason.message : fallback }
