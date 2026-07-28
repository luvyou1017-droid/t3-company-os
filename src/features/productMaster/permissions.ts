export type ProductMasterRole = 'admin' | 'md' | 'settlement' | 'manager'

export type ProductMasterPermission = ReturnType<typeof getProductMasterPermission>

export function getProductMasterPermission(role: ProductMasterRole) {
  return {
    canView: true,
    canCreate: role === 'admin' || role === 'md',
    canEdit: role === 'admin' || role === 'md',
    canDeactivate: role === 'admin',
  }
}

// 현재 앱의 공통 헤더 사용자는 대표(관리자)로 고정되어 있다.
// 인증 Role Provider가 도입되면 이 함수의 반환값만 현재 세션 역할로 교체한다.
export function getCurrentProductMasterPermission() {
  return getProductMasterPermission('admin')
}
