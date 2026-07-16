export type AppUserRole = '대표' | '팀장' | '매니저' | 'MD' | '정산 담당자'

export type AppUser = {
  id: string
  name: string
  role: AppUserRole
}

export const appUsers: AppUser[] = [
  { id: 'u-001', name: '허윤정', role: '대표' },
  { id: 'u-002', name: '허수정', role: '정산 담당자' },
  { id: 'u-003', name: '배민성', role: '팀장' },
  { id: 'u-004', name: '유시철', role: 'MD' },
  { id: 'u-005', name: '김병희', role: '매니저' },
  { id: 'u-006', name: '서주희', role: '매니저' },
  { id: 'u-007', name: '고정원', role: '매니저' },
  { id: 'u-008', name: '이규빈', role: '매니저' },
]

export const DEFAULT_MD_USER_ID = 'u-004'
export const DEFAULT_OPERATOR_USER_ID = 'u-002'
export const DEFAULT_APPROVER_USER_ID = 'u-001'

export function getUserById(userId: string) {
  return appUsers.find((user) => user.id === userId)
}

export function getUserByName(name: string) {
  return appUsers.find((user) => user.name === name)
}
