import { cloudSyncService } from '../../../shared/services/cloudSyncService'
import { useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { useCompanyAuth } from '../../../features/auth/AuthGate'
import { findSupplierDuplicates, mergeSupplier, mergeSupplierBackup, parseSupplierText, type SupplierTextParseResult } from '../../../features/supplierMaster/services/supplierTextParser'
import { lifunSupplier, notionSupplierPilot10, type SupplierPilotRow } from '../../../shared/data/notionSupplierPilot10'
import { sanitizeAccountNumberInput } from '../../../shared/utils/accountNumber'
import { downloadBrowserBackup, extractSupplierRowsFromBackup } from '../../../shared/services/browserBackupService'

const STORAGE_KEY = 't3-suppliers-v1'
const emptySupplier = (): SupplierPilotRow => ({ id: `manual-${crypto.randomUUID()}`, companyName: '', partnerType: 'supplier', linkedProductCount: 0, source: 'manual' })
const load = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as SupplierPilotRow[] } catch { return [] } }
const saveAll = (rows: SupplierPilotRow[]) => { localStorage.setItem(STORAGE_KEY, JSON.stringify(rows)); return rows }
type ExcelPreview = { fileName: string; supplier: SupplierPilotRow; brand: string; products: Array<{ name: string; option: string; regularPrice?: number; salePrice?: number; supplyPrice?: number; commissionRate?: number }> }
const cell = (rows: unknown[][], r: number, c: number) => String(rows[r]?.[c] ?? '').trim()
const numeric = (value: unknown) => typeof value === 'number' ? value : Number(String(value ?? '').replace(/[^0-9.-]/g, '')) || undefined

function parseWiseProposal(fileName: string, buffer: ArrayBuffer): ExcelPreview {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  const sourceName = workbook.SheetNames.includes('셀러용') ? '셀러용' : workbook.SheetNames[0]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sourceName], { header: 1, defval: '' })
  const supplier: SupplierPilotRow = { ...lifunSupplier, id: `excel-${cell(rows, 5, 18).replace(/\D/g, '') || crypto.randomUUID()}`, companyName: cell(rows, 4, 18) || '공급처 확인 필요', businessNumber: cell(rows, 5, 18), taxEmail: cell(rows, 6, 18), address: cell(rows, 7, 18), bankAccount: cell(rows, 8, 18), businessHours: cell(rows, 9, 18), linkProvision: cell(rows, 10, 18), orderContact: cell(rows, 4, 20), csContact: cell(rows, 5, 20), settlementContact: cell(rows, 6, 20), mainEmail: cell(rows, 7, 20), orderDeadline: cell(rows, 8, 20), sampleSupport: cell(rows, 9, 20), salesHurdle: cell(rows, 10, 20), source: 'excel' }
  const products: ExcelPreview['products'] = []; let lastName = ''
  for (let r = 13; r < rows.length; r += 1) { const no = cell(rows, r, 1); if (!/^\d+$/.test(no)) continue; const name = cell(rows, r, 3) || lastName; if (!name) continue; lastName = name; products.push({ name, option: cell(rows, r, 5), regularPrice: numeric(rows[r]?.[7]), salePrice: numeric(rows[r]?.[9]), supplyPrice: numeric(rows[r]?.[11]), commissionRate: numeric(rows[r]?.[18]) }) }
  supplier.linkedProductCount = products.length; supplier.brands = [fileName.includes('매직캔') ? '매직캔' : '브랜드 확인 필요']
  return { fileName, supplier, brand: supplier.brands[0], products }
}

