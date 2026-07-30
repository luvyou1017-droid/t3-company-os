import type { ProposalMaster } from '../types'

export interface ProposalRepository {
  list(): Promise<ProposalMaster[]>
  getById(id: string): Promise<ProposalMaster | null>
  save(proposal: ProposalMaster): Promise<ProposalMaster>
}
