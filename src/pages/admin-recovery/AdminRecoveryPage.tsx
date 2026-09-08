import { useEffect, useMemo, useState } from 'react'
import { useCompanyAuth } from '../../features/auth/AuthGate'

type StorageInventory = {
  key: string
  bytes: number
  kind: string
  count?: number
  sampleNames: string[]
  signals: string[]
}

type RecoverySnapshot = {
  createdAt: string
  origin: string
  localStorage: Record<string, string>
  sessionStorage: Record<string, string>
  indexedDbNames: string[]
  cacheNames: string[]
}

const sensitiveSignals = [
  ['셀러', ['seller', '셀러']],
  ['거래처·공급처', ['vendor', 'supplier', '거래처', '공급처']],
  ['사업자 정보', ['businessnumber', 'businessregistration', '사업자등록']],
  ['계좌 정보', ['accountnumber', 'bankname', 'accountholder', '계좌', '은행']],
  ['첨부파일', ['attachment', 'document', 'fileurl', 'dataurl', '사업자등록증', '통장사본']],
] as const

function storageObject(storage: Storage) {
  const result: Record<string, string> = {}
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (key) result[key] = storage.getItem(key) ?? ''
  }
  return result
}

function itemName(value: unknown) {
  if (!value || typeof value !== 'object') return ''
  const item = value as Record<string, unknown>
  const candidate = item.name ?? item.sellerName ?? item.vendorName ?? item.supplierName ?? item.businessName ?? item.companyName
  return typeof candidate === 'string' ? candidate : ''
}

function inventoryOf(values: Record<string, string>) {
  return Object.entries(values).map(([key, raw]): StorageInventory => {
    let parsed: unknown
    try { parsed = JSON.parse(raw) } catch { parsed = undefined }
    const flattened = `${key} ${raw}`.toLowerCase()
    const signals = sensitiveSignals.filter(([, words]) => words.some((word) => flattened.includes(word.toLowerCase()))).map(([label]) => label)
    const array = Array.isArray(parsed) ? parsed : undefined
    return {
      key,
      bytes: new Blob([raw]).size,
      kind: array ? '목록' : parsed && typeof parsed === 'object' ? '객체' : '텍스트',
      count: array?.length,
      sampleNames: (array ?? []).map(itemName).filter(Boolean).slice(0, 5),
      signals,
    }
  }).sort((a, b) => b.bytes - a.bytes)
}

export function AdminRecoveryPage() {
  const { profile } = useCompanyAuth()
  const [snapshot, setSnapshot] = useState<RecoverySnapshot | null>(null)

  useEffect(() => {
    let active = true
    void Promise.all([
      typeof indexedDB.databases === 'function' ? indexedDB.databases().then((items) => items.map((item) => item.name).filter((name): name is string => Boolean(name))) : Promise.resolve([]),
      typeof caches !== 'undefined' ? caches.keys() : Promise.resolve([]),
    ]).then(([indexedDbNames, cacheNames]) => {
      if (!active) return
      setSnapshot({
        createdAt: new Date().toISOString(),
        origin: window.location.origin,
        localStorage: storageObject(window.localStorage),
        sessionStorage: storageObject(window.sessionStorage),
        indexedDbNames,
        cacheNames,
      })
    })
    return () => { active = false }
  }, [])

  const inventory = useMemo(() => snapshot ? inventoryOf(snapshot.localStorage) : [], [snapshot])
  const recoveryCandidates = inventory.filter((item) => item.signals.length > 0)

  const canDownloadFullBackup = profile.role === 'ceo' || profile.role === 'admin'

  const downloadBackup = () => {
    if (!snapshot) return
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `wise-company-os-browser-backup-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return <main className="recovery-page">
    <header className="recovery-header">
      <div><p className="eyebrow">ADMIN RECOVERY</p><h1>운영 데이터 복구 점검</h1><p>현재 공식 도메인의 브라우저 저장 자료를 읽기 전용으로 점검합니다. 이 화면은 데이터를 삭제하거나 변경하지 않습니다.</p></div>
      {canDownloadFullBackup && <button className="primary-button" disabled={!snapshot} onClick={downloadBackup} type="button">전체 원본 백업 받기</button>}
    </header>
    {!snapshot ? <section className="recovery-card"><p>저장 자료를 확인하고 있습니다…</p></section> : <>
      <section className="recovery-summary">
        <article><span>저장 항목</span><strong>{inventory.length}개</strong></article>
        <article><span>복구 후보</span><strong>{recoveryCandidates.length}개</strong></article>
        <article><span>IndexedDB</span><strong>{snapshot.indexedDbNames.length}개</strong></article>
        <article><span>캐시 저장소</span><strong>{snapshot.cacheNames.length}개</strong></article>
      </section>
      <section className="recovery-card">
        <h2>셀러·거래처·첨부파일 복구 후보</h2>
        {recoveryCandidates.length === 0 ? <p className="recovery-warning">현재 도메인의 브라우저 저장소에서 관련 후보를 찾지 못했습니다. 이전 도메인 또는 다른 PC에서 등록했는지 추가 확인이 필요합니다.</p> : <table className="recovery-table"><thead><tr><th>저장 키</th><th>분류</th><th>건수</th><th>용량</th><th>확인된 이름 예시</th></tr></thead><tbody>{recoveryCandidates.map((item) => <tr key={item.key}><td>{item.key}</td><td>{item.signals.join(', ')}</td><td>{item.count ?? '-'}</td><td>{item.bytes.toLocaleString('ko-KR')} B</td><td>{item.sampleNames.join(', ') || '-'}</td></tr>)}</tbody></table>}
      </section>
      <section className="recovery-card"><details><summary>전체 저장 항목 보기</summary><table className="recovery-table"><thead><tr><th>저장 키</th><th>형식</th><th>건수</th><th>용량</th></tr></thead><tbody>{inventory.map((item) => <tr key={item.key}><td>{item.key}</td><td>{item.kind}</td><td>{item.count ?? '-'}</td><td>{item.bytes.toLocaleString('ko-KR')} B</td></tr>)}</tbody></table></details><p className="muted-text">점검 시각 {new Date(snapshot.createdAt).toLocaleString('ko-KR')} · {snapshot.origin}</p>{!canDownloadFullBackup && <p className="muted-text">직원 계정은 저장 항목과 건수만 확인할 수 있으며 전체 원본 백업은 대표 관리자만 받을 수 있습니다.</p>}</section>
    </>}
  </main>
}
