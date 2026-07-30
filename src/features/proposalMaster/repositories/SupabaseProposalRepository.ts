import type { SupabaseClient } from '@supabase/supabase-js'
import type { ProposalMaster } from '../types'
import type { ProposalRepository } from './proposalRepository'

export class SupabaseProposalRepository implements ProposalRepository {
  private client: SupabaseClient
  constructor(client: SupabaseClient) { this.client = client }
  private fromRow(row: Record<string, unknown>) { return (row.metadata ?? row) as ProposalMaster }
  private toRow(proposal: ProposalMaster) {
    return { id: proposal.id, status: proposal.status, proposal_name: proposal.proposalName, active: proposal.status !== 'archived', metadata: proposal, created_at: proposal.createdAt, updated_at: proposal.updatedAt }
  }
  async list() {
    const { data, error } = await this.client.from('proposals').select('*').order('updated_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map((row) => this.fromRow(row))
  }
  async getById(id: string) {
    const { data, error } = await this.client.from('proposals').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return data ? this.fromRow(data) : null
  }
  async save(proposal: ProposalMaster) {
    const { data, error } = await this.client.from('proposals').upsert(this.toRow(proposal)).select().single()
    if (error) throw error
    return this.fromRow(data)
  }
}
