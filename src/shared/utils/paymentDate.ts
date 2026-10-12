export function koreanPaymentDate(value: string | Date = new Date()) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T12:00:00Z`)
    return Number.isNaN(date.getTime()) || date.toISOString().slice(0,10) !== value ? '' : value
  }
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date)
  const part = (type: string) => parts.find(p=>p.type===type)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}
export function validatePaymentDate(value: string) {
  const date = koreanPaymentDate(value)
  if (!date || date > koreanPaymentDate()) throw new Error('실제 지급일을 오늘 이전의 유효한 날짜로 입력해주세요.')
  return date
}
