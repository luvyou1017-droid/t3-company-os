import { useEffect, useRef, useState, type SetStateAction } from 'react'

// Unconfirmed upload work belongs to this browser tab, not the final company ledger.
const memory = new Map<string, unknown>()
function scopedKey(key: string) {
  let scope: string | null
  try { scope = sessionStorage.getItem('sales-upload-workspace') } catch { return key }
  if (!scope) { scope = crypto.randomUUID(); try { sessionStorage.setItem('sales-upload-workspace', scope) } catch { return key } }
  return `${scope}:${key}`
}
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('sales-upload-drafts', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('drafts')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
export function useUploadDraft<T>(key: string, initial: T) {
  const [id] = useState(() => scopedKey(key))
  const [value, setValue] = useState<T>(() => memory.has(id) ? memory.get(id) as T : initial)
  const [ready, setReady] = useState(memory.has(id))
  const current = useRef(value)
  const changed = useRef(false)
  useEffect(() => {
    let active = true
    if (!memory.has(id)) void database().then((db) => {
      const request = db.transaction('drafts').objectStore('drafts').get(id)
      request.onsuccess = () => {
        if (active && !changed.current && request.result && Date.now() - request.result.at < 86400000) {
          current.current = request.result.value; memory.set(id, current.current); setValue(current.current)
        }
        if (active) setReady(true)
        db.close()
      }
      request.onerror = () => { if (active) setReady(true); db.close() }
    }).catch(() => { if (active) setReady(true) })
    return () => { active = false }
  }, [id])
  const update = (next: SetStateAction<T>) => {
    changed.current = true
    const resolved = typeof next === 'function' ? (next as (old: T) => T)(current.current) : next
    current.current = resolved; memory.set(id, resolved); setValue(resolved)
    void database().then((db) => {
      const tx = db.transaction('drafts', 'readwrite')
      tx.objectStore('drafts').put({ value: resolved, at: Date.now() }, id)
      tx.oncomplete = () => db.close(); tx.onerror = () => db.close()
    }).catch(() => { /* Browsers that block IndexedDB retain the live-tab draft. */ })
  }
  return [value, update, ready] as const
}
