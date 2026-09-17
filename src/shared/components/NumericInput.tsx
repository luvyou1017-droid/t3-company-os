import { useEffect, useState, type InputHTMLAttributes, type ChangeEvent } from 'react'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value'> & { value?: string | number }
const format = (value: string) => {
  const [integer, fraction] = value.split('.')
  const normalized = integer.replace(/^0+(?=\d)/, '')
  return normalized.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fraction === undefined ? '' : `.${fraction}`)
}
export function NumericInput({ value, onChange, type: _type, ...props }: Props) {
  const [text, setText] = useState(() => format(String(value ?? '')))
  useEffect(() => { setText((current) => Number(current.replaceAll(',', '')) === Number(value) && current === '' ? current : format(String(value ?? ''))) }, [value])
  return <input {...props} type="text" inputMode={props.inputMode ?? 'decimal'} value={text} onFocus={(event) => { if (text === '0') event.currentTarget.select(); props.onFocus?.(event) }} onChange={(event) => {
    const raw = event.target.value.replaceAll(',', '')
    if (!/^\d*(\.\d*)?$/.test(raw)) return
    const clean = raw.replace(/^0+(?=\d)/, '')
    setText(format(clean))
    onChange?.({ ...event, target: { ...event.target, value: clean }, currentTarget: { ...event.currentTarget, value: clean } } as ChangeEvent<HTMLInputElement>)
  }} />
}
