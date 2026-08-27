import type { ChangeEventHandler } from 'react'

export function ReasonInput({ value, onChange, placeholder, ariaLabel, autoFocus = true }: {
  value: string
  onChange: ChangeEventHandler<HTMLTextAreaElement>
  placeholder: string
  ariaLabel?: string
  autoFocus?: boolean
}) {
  return <textarea aria-label={ariaLabel ?? placeholder} autoFocus={autoFocus} className="reason-input" onChange={onChange} placeholder={placeholder} value={value} />
}

export function ReasonModal({ open, title, description, value, placeholder, actionLabel, tone = 'danger', onChange, onClose, onSubmit }: {
  open: boolean
  title: string
  description?: string
  value: string
  placeholder: string
  actionLabel: string
  tone?: 'danger' | 'primary'
  onChange: (value: string) => void
  onClose: () => void
  onSubmit: () => void
}) {
  if (!open) return null
  return <div className="nested-modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}>
    <section aria-modal="true" className="helper-modal reason-modal" role="dialog">
      <div className="reason-modal__header"><h3>{title}</h3><button aria-label="닫기" className="icon-button" onClick={onClose} type="button">×</button></div>
      {description && <p>{description}</p>}
      <ReasonInput onChange={(event) => onChange(event.target.value)} placeholder={placeholder} value={value} />
      <div className="modal-actions reason-modal__actions"><button className="secondary-button" onClick={onClose} type="button">닫기</button><button className={tone === 'danger' ? 'danger-button' : 'primary-button'} disabled={!value.trim()} onClick={onSubmit} type="button">{actionLabel}</button></div>
    </section>
  </div>
}
