export function parseKakaoSettlement(text: string) {
  const quantities: { label: string; quantity: number }[] = []
  for (const line of text.split(/\r?\n/)) {
    const match = line.trim().match(/^(옵션\s*\d+|케이스)\s*[>:：]\s*([\d,]+)\s*(?:개)?\s*$/)
    if (match) quantities.push({ label: match[1].replace(/\s/g, ''), quantity: Number(match[2].replace(/,/g, '')) })
  }
  if (!quantities.length) throw new Error('옵션1>700, 옵션2>456, 케이스>51 형태의 수량을 확인해주세요.')
  if (new Set(quantities.map((item) => item.label)).size !== quantities.length) throw new Error('같은 옵션이 두 번 있습니다. 수량을 확인해주세요.')
  const number = (value: string) => Number(value.replace(/,/g, ''))
  const offsetMatch = text.match(/상계처리금액\s*[>:：]?\s*([\d,]+)/)
  const offset = offsetMatch ? number(offsetMatch[1]) : 0
  const totalMatch = text.match(/총\s*([\d,]+)\s*원/)
  if (!totalMatch) throw new Error('총 전달 금액을 찾지 못했습니다. “총 4,967,582원”처럼 입력해주세요.')
  const finalAmount = number(totalMatch[1])
  const equation = text.match(/([\d,]+)\s*[-−]\s*([\d,]+)\s*=\s*([\d,]+)/)
  if (equation && (number(equation[1]) - number(equation[2]) !== number(equation[3]) || number(equation[2]) !== offset || number(equation[3]) !== finalAmount)) throw new Error('상계 계산식과 총액이 일치하지 않습니다.')
  return { quantities, offset, finalAmount, commissionBeforeOffset: finalAmount + offset }
}

export function matchesKakaoOption(label: string, option: string) {
  const compact = option.replace(/\s/g, '')
  if (label === '케이스') return /케이스/.test(compact)
  const number = label.replace('옵션', '')
  return new RegExp('옵션' + number + '(?![0-9])').test(compact)
}
