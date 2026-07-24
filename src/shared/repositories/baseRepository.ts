import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export interface DataRepository<T> {
  list(): Promise<T[]>
  upsert(item: T): Promise<T>
  upsertMany(items: T[]): Promise<{ succeeded: number; failed: number; errors: string[] }>
  exists(id: string): Promise<boolean>
}

export abstract class SupabaseRepository<T> implements DataRepository<T> {
  protected client: SupabaseClient
  protected table: string
  constructor(table: string) {
    this.table = table
    if (!supabase) throw new Error('Supabase가 설정되지 않았습니다.')
    this.client = supabase
  }
  protected abstract toRow(item: T): Record<string, unknown>
  protected databaseId(id: string) { return id }
  protected fromRow(row: Record<string, unknown>): T {
    return row.metadata as T
  }
  async list() {
    const { data, error } = await this.client.from(this.table).select('*')
    if (error) throw error
    return (data ?? []).map((row) => this.fromRow(row))
  }
  async upsert(item: T) {
    const { data, error } = await this.client.from(this.table).upsert(this.toRow(item)).select().single()
    if (error) throw error
    return this.fromRow(data)
  }
  async upsertMany(items: T[]) {
    if (!items.length) return { succeeded: 0, failed: 0, errors: [] }
    const { error } = await this.client.from(this.table).upsert(items.map((item) => this.toRow(item)))
    return error
      ? { succeeded: 0, failed: items.length, errors: [error.message] }
      : { succeeded: items.length, failed: 0, errors: [] }
  }
  async exists(id: string) {
    const { count, error } = await this.client.from(this.table).select('id', { count: 'exact', head: true }).eq('id', this.databaseId(id))
    if (error) throw error
    return Boolean(count)
  }
}

export class LocalRepository<T extends { id: string }> implements DataRepository<T> {
  private read: () => T[]
  private write: (items: T[]) => void
  constructor(read: () => T[], write: (items: T[]) => void) {
    this.read = read
    this.write = write
  }
  async list() { return this.read() }
  async upsert(item: T) {
    this.write([item, ...this.read().filter((candidate) => candidate.id !== item.id)])
    return item
  }
  async upsertMany(items: T[]) {
    const ids = new Set(items.map((item) => item.id))
    this.write([...items, ...this.read().filter((item) => !ids.has(item.id))])
    return { succeeded: items.length, failed: 0, errors: [] }
  }
  async exists(id: string) { return this.read().some((item) => item.id === id) }
}