export function SupplierMasterPage() {
  const { profile } = useCompanyAuth()
  const canWrite = ['ceo', 'admin', 'team_lead', 'md'].includes(profile.role)
  const [suppliers, setSuppliers] = useState<SupplierPilotRow[]>(load)
  const [roleFilter, setRoleFilter] = useState('all')
  const [query, setQuery] = useState(''); const [previewOpen, setPreviewOpen] = useState(false)
  const [editing, setEditing] = useState<SupplierPilotRow | null>(null); const [excelPreview, setExcelPreview] = useState<ExcelPreview | null>(null)
  const [textImportOpen, setTextImportOpen] = useState(false); const [textInput, setTextInput] = useState('')
  const [textPreview, setTextPreview] = useState<SupplierTextParseResult | null>(null); const [mergeTargetId, setMergeTargetId] = useState('new')
  const [message, setMessage] = useState(''); const fileRef = useRef<HTMLInputElement>(null)
  const backupRef = useRef<HTMLInputElement>(null)
  const filtered = useMemo(() => suppliers.filter((item) => (roleFilter === 'all' || (item.partnerType ?? 'supplier') === roleFilter || item.partnerType === 'both') && `${item.companyName} ${item.businessNumber ?? ''}`.toLowerCase().includes(query.toLowerCase())), [query, suppliers, roleFilter])
  const upsert = async (supplier: SupplierPilotRow) => { const map = new Map(suppliers.map((item) => [item.id, item])); map.set(supplier.id, supplier); setSuppliers(saveAll(Array.from(map.values()))); setEditing(null); try { await cloudSyncService.syncKeys([STORAGE_KEY]); setMessage('거래처 정보와 구분을 저장했습니다.') } catch { setMessage('이 기기에는 저장됐지만 공용 저장을 확인하지 못했습니다. 연결 상태를 확인하고 다시 저장해주세요.') } }
  const importPilot = () => { const map = new Map(suppliers.map((item) => [item.id, item])); notionSupplierPilot10.forEach((item) => map.set(item.id, { ...map.get(item.id), ...item, source: 'notion' })); setSuppliers(saveAll(Array.from(map.values()))); setPreviewOpen(false); setMessage('노션 공급처 10건을 가져왔습니다. 빈 항목은 보완 필요로 남겨두었습니다.') }
  const importLifun = () => { upsert(lifunSupplier); setPreviewOpen(false); setMessage('노션과 첨부 엑셀을 합쳐 라이펀 거래처 정보를 가져왔습니다.') }
  const readExcel = async (file?: File) => { if (!file) return; try { setExcelPreview(parseWiseProposal(file.name, await file.arrayBuffer())) } catch { setMessage('엑셀 구조를 읽지 못했습니다. 와이즈 제안서 양식인지 확인해주세요.') } }
  const applyExcel = () => { if (!excelPreview) return; upsert(excelPreview.supplier); localStorage.setItem(`t3-excel-products-${excelPreview.supplier.id}`, JSON.stringify(excelPreview)); setMessage(`${excelPreview.supplier.companyName}과 ${excelPreview.brand} 상품 ${excelPreview.products.length}개를 업로드했습니다.`); setExcelPreview(null) }
  const analyzeText = () => {
    const result = parseSupplierText(textInput)
    const exact = findSupplierDuplicates(result.supplier, suppliers).find((item) => item.kind === 'exact')
    setTextPreview(result)
    setMergeTargetId(exact?.supplier.id ?? 'new')
  }
  const applyText = () => {
    if (!textPreview?.supplier.companyName.trim()) return
    const incoming = { ...textPreview.supplier, registeredBy: profile.display_name, businessRegistrationDocumentStatus: textPreview.supplier.businessRegistrationDocumentStatus ?? 'missing' as const }
    const existing = suppliers.find((item) => item.id === mergeTargetId)
    upsert(existing ? mergeSupplier(existing, incoming) : incoming)
    setMessage(existing ? `${existing.companyName}의 기존 정보에 복붙 내용을 반영했습니다.` : `${incoming.companyName} 공급처를 등록했습니다. 사업자등록증은 나중에 추가할 수 있습니다.`)
    setTextImportOpen(false); setTextInput(''); setTextPreview(null); setMergeTargetId('new')
  }
  const closeTextImport = () => { setTextImportOpen(false); setTextInput(''); setTextPreview(null); setMergeTargetId('new') }
  const exportBackup = (suppliersOnly: boolean) => {
    try {
      downloadBrowserBackup(suppliersOnly)
      setMessage('백업 다운로드를 시작했습니다. 다운로드 폴더에서 파일을 확인해주세요. 기존 자료는 변경하지 않았습니다.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '백업 파일을 만들지 못했습니다. 다시 시도해주세요.')
    }
  }
  const importBackup = async (file?: File) => {
    if (!file) return
    try {
      const incoming = extractSupplierRowsFromBackup(await file.text()) as SupplierPilotRow[]
      const result = mergeSupplierBackup(suppliers, incoming)
      setSuppliers(saveAll(result.rows))
      setMessage(`거래처 백업 ${result.imported}건을 확인해 신규 ${result.added}건을 추가하고 중복 ${result.merged}건은 기존 정보를 지우지 않고 병합했습니다.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '거래처 백업 파일을 읽지 못했습니다.')
    } finally {
      if (backupRef.current) backupRef.current.value = ''
    }
  }
  return <section className="master-page supplier-master-page">
    {canWrite && <div className="info-panel"><p>공급처 자료는 공용 DB 이전 전에 각 PC에서 백업할 수 있습니다. 직원 PC의 백업을 이곳에서 불러오면 기존 거래처를 지우지 않고 합칩니다.</p><div className="button-row"><button className="secondary-button" onClick={() => exportBackup(true)}>공급처 DB 전체 내보내기</button><input ref={backupRef} hidden type="file" accept="application/json,.json" onChange={(event) => void importBackup(event.target.files?.[0])} /><button className="secondary-button" onClick={() => backupRef.current?.click()}>공급처 백업 불러오기·병합</button>{['ceo', 'admin'].includes(profile.role) && <button className="secondary-button" onClick={() => exportBackup(false)}>이 브라우저 업무자료 백업</button>}</div><small>동일 ID·사업자번호·정규화한 거래처명은 한 업체로 합치고, 현재 저장된 값은 자동으로 지우지 않습니다.</small></div>}
    <div className="master-page__heading"><div><p className="page-eyebrow">SUPPLIER DATABASE</p><h1>거래처 DB</h1><p>계약·발주·CS·정산의 공통 정보를 한 번 등록하고 여러 브랜드에 연결합니다.</p></div><div className="button-row">{canWrite && <><button className="primary-button" onClick={() => setTextImportOpen(true)}>텍스트로 등록</button><button className="secondary-button" onClick={() => setPreviewOpen(true)}>Notion에서 가져오기</button><input ref={fileRef} hidden type="file" accept=".xlsx,.xls,.csv" onChange={(event) => void readExcel(event.target.files?.[0])} /><button className="secondary-button" onClick={() => fileRef.current?.click()}>엑셀 업로드</button><button className="secondary-button" onClick={() => setEditing(emptySupplier())}>직접 입력</button></>}</div></div>
    {!canWrite && <p className="info-panel">현재 계정은 공급처를 조회할 수 있지만 등록·수정 권한은 없습니다. 대표·관리자·팀장·MD 계정에서 등록할 수 있습니다.</p>}
    {message && <p className="success-panel">{message}</p>}
    <div className="supplier-flow"><div><span>1</span><strong>공급처</strong><small>계약·계좌·담당자</small></div><b>→</b><div><span>2</span><strong>브랜드</strong><small>한 공급처에 여러 개</small></div><b>→</b><div><span>3</span><strong>상품</strong><small>브랜드별 제품군</small></div></div>
    {canWrite && <div className="supplier-text-entry"><div><span className="supplier-text-entry__icon">T</span><div><strong>직원은 정리된 내용을 그대로 붙여넣으세요</strong><p>거래처·브랜드·담당자·정산 조건을 자동으로 나누고, 중복 후보와 빠진 정보는 등록 전에 확인합니다.</p></div></div><button className="primary-button" onClick={() => setTextImportOpen(true)}>복붙 등록 시작</button></div>}
    <div className="notion-import-summary"><div><span>등록 거래처</span><strong>{suppliers.length}곳</strong></div><div><span>연결 브랜드</span><strong>{new Set(suppliers.flatMap((item) => item.brands ?? [])).size}개</strong></div><div><span>정보 보완 필요</span><strong>{suppliers.filter((item) => !item.businessNumber || !item.bankAccount).length}곳</strong></div></div>
    <div className="panel"><div className="panel__header"><div><h2>거래처 목록</h2><p>사업자·계좌 정보는 공급처에 한 번만 저장합니다.</p></div><select aria-label="거래처 구분 필터" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="all">구분 전체</option><option value="supplier">공급사</option><option value="vendor">벤더</option></select><input placeholder="거래처명 또는 사업자번호 검색" value={query} onChange={(event) => setQuery(event.target.value)} /></div>{filtered.length ? <div className="responsive-table"><table><thead><tr><th>거래처명</th><th>구분</th><th>사업자등록번호</th><th>계좌</th><th>브랜드</th><th>연결 상품</th><th>상태</th><th>관리</th></tr></thead><tbody>{filtered.map((item) => <tr key={item.id}><td><strong>{item.companyName}</strong><small>{item.source === 'excel' ? '엑셀' : item.source === 'notion' ? 'Notion' : item.source === 'text' ? `텍스트${item.registeredBy ? ` · ${item.registeredBy}` : ''}` : '직접 등록'}</small></td><td>{partnerTypeLabel(item.partnerType)}</td><td>{item.businessNumber || '미등록'}</td><td>{item.bankAccount || '미등록'}</td><td>{item.brands?.join(', ') || '미연결'}</td><td>{item.linkedProductCount}개</td><td><span className={`status-badge ${item.businessNumber && item.bankAccount ? 'done' : 'waiting'}`}>{item.businessNumber && item.bankAccount ? '기본정보 완료' : '보완 필요'}</span></td><td><button className="text-button" onClick={() => setEditing(item)}>{canWrite ? '상세·수정' : '상세 보기'}</button></td></tr>)}</tbody></table></div> : <div className="master-empty">등록된 공급처가 없습니다. 텍스트를 붙여넣어 첫 공급처를 등록할 수 있습니다.</div>}</div>
    {editing && <SupplierEditor readOnly={!canWrite} value={editing} onChange={setEditing} onClose={() => setEditing(null)} onSave={upsert} />}
    {previewOpen && <div className="nested-modal-backdrop"><section className="helper-modal supplier-import-modal"><h3>노션 공급처 가져오기</h3><p>전체 10건 또는 라이펀 1건만 선택할 수 있습니다.</p><div className="supplier-import-choice"><button onClick={importLifun}><strong>라이펀 1건</strong><span>매직캔·고로고로 연결 정보 포함</span></button><button onClick={importPilot}><strong>최근 공급처 10건</strong><span>누락값은 보완 필요로 표시</span></button></div><div className="button-row"><button className="secondary-button" onClick={() => setPreviewOpen(false)}>닫기</button></div></section></div>}
    {excelPreview && <div className="nested-modal-backdrop"><section className="helper-modal supplier-import-modal"><h3>엑셀 업로드 미리보기</h3><p>{excelPreview.fileName}</p><PartnerTypeField value={excelPreview.supplier.partnerType} onChange={(partnerType) => setExcelPreview({ ...excelPreview, supplier: { ...excelPreview.supplier, partnerType } })} /><div className="excel-import-summary"><span>공급처 <strong>{excelPreview.supplier.companyName}</strong></span><span>브랜드 <strong>{excelPreview.brand}</strong></span><span>상품·옵션 <strong>{excelPreview.products.length}개</strong></span></div><div className="responsive-table"><table><thead><tr><th>상품</th><th>구성</th><th>정상가</th><th>공구가</th><th>공급가</th><th>총수수료</th></tr></thead><tbody>{excelPreview.products.map((item, index) => <tr key={`${item.name}-${index}`}><td>{item.name}</td><td>{item.option}</td><td>{item.regularPrice?.toLocaleString('ko-KR') || '-'}</td><td>{item.salePrice?.toLocaleString('ko-KR') || '-'}</td><td>{item.supplyPrice?.toLocaleString('ko-KR') || '-'}</td><td>{item.commissionRate !== undefined ? `${Math.round(item.commissionRate * 100)}%` : '-'}</td></tr>)}</tbody></table></div><div className="button-row"><button className="secondary-button" onClick={() => setExcelPreview(null)}>취소</button><button className="primary-button" onClick={applyExcel}>공급처·브랜드·상품 업로드</button></div></section></div>}
    {textImportOpen && <SupplierTextImportModal input={textInput} mergeTargetId={mergeTargetId} preview={textPreview} suppliers={suppliers} onAnalyze={analyzeText} onApply={applyText} onChangeInput={setTextInput} onChangeMergeTarget={setMergeTargetId} onChangePreview={setTextPreview} onClose={closeTextImport} />}
  </section>
}

function SupplierEditor({ value, readOnly, onChange, onClose, onSave }: { value: SupplierPilotRow; readOnly?: boolean; onChange: (value: SupplierPilotRow) => void; onClose: () => void; onSave: (value: SupplierPilotRow) => void }) {
  const [brandInput, setBrandInput] = useState((value.brands ?? []).join(', '))
  const patch = (key: keyof SupplierPilotRow, next: string) => onChange({ ...value, [key]: key === 'bankAccount' ? sanitizeAccountNumberInput(next) : next })
  const fields: Array<[keyof SupplierPilotRow, string]> = [['companyName','거래처명 *'],['businessNumber','사업자등록번호'],['taxEmail','세금 발행 메일'],['address','주소'],['bankName','은행명'],['bankAccount','계좌번호'],['accountHolder','예금주'],['mainContact','대표 담당자 / 연락처'],['businessHours','업무시간'],['linkProvision','링크 제공 여부'],['orderContact','발주 담당 연락처 / 메일'],['csContact','CS 담당 연락처 / 메일'],['settlementContact','정산 담당 연락처 / 메일'],['mainEmail','대표 업무메일'],['orderDeadline','발주 마감 시간'],['sampleSupport','샘플 지원 여부'],['salesHurdle','매출 허들'],['memo','기타 메모']]
  const brands = brandInput.split(/[,\n]/).map((brand) => brand.trim()).filter(Boolean)
  return <div className="nested-modal-backdrop"><section className="helper-modal supplier-edit-modal"><h3>{readOnly ? '거래처 상세 보기' : value.companyName ? '거래처 상세·수정' : '신규 거래처 등록'}</h3><p>공급처 공통정보는 연결된 브랜드와 일정에서 함께 사용합니다.</p><div className="supplier-edit-grid"><PartnerTypeField value={value.partnerType} disabled={readOnly} onChange={(partnerType) => onChange({ ...value, partnerType })} /><label className="supplier-brand-field"><span>관리 브랜드</span><input disabled={readOnly} placeholder="예: 매직캔, 고로고로, 먼지더스터" value={brandInput} onChange={(event) => setBrandInput(event.target.value)} /><small>여러 브랜드는 쉼표로 구분하세요.</small>{brands.length > 0 && <div className="supplier-brand-tags">{brands.map((brand) => <span key={brand}>{brand}</span>)}</div>}</label>{fields.map(([key,label]) => <label key={key}><span>{label}</span>{['address','sampleSupport','salesHurdle','memo'].includes(String(key)) ? <textarea disabled={readOnly} rows={key === 'memo' ? 4 : 2} value={String(value[key] ?? '')} onChange={(event) => patch(key, event.target.value)} /> : <input disabled={readOnly} value={String(value[key] ?? '')} onChange={(event) => patch(key, event.target.value)} />}</label>)}</div><div className="button-row"><button className="secondary-button" onClick={onClose}>{readOnly ? '닫기' : '취소'}</button>{!readOnly && <button className="primary-button" disabled={!value.companyName.trim()} onClick={() => onSave({ ...value, brands })}>저장</button>}</div></section></div>
}

function SupplierTextImportModal({ input, mergeTargetId, preview, suppliers, onAnalyze, onApply, onChangeInput, onChangeMergeTarget, onChangePreview, onClose }: { input: string; mergeTargetId: string; preview: SupplierTextParseResult | null; suppliers: SupplierPilotRow[]; onAnalyze: () => void; onApply: () => void; onChangeInput: (value: string) => void; onChangeMergeTarget: (value: string) => void; onChangePreview: (value: SupplierTextParseResult | null) => void; onClose: () => void }) {
  const duplicateMatches = preview ? findSupplierDuplicates(preview.supplier, suppliers) : []
  const reviewWarnings = preview ? [
    !preview.supplier.companyName && '거래처명을 입력해주세요.',
    !preview.supplier.businessNumber && '사업자등록번호가 없습니다. 등록 후 나중에 보완할 수 있습니다.',
    !preview.supplier.bankAccount && '계좌정보가 없습니다. 지급 전 반드시 별도 확인이 필요합니다.',
    !preview.supplier.brands?.length && '연결할 브랜드가 없습니다. 공급처만 먼저 등록할 수 있습니다.',
  ].filter(Boolean) as string[] : []
  const patch = (key: keyof SupplierPilotRow, value: string | string[]) => {
    if (!preview) return
    onChangePreview({ ...preview, supplier: { ...preview.supplier, [key]: value } })
  }
  return <div className="nested-modal-backdrop"><section aria-modal="true" className="helper-modal supplier-text-modal" role="dialog">
    <header className="supplier-text-modal__header"><div><p className="page-eyebrow">TEXT TO SUPPLIER</p><h2>텍스트로 거래처 등록</h2><p>{preview ? '추출한 정보와 중복 후보를 확인한 뒤 등록하세요.' : '직원이 전달받은 거래처 정보를 형식에 맞춰 다시 입력할 필요 없이 그대로 붙여넣습니다.'}</p></div><button aria-label="닫기" className="modal-close" onClick={onClose} type="button">×</button></header>
    {!preview ? <>
      <div className="supplier-text-steps"><span className="active">1. 내용 붙여넣기</span><span>2. 자동 분류·검수</span><span>3. 등록</span></div>
      <label className="supplier-text-input"><span>거래처 정보</span><textarea autoFocus placeholder={'거래처: 마르스랩스\n브랜드: 브릭글로\n담당자 또는 연락처: 010-0000-0000\n정산 담당: settlement@example.com\n발주 방식: 지정 엑셀 이메일 발송\n메모: 사업자등록증 추후 등록'} value={input} onChange={(event) => onChangeInput(event.target.value)} /><small>항목 순서는 상관없습니다. 없는 정보는 비워두며 시스템이 임의로 만들지 않습니다.</small></label>
      <div className="button-row"><button className="secondary-button" onClick={onClose} type="button">취소</button><button className="primary-button" disabled={!input.trim()} onClick={onAnalyze} type="button">자동 분류하기</button></div>
    </> : <>
      <div className="supplier-text-steps"><span>1. 내용 붙여넣기</span><span className="active">2. 자동 분류·검수</span><span>3. 등록</span></div>
      <div className="supplier-text-review-layout"><section className="supplier-text-card"><div className="supplier-text-card__title"><h3>등록 정보 미리보기</h3><span>{preview.recognizedFields.length}개 항목 인식</span></div><div className="supplier-text-review-grid">
        <PartnerTypeField value={preview.supplier.partnerType} onChange={(partnerType) => onChangePreview({ ...preview, supplier: { ...preview.supplier, partnerType } })} /><label><span>거래처명 *</span><input value={preview.supplier.companyName} onChange={(event) => patch('companyName', event.target.value)} /></label>
        <label><span>브랜드</span><input value={(preview.supplier.brands ?? []).join(', ')} onChange={(event) => patch('brands', event.target.value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean))} /></label>
        <label><span>사업자등록번호</span><input value={preview.supplier.businessNumber ?? ''} onChange={(event) => patch('businessNumber', event.target.value)} /></label>
        <label><span>대표 담당자 / 연락처</span><input value={preview.supplier.mainContact ?? ''} onChange={(event) => patch('mainContact', event.target.value)} /></label>
        <label><span>대표 업무메일</span><input value={preview.supplier.mainEmail ?? ''} onChange={(event) => patch('mainEmail', event.target.value)} /></label>
        <label><span>세금발행메일</span><input value={preview.supplier.taxEmail ?? ''} onChange={(event) => patch('taxEmail', event.target.value)} /></label>
        <label><span>은행</span><input value={preview.supplier.bankName ?? ''} onChange={(event) => patch('bankName', event.target.value)} /></label>
        <label><span>계좌번호</span><input inputMode="text" placeholder="예: 140-013-654140" value={preview.supplier.bankAccount ?? ''} onChange={(event) => patch('bankAccount', sanitizeAccountNumberInput(event.target.value))} /></label>
        <label><span>예금주</span><input value={preview.supplier.accountHolder ?? ''} onChange={(event) => patch('accountHolder', event.target.value)} /></label>
        <label><span>업무시간</span><input value={preview.supplier.businessHours ?? ''} onChange={(event) => patch('businessHours', event.target.value)} /></label>
        <label><span>발주 담당자 연락처/메일</span><input value={preview.supplier.orderContact ?? ''} onChange={(event) => patch('orderContact', event.target.value)} /></label>
        <label><span>CS 담당자 연락처/메일</span><input value={preview.supplier.csContact ?? ''} onChange={(event) => patch('csContact', event.target.value)} /></label>
        <label><span>정산 담당</span><input value={preview.supplier.settlementContact ?? ''} onChange={(event) => patch('settlementContact', event.target.value)} /></label>
        <label><span>발주 마감 시간</span><input value={preview.supplier.orderDeadline ?? ''} onChange={(event) => patch('orderDeadline', event.target.value)} /></label>
        <label><span>매출 허들</span><input value={preview.supplier.salesHurdle ?? ''} onChange={(event) => patch('salesHurdle', event.target.value)} /></label>
        <label className="wide"><span>링크 제공 여부</span><textarea rows={2} value={preview.supplier.linkProvision ?? ''} onChange={(event) => patch('linkProvision', event.target.value)} /></label>
        <label className="wide"><span>발주 방식</span><textarea rows={2} value={preview.supplier.orderMethod ?? ''} onChange={(event) => patch('orderMethod', event.target.value)} /></label>
        <label className="wide"><span>샘플 지원 여부</span><textarea rows={2} value={preview.supplier.sampleSupport ?? ''} onChange={(event) => patch('sampleSupport', event.target.value)} /></label>
        <label className="wide"><span>주소</span><textarea rows={2} value={preview.supplier.address ?? ''} onChange={(event) => patch('address', event.target.value)} /></label>
        <label className="wide"><span>기타 메모</span><textarea rows={3} value={preview.supplier.memo ?? ''} onChange={(event) => patch('memo', event.target.value)} /></label>
      </div></section><aside className="supplier-text-checks">
        <section><h3>보완 항목</h3>{reviewWarnings.length ? <ul>{reviewWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : <p className="supplier-check-ok">필수 검수 항목이 모두 확인됐습니다.</p>}<p className="supplier-document-note"><strong>사업자등록증</strong><span>미등록 · 거래처 저장 가능</span></p></section>
        <section><h3>중복 검사</h3>{duplicateMatches.length ? <div className="supplier-duplicate-options"><label><input checked={mergeTargetId === 'new'} name="merge-target" onChange={() => onChangeMergeTarget('new')} type="radio" />새 공급처로 등록</label>{duplicateMatches.map((match) => <label key={match.supplier.id}><input checked={mergeTargetId === match.supplier.id} name="merge-target" onChange={() => onChangeMergeTarget(match.supplier.id)} type="radio" /><span><strong>{match.supplier.companyName}</strong><small>{match.kind === 'exact' ? '동일 업체 가능성 높음' : '비슷한 업체'} · {match.reasons.join(', ')}</small></span></label>)}</div> : <p className="supplier-check-ok">등록된 공급처에서 중복 후보가 발견되지 않았습니다.</p>}</section>
      </aside></div>
      <div className="supplier-text-source"><strong>원문 보관</strong><p>등록 근거와 추후 검수를 위해 직원이 붙여넣은 원문을 함께 보관합니다.</p></div>
      <div className="button-row"><button className="secondary-button" onClick={() => onChangePreview(null)} type="button">다시 붙여넣기</button><button className="primary-button" disabled={!preview.supplier.companyName.trim()} onClick={onApply} type="button">{mergeTargetId === 'new' ? '공급처 등록' : '기존 업체에 반영'}</button></div>
    </>}
  </section></div>
}

function partnerTypeLabel(value: SupplierPilotRow['partnerType']) { return value === 'vendor' ? '벤더' : value === 'both' ? '공급사·벤더' : '공급사' }
function PartnerTypeField({ value, disabled, onChange }: { value: SupplierPilotRow['partnerType']; disabled?: boolean; onChange: (value: NonNullable<SupplierPilotRow['partnerType']>) => void }) {
  return <fieldset style={{ gridColumn: '1 / -1', minWidth: 0, border: 0, padding: 0 }}><legend>거래처 구분</legend><div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>{(['supplier', 'vendor', 'both'] as const).map((type) => <label key={type} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><input style={{ width: 18, height: 18, minHeight: 18 }} type="radio" checked={(value ?? 'supplier') === type} disabled={disabled} onChange={() => onChange(type)} />{partnerTypeLabel(type)}</label>)}</div></fieldset>
}
