import { sellerMasterService, type SellerMaster } from '../../../shared/services/sellerMasterService'
import { downloadBaljumoa } from '../../../features/samples/baljumoaExport'
import { useEffect, useRef, useState } from 'react'
import { SAMPLE_ORDER_STATUSES, SAMPLE_PAYERS, SAMPLE_PAYER_HELP, sampleExportRows, sampleTotals, type SampleOrder, type SampleOrderDraft, type SampleOrderStatus } from '../../../features/samples/sampleOrderModel'
import { sampleOrderStore, sampleRequestId } from '../../../features/samples/sampleOrderStore'
import { SampleCostSummary, SampleOrderForm, sampleMoney } from './SampleOrderForm'
import { SampleOrderDialog } from './SampleOrderDialog'
import '../sample-orders.css'

const emptyFilter = { search: '', manager: '', seller: '', payer: '', status: '', reflected: '', from: '', to: '' }
const dateLabel = (value: string) => new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })

async function downloadOrders(orders: SampleOrder[], batchId: string) {
  if (orders.some((order) => order.status === '취소')) throw new Error('취소된 샘플이 포함된 파일입니다. 발주 담당자에게 기존 파일의 취소 처리를 확인해주세요.')
  const XLSX = await import('xlsx')
  const book = XLSX.utils.book_new()
  // Typed string cells preserve leading-zero phone numbers without formulas.
  const sheet = XLSX.utils.aoa_to_sheet(sampleExportRows(orders))
  sheet['!cols'] = [48, 28, 42, 8, 18, 20, 55, 35].map((wch) => ({ wch }))
  XLSX.utils.book_append_sheet(book, sheet, '내부 샘플 발주')
  XLSX.writeFile(book, `내부_샘플발주_${batchId}.xlsx`)
}

