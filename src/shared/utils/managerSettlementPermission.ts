import type { AppUser } from '../data/users'

function normalizedName(value?: string) {
  return value?.normalize('NFKC').replace(/\s+/g, '').toLowerCase() ?? ''
}

export function isAssignedManager(user: Pick<AppUser, 'id' | 'name' | 'role'>, managerId?: string, managerName?: string) {
  if (user.role !== '매니저') return false
  if (managerId && user.id === managerId) return true
  return Boolean(managerName && normalizedName(user.name) === normalizedName(managerName))
}

export function canViewManagerSettlement(user: AppUser | { id: string; name?: string; role: '셀러' }, managerId?: string, managerName?: string) {
  if (user.role === '셀러') return false
  if (user.role === '매니저') return isAssignedManager(user, managerId, managerName)
  return user.role === '대표' || user.role === '정산 담당자' || user.role === '팀장'
}
