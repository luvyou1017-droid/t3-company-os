import type { AppUser } from '../data/users'

export function canViewManagerSettlement(user: AppUser | { id: string; role: '셀러' }, managerId?: string) {
  if (user.role === '셀러') return false
  if (user.role === '매니저') return user.id === managerId
  return user.role === '대표' || user.role === '정산 담당자' || user.role === '팀장'
}