export function SampleOrderPanel({ initialSampleId }: { initialSampleId?: string | null }) {
  const [orders, setOrders] = useState<SampleOrder[]>([])
  const [filter, setFilter] = useState(emptyFilter)
  const [selected, setSelected] = useState<string[]>([])
  const [detailId, setDetailId] = useState<string | null>(initialSampleId ?? null)
  const [form, setForm] = useState<'new' | SampleOrder | null>(null)
  const requestId = useRef('')
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [reference, setReference] = useState('')
  const [sellerChoices, setSellerChoices] = useState<SellerMaster[]>([])
  const [linkSellerId, setLinkSellerId] = useState('')
  useEffect(() => { void sellerMasterService.loadSellers().then(setSellerChoices).catch(() => setError('셀러 연결 후보를 불러오지 못했습니다.')) }, [])
  const detail = orders.find((order) => order.id === detailId)
  const refresh = async () => { setLoading(true); setError(''); try { setOrders(await sampleOrderStore.list()) } catch (reason) { setError(reason instanceof Error ? reason.message : '샘플을 불러오지 못했습니다.') } finally { setLoading(false) } }
  useEffect(() => { void refresh() }, [])
  const action = async (run: () => Promise<void>) => {
    if (lock.current) return
    lock.current = true; setBusy(true); setError(''); setNotice('')
    try { await run() } catch (reason) { setError(reason instanceof Error ? reason.message : '처리하지 못했습니다. 새로고침 후 확인해주세요.') } finally { lock.current = false; setBusy(false) }
  }
  const changeStatus = (next: SampleOrderStatus) => {
    if (!detail) return
    if (next === '취소' && !window.confirm(detail.exportBatchId ? 'T3 요청만 취소됩니다. 발주모아·공급사에도 별도 취소를 확인해야 합니다. 계속할까요?' : '샘플 요청을 취소할까요?')) return
    void action(async () => { setOrders(await sampleOrderStore.transition(detail.id, detail.status, next, reference, detail.history.length)); setNotice('상태와 처리 이력을 저장했습니다.'); setReference('') })
  }
  const exportOrders = () => void action(async () => {
    const result = await sampleOrderStore.export(selected)
    setOrders(result.orders); setSelected([])
    // Reserve in the database BEFORE offering the file. A lost download is
    // recovered using the original batch, never by creating another order.
    await downloadBaljumoa(result.batch, result.batchId)
    setNotice('발주모아용 Excel을 생성했습니다. 발주모아에 전달한 후 상세에서 발주완료를 기록해주세요. 다운로드 실패 시 상세에서 같은 파일을 다시 받을 수 있습니다.')
  })
  const redownload = () => void action(async () => {
    if (!detail?.exportBatchId) return
    await downloadBaljumoa(orders.filter((order) => order.exportBatchId === detail.exportBatchId), detail.exportBatchId)
  })
  const save = async (draft: SampleOrderDraft) => {
    const saved = form === 'new' ? await sampleOrderStore.create(draft, requestId.current)
      : form ? await sampleOrderStore.edit(form.id, draft, form.history.length) : orders
    setOrders(saved); setForm(null); setNotice('샘플 요청을 저장했습니다. 상세에서 승인 요청을 진행해주세요.')
  }
  const filtered = orders.filter((order) => {
    const text = `${order.id} ${order.brandName} ${order.productName} ${order.optionName} ${order.detailOption} ${order.campaignName}`.toLowerCase()
    const day = new Date(order.requestedAt).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
    return text.includes(filter.search.toLowerCase()) && (!filter.manager || order.managerId === filter.manager) && (!filter.seller || order.sellerId === filter.seller)
      && (!filter.payer || order.payer === filter.payer) && (!filter.status || order.status === filter.status)
      && (!filter.reflected || String(order.settlementReflected) === filter.reflected) && (!filter.from || day >= filter.from) && (!filter.to || day <= filter.to)
  })
  const setField = (key: keyof typeof emptyFilter, value: string) => { setFilter((current) => ({ ...current, [key]: value })); setSelected([]) }
  const options = (key: 'manager' | 'seller') => [...new Map(orders.map((order) => [key === 'manager' ? order.managerId : order.sellerId, key === 'manager' ? order.managerName : order.sellerName])).entries()]
  return <section className="sample-orders panel">
    <div className="panel__header"><div><p className="page-eyebrow">SAMPLE OPERATIONS</p><h2>샘플관리</h2><p>요청 → 승인 → 발주파일 생성 → 발주·배송 이력</p></div><button className="primary-button" type="button" disabled={busy || loading || !!error} onClick={() => { requestId.current = sampleRequestId(); setForm('new') }}>+ 샘플 요청</button></div>
    <div className="sample-orders-body">
      <div className="sample-order-filters">
        <label>상품·SKU·공구 검색<input value={filter.search} onChange={(event) => setField('search', event.target.value)} /></label>
        {(['manager', 'seller'] as const).map((key) => <label key={key}>{key === 'manager' ? '매니저' : '셀러'}<select value={filter[key]} onChange={(event) => setField(key, event.target.value)}><option value="">전체</option>{options(key).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>)}
        <label>부담주체<select value={filter.payer} onChange={(event) => setField('payer', event.target.value)}><option value="">전체</option>{Object.entries(SAMPLE_PAYERS).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
        <label>발주상태<select value={filter.status} onChange={(event) => setField('status', event.target.value)}><option value="">전체</option>{SAMPLE_ORDER_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>
        <label>정산반영<select value={filter.reflected} onChange={(event) => setField('reflected', event.target.value)}><option value="">전체</option><option value="false">미반영</option><option value="true">반영 완료</option></select></label>
        <label>요청일 시작<input type="date" value={filter.from} onChange={(event) => setField('from', event.target.value)} /></label><label>요청일 종료<input type="date" value={filter.to} onChange={(event) => setField('to', event.target.value)} /></label>
      </div>
      <div className="sample-toolbar"><label><input type="checkbox" disabled={busy} checked={filtered.some(order => order.status === '발주대기' && !order.exportBatchId && !order.orderedAt) && filtered.filter(order => order.status === '발주대기' && !order.exportBatchId && !order.orderedAt).every(order => selected.includes(order.id))} onChange={event => setSelected(event.target.checked ? filtered.filter(order => order.status === '발주대기' && !order.exportBatchId && !order.orderedAt).map(order => order.id) : [])} />발주 가능 전체 선택</label><span>{filtered.length}건 · 선택 {selected.length}건</span><button type="button" className="secondary-button" disabled={busy} onClick={() => void refresh()}>새로고침</button><button type="button" className="primary-button" disabled={busy || !selected.length} onClick={exportOrders}>발주모아용 Excel</button><button type="button" className="secondary-button" disabled={busy || !selected.length} onClick={() => void action(async () => { await downloadOrders(orders.filter(order => selected.includes(order.id)), '관리용'); setNotice('내부 관리용 파일입니다. 발주 예약이나 상태는 변경하지 않았습니다.') })}>내부 관리용 Excel</button></div>
      <p className="sample-export-note">승인된 발주대기 건만 선택할 수 있습니다. 발주모아용은 전달받은 수기발주서 양식을 사용하며, 파일 생성 후 중복 발주를 막습니다. 다운로드가 실패하면 상세에서 같은 파일을 다시 받으세요.</p>
      {error && !detail && <p className="sample-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
      <div className="sample-order-table-wrap"><table className="sample-order-table"><thead><tr>{['선택', '요청일 / 식별번호', '매니저 / 셀러', '공구명', '상품', 'SKU / 세부옵션', '수량', '회사원가', '부담주체', '발주상태', '정산반영', '상세'].map((label) => <th key={label}>{label}</th>)}</tr></thead><tbody>
        {loading && <tr><td colSpan={12}>샘플 정보를 불러오는 중…</td></tr>}{!loading && !filtered.length && <tr><td colSpan={12}>{error ? '조회에 실패했습니다. 새로고침해주세요.' : '조건에 맞는 샘플 요청이 없습니다.'}</td></tr>}
        {filtered.map((order) => <tr key={order.id}>
          <td><input type="checkbox" title={order.orderedAt ? '이미 발주 완료' : order.exportBatchId ? '파일 생성 완료 · 상세에서 재다운로드' : order.status !== '발주대기' ? '상세에서 승인 후 선택 가능' : '발주파일에 포함'} aria-label={`${order.productName} ${order.id} 선택`} disabled={busy || order.status !== '발주대기' || !!order.exportBatchId || !!order.orderedAt} checked={selected.includes(order.id)} onChange={(event) => setSelected((ids) => event.target.checked ? [...ids, order.id] : ids.filter((id) => id !== order.id))} /></td>
          <td>{dateLabel(order.requestedAt)}<small title={order.id}>{order.id}</small></td><td>{order.managerName}<small>{order.sellerName || order.targetDisplayName || '셀러 미지정'}</small></td><td>{order.campaignName || '미연결'}</td><td>[{order.brandName}] {order.productName}</td><td>{order.optionName}<small>{order.detailOption || '—'}</small></td><td>{order.quantity}</td><td className="sample-money">{sampleMoney(sampleTotals(order).companyCost)}</td><td>{SAMPLE_PAYERS[order.payer]}</td><td><strong>{order.status}</strong>{order.exportBatchId && <small>파일 생성됨</small>}</td><td>{order.settlementReflected ? '반영 완료' : '미반영'}</td><td><button className="secondary-button" type="button" onClick={() => { setDetailId(order.id); setReference(''); setError('') }}>상세</button></td>
        </tr>)}
      </tbody></table></div>
    </div>
    {detail && !form && <SampleOrderDialog title="샘플 요청 상세" onClose={() => setDetailId(null)} busy={busy}>
      <p className="sample-id">{detail.id}</p>{!detail.sellerId && <section><label>확인된 기존 셀러 연결<select value={linkSellerId} onChange={event => setLinkSellerId(event.target.value)}><option value="">셀러 선택</option>{sellerChoices.map(seller => <option key={seller.id} value={seller.id}>{seller.name}</option>)}</select></label><button type="button" className="secondary-button" disabled={busy || !linkSellerId} onClick={() => void action(async () => { const seller = sellerChoices.find(item => item.id === linkSellerId); if (!seller) return; setOrders(await sampleOrderStore.connectSeller(detail.id, seller, detail.history.length)); setNotice('셀러를 연결했습니다. 기존 배송정보와 비용은 유지됩니다.') })}>선택 셀러 연결</button></section>}<h3>[{detail.brandName}] {detail.productName}</h3><p>{detail.optionName} · {detail.detailOption || '세부옵션 없음'} · {detail.quantity}개</p>
      <dl className="sample-detail-grid"><div><dt>매니저 / 셀러</dt><dd>{detail.managerName} / {detail.sellerName || detail.targetDisplayName || '셀러 미지정'}</dd></div><div><dt>관련 공구</dt><dd>{detail.campaignName || '미연결'}</dd></div><div><dt>수령인 / 연락처</dt><dd>{detail.recipient} / {detail.phone}</dd></div><div><dt>주소</dt><dd>{detail.address}</dd></div><div><dt>배송메모</dt><dd>{detail.deliveryMemo || '없음'}</dd></div><div><dt>샘플 목적 / 메모</dt><dd>{detail.purpose} / {detail.memo || '없음'}</dd></div><div><dt>상태</dt><dd>{detail.status}</dd></div><div><dt>정산</dt><dd>{detail.settlementReflected ? '반영 완료' : '미반영 · 이번 단계는 비용 저장만 진행'}</dd></div></dl>
      <p>{SAMPLE_PAYERS[detail.payer]} · {SAMPLE_PAYER_HELP[detail.payer]}</p><SampleCostSummary draft={detail} /><p>비용 기준: {dateLabel(detail.costs.capturedAt)} · {detail.costs.source === 'manual' ? '요청에서 직접 확인' : 'SKU 거래조건'}</p>
      {detail.exportBatchId && <section className="sample-order-section"><h3>발주파일</h3><p>이미 생성된 파일입니다. 재다운로드는 새 발주가 아닙니다. 발주모아에 중복 업로드하지 마세요.</p><button type="button" className="secondary-button" disabled={busy || detail.status === '취소'} onClick={redownload}>같은 발주파일 재다운로드</button>{detail.status === '발주대기' && <label>발주모아 발주번호 / 처리 확인 내용<input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="실제 발주 후 입력" /></label>}{detail.externalOrderReference && <p>발주 확인: {detail.externalOrderReference} · {dateLabel(detail.orderedAt!)}</p>}</section>}
      <details><summary>상태·처리 이력 {detail.history.length}건</summary><ol className="sample-history">{detail.history.map((item, index) => <li key={`${item.at}-${index}`}><strong>{item.action}</strong><span>{item.actor} · {dateLabel(item.at)}</span></li>)}</ol></details>
      {error && <p className="sample-error" role="alert">{error}</p>}
      <footer>
        {detail.status === '요청' && <><button type="button" className="secondary-button" disabled={busy} onClick={() => setForm(detail)}>요청 수정</button><button type="button" className="primary-button" disabled={busy} onClick={() => changeStatus('승인대기')}>승인 요청</button></>}
        {detail.status === '승인대기' && <><button type="button" className="secondary-button" disabled={busy} onClick={() => changeStatus('요청')}>보완 요청</button><button type="button" className="primary-button" disabled={busy} onClick={() => changeStatus('발주대기')}>비용 확인 후 승인</button></>}
        {detail.status === '발주대기' && detail.exportBatchId && <button type="button" className="primary-button" disabled={busy || !reference.trim()} onClick={() => changeStatus('발주완료')}>실제 발주완료 기록</button>}
        {detail.status === '발주완료' && <button type="button" className="primary-button" disabled={busy} onClick={() => changeStatus('배송중')}>배송중으로 변경</button>}
        {detail.status === '배송중' && <button type="button" className="primary-button" disabled={busy} onClick={() => changeStatus('수령완료')}>수령완료</button>}
        {!['취소', '수령완료'].includes(detail.status) && <button type="button" className="secondary-button" disabled={busy} onClick={() => changeStatus('취소')}>요청 취소</button>}
      </footer>
    </SampleOrderDialog>}
    {form && <SampleOrderForm initial={form === 'new' ? undefined : form} onClose={() => setForm(null)} onSave={save} />}
  </section>
}
