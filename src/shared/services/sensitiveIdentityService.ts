import { taxIdentityService, type TaxIdentityTarget, type TaxIdentityStatus } from './taxIdentityService'
import { supabase } from '../lib/supabase'
type IdentityOwnerType = 'seller' | 'manager'

type SensitiveIdentityRecord = {
  ownerType: IdentityOwnerType
  ownerId: string
  residentRegistrationNumber: string
}

// Legacy mock input stays memory-only. Production writes use the encrypted server RPC.
// Never persist identifiers to browser storage, logs, or workspace payloads.
const maskedRecords = new Map<string, TaxIdentityStatus>()
const sessionRecords = new Map<string, SensitiveIdentityRecord>()
supabase?.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){maskedRecords.clear();sessionRecords.clear()}})

const recordKey = (ownerType: IdentityOwnerType, ownerId: string) => `${ownerType}:${ownerId}`
const normalize = (value: string) => value.replace(/[^0-9]/g, '').slice(0, 13)

export function maskResidentRegistrationNumber(value?: string) {
  const normalized = normalize(value ?? '')
  if (normalized.length < 7) return normalized ? '입력 완료 · 보호됨' : '미등록'
  return `${normalized.slice(0, 6)}-${normalized.slice(6, 7)}******`
}

export const sensitiveIdentityService = {
  async refresh(targets:TaxIdentityTarget[]) {
    const records=await taxIdentityService.status(targets)
    records.forEach(record=>{const key=recordKey(record.ownerType,record.ownerId);if(record.masked)maskedRecords.set(key,record);else maskedRecords.delete(key)})
  },
  async save(ownerType:IdentityOwnerType,ownerId:string,number:string,realName:string) {
    const target={ownerType,ownerId}
    const [current]=await taxIdentityService.status([target])
    const saved=await taxIdentityService.save(target,realName,number,current?.updatedAt ?? null)
    maskedRecords.set(recordKey(ownerType,ownerId),saved)
    return saved
  },
  stage(ownerType: IdentityOwnerType, ownerId: string, residentRegistrationNumber: string) {
    if (supabase) throw new Error('운영 주민번호는 보안 서버 저장을 이용해주세요.')
    const normalized = normalize(residentRegistrationNumber)
    if (normalized.length !== 13) throw new Error('주민등록번호 13자리를 입력해주세요.')
    sessionRecords.set(recordKey(ownerType, ownerId), { ownerType, ownerId, residentRegistrationNumber: normalized })
  },
  has(ownerType: IdentityOwnerType, ownerId: string) {
    return maskedRecords.has(recordKey(ownerType,ownerId)) || sessionRecords.has(recordKey(ownerType, ownerId))
  },
  getMasked(ownerType: IdentityOwnerType, ownerId: string) {
    const cached = maskedRecords.get(recordKey(ownerType,ownerId)); if(cached?.masked)return cached.masked
    const record = sessionRecords.get(recordKey(ownerType, ownerId))
    return record ? maskResidentRegistrationNumber(record.residentRegistrationNumber) : undefined
  },
}
