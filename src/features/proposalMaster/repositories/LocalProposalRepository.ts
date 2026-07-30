import { mockProposals } from '../mockData'
import type { ProposalMaster } from '../types'
import type { ProposalRepository } from './proposalRepository'

const STORAGE_KEY = 't3_company_os_proposal_masters'

export class LocalProposalRepository implements ProposalRepository {
  private read(): ProposalMaster[] {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(mockProposals))
      return structuredClone(mockProposals)
    }
    try {
      const proposals = JSON.parse(stored) as ProposalMaster[]
      const byId = new Map(mockProposals.map((proposal) => [proposal.id, proposal]))
      proposals.forEach((proposal) => byId.set(proposal.id, proposal))
      return Array.from(byId.values())
    } catch { return structuredClone(mockProposals) }
  }
  private write(proposals: ProposalMaster[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(proposals)) }
  async list() { return this.read().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) }
  async getById(id: string) { return this.read().find((proposal) => proposal.id === id) ?? null }
  async save(proposal: ProposalMaster) {
    const proposals = this.read()
    const exists = proposals.some((candidate) => candidate.id === proposal.id)
    this.write(exists ? proposals.map((candidate) => candidate.id === proposal.id ? proposal : candidate) : [proposal, ...proposals])
    return proposal
  }
}
