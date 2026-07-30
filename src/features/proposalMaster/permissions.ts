import type { ProposalMasterRole } from './types'

export function getProposalPermission(role: ProposalMasterRole) {
  return {
    canView: role !== 'seller',
    canCreate: role === 'admin' || role === 'md',
    canEdit: role === 'admin' || role === 'md',
    canReview: role === 'admin' || role === 'team_lead',
    canPreview: role !== 'seller',
    canArchive: role === 'admin',
    canViewInternalTerms: role === 'admin' || role === 'md' || role === 'settlement',
  }
}

export function getCurrentProposalPermission() {
  return getProposalPermission('admin')
}
