type IdentityOwnerType = 'seller' | 'manager'

type SensitiveIdentityRecord = {
  ownerType: IdentityOwnerType
  ownerId: string
  residentRegistrationNumber: string
}

// TODO(secure-backend): Replace this memory-only adapter with an encrypted,
// permission-gated server repository with audit logging. Never persist this map
// to localStorage, sessionStorage, logs, analytics, or client-side debug output.
const sessionRecords = new Map<string, SensitiveIdentityRecord>()

const recordKey = (ownerType: IdentityOwnerType, ownerId: string) => `${ownerType}:${ownerId}`
const normalize = (value: string) => value.replace(/[^0-9]/g, '').slice(0, 13)

export function maskResidentRegistrationNumber(value?: string) {
  const normalized = normalize(value ?? '')
  if (normalized.length < 7) return normalized ? '입력 완료 · 보호됨' : '미등록'
  return `${normalized.slice(0, 6)}-${normalized.slice(6, 7)}******`
}

export const sensitiveIdentityService = {
  stage(ownerType: IdentityOwnerType, ownerId: string, residentRegistrationNumber: string) {
    const normalized = normalize(residentRegistrationNumber)
    if (normalized.length !== 13) throw new Error('주민등록번호 13자리를 입력해주세요.')
    sessionRecords.set(recordKey(ownerType, ownerId), { ownerType, ownerId, residentRegistrationNumber: normalized })
  },
  has(ownerType: IdentityOwnerType, ownerId: string) {
    return sessionRecords.has(recordKey(ownerType, ownerId))
  },
  getMasked(ownerType: IdentityOwnerType, ownerId: string) {
    const record = sessionRecords.get(recordKey(ownerType, ownerId))
    return record ? maskResidentRegistrationNumber(record.residentRegistrationNumber) : undefined
  },
}
