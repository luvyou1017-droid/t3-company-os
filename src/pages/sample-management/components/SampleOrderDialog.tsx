import { useEffect, useRef, type ReactNode } from 'react'

export function SampleOrderDialog({ title, children, onClose, busy = false }: { title: string; children: ReactNode; onClose: () => void; busy?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => { dialog?.close() } }, [])
  return <dialog ref={ref} className="sample-order-dialog" aria-label={title} onCancel={(event) => { event.preventDefault(); if (!busy) onClose() }}>
    <header><h2>{title}</h2><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>닫기</button></header>{children}
  </dialog>
}
