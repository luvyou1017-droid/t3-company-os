export type PortalRole = 'internal' | 'seller'

const ROLE_KEY = 't3_company_os_portal_role'

export function getCurrentPortalRole(): PortalRole {
  return sessionStorage.getItem(ROLE_KEY) === 'seller' ? 'seller' : 'internal'
}

export function enterSellerPortal() {
  sessionStorage.setItem(ROLE_KEY, 'seller')
}

export function leaveSellerPortal() {
  sessionStorage.removeItem(ROLE_KEY)
}

export function canAccessInternalProductMaster() {
  return getCurrentPortalRole() === 'internal'
}
