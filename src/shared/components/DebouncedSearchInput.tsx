import { useEffect, useState } from 'react'

export function DebouncedSearchInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  const [input, setInput] = useState(value)
  useEffect(() => { setInput(value) }, [value])
  useEffect(() => {
    if (input === value) return
    const timer = window.setTimeout(() => onChange(input), 250)
    return () => window.clearTimeout(timer)
  }, [input, value, onChange])
  return <input type="search" value={input} placeholder={placeholder} onChange={event => setInput(event.target.value)} />
}
