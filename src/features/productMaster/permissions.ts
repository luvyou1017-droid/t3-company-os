export type ProductMasterRole = 'admin' | 'md' | 'settlement' | 'manager'

export function getProductMasterPermission(role: ProductMasterRole) {
  return {
    canView: true,
    canCreate: role === 'admin' || role === 'md',
    canEdit: role === 'admin' || role === 'md',
    canDeactivate: role === 'admin' || role === 'md',
  }
}
