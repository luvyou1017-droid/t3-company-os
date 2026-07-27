export interface ScenarioAssertionResult {
  name: string
  passed: boolean
  expected: string
  actual: string
  message?: string
  stepId?: string
}

function result(name: string, passed: boolean, expected: string, actual: string, message?: string): ScenarioAssertionResult {
  return { name, passed, expected, actual, message }
}

export function assertPermission(name: string, allowed: boolean, expected: boolean, detail: string) {
  return result(name, allowed === expected, expected ? '허용' : '차단', allowed ? '허용' : '차단', detail)
}

export function assertTimelineStep(actual: string, expected: string) {
  return result('Payment Timeline 상태', actual === expected, expected, actual)
}

export function assertEvidenceStatus(actual: string, expected: string) {
  return result('증빙 검수 상태', actual === expected, expected, actual)
}

export function assertPaymentStatus(actual: string, expected: string) {
  return result('지급요청 상태', actual === expected, expected, actual)
}

export function assertWithholdingItemCreated(count: number) {
  return result('원천세 리스트 생성', count === 1, '1건', `${count}건`)
}

export function assertActivityLogCreated(actualActions: string[], expectedActions: string[]) {
  const missing = expectedActions.filter((action) => !actualActions.includes(action))
  return result('Activity Log 생성', missing.length === 0, expectedActions.join(' → '), actualActions.join(' → '), missing.length ? `누락: ${missing.join(', ')}` : undefined)
}

export function assertNoDuplicatePaymentRequest(count: number) {
  return result('지급요청 중복 생성 방지', count === 1, '1건', `${count}건`)
}

export function assertNoDuplicateWithholdingItem(count: number) {
  return result('원천세 중복 생성 방지', count === 1, '1건', `${count}건`)
}

export function assertOwnerIsolation(name: string, isolated: boolean, actual: string) {
  return result(name, isolated, '셀러·매니저 상태 독립', actual)
}

export function assertValue(name: string, actual: string | number | boolean, expected: string | number | boolean, message?: string) {
  return result(name, actual === expected, String(expected), String(actual), message)
}
