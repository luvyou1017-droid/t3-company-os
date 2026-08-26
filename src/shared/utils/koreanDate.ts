const KOREA_TIME_ZONE = 'Asia/Seoul'

function dateParts(value: string | Date, includeTime: boolean) {
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return undefined
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: KOREA_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
  }).formatToParts(date).reduce<Record<string, string>>((result, part) => {
    if (part.type !== 'literal') result[part.type] = part.value
    return result
  }, {})
}

export function formatKoreanDate(value?: string | Date, separator: '.' | '-' = '.') {
  if (!value) return '-'
  const parts = dateParts(value, false)
  if (!parts) return '-'
  return `${parts.year}${separator}${parts.month}${separator}${parts.day} (${parts.weekday})`
}

export function formatKoreanDateTime(value?: string | Date) {
  if (!value) return '-'
  const parts = dateParts(value, true)
  if (!parts) return '-'
  return `${parts.year}.${parts.month}.${parts.day} (${parts.weekday}) ${parts.hour}:${parts.minute}`
}

export const KOREA_TIME_ZONE_ID = KOREA_TIME_ZONE
