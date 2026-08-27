import { useRef, type ClipboardEvent } from 'react'

type ResidentRegistrationNumberInputProps = {
  id?: string
  value: string
  onChange: (value: string) => void
}

const digitsOnly = (value: string, length: number) => value.replace(/\D/g, '').slice(0, length)

export function ResidentRegistrationNumberInput({ id, value, onChange }: ResidentRegistrationNumberInputProps) {
  const rearInputRef = useRef<HTMLInputElement>(null)
  const normalized = digitsOnly(value, 13)
  const front = normalized.slice(0, 6)
  const rear = normalized.slice(6, 13)

  const applyPastedValue = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = digitsOnly(event.clipboardData.getData('text'), 13)
    if (pasted.length !== 13) return
    event.preventDefault()
    onChange(pasted)
    requestAnimationFrame(() => rearInputRef.current?.focus())
  }

  const updateFront = (nextValue: string) => {
    const nextFront = digitsOnly(nextValue, 6)
    onChange(`${nextFront}${rear}`)
    if (nextFront.length === 6) requestAnimationFrame(() => rearInputRef.current?.focus())
  }

  return <div className="resident-registration-number-input">
    <input
      aria-label="주민등록번호 앞 6자리"
      autoComplete="off"
      id={id}
      inputMode="numeric"
      maxLength={6}
      onChange={(event) => updateFront(event.target.value)}
      onPaste={applyPastedValue}
      pattern="[0-9]{6}"
      placeholder="앞 6자리"
      value={front}
    />
    <span aria-hidden="true">-</span>
    <input
      aria-label="주민등록번호 뒤 7자리"
      autoComplete="off"
      inputMode="numeric"
      maxLength={7}
      onChange={(event) => onChange(`${front}${digitsOnly(event.target.value, 7)}`)}
      onPaste={applyPastedValue}
      pattern="[0-9]{7}"
      placeholder="뒤 7자리"
      ref={rearInputRef}
      type="password"
      value={rear}
    />
  </div>
}
