import { supabase } from '../lib/supabase'
import { toDatabaseUuid } from '../utils/databaseId'
import { aggregatedSellerWorkbook, sanitizeSellerWorkbook } from '../utils/sellerOrderExcel'
import type { SalesDataImport, SalesDataRow } from '../types/salesData'

export const SELLER_DOCUMENTS_BUCKET = 'seller-documents'
export const SELLER_EXCEL_LINK_TTL_SECONDS = 14 * 24 * 60 * 60
const MAX_SELLER_EXCEL_SIZE = 25 * 1024 * 1024

function safeFileName(name: string) {
  return name.normalize('NFKC').replace(/[^a-zA-Z0-9._-]/g, '_') || `sales-data-${Date.now()}.xlsx`
}

function storageError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (/bucket.*not found|does not exist/i.test(message)) return new Error('셀러 구매내역 저장공간 설정이 필요합니다.')
  if (/mime|content.?type/i.test(message)) return new Error('저장소에서 Excel/CSV 파일 형식을 허용하지 않습니다. 원본 보관 설정 확인이 필요합니다.')
  if (/permission|policy|row-level security|unauthorized/i.test(message)) return new Error('원본 엑셀을 공유할 권한이 없습니다. 대표 또는 정산 담당자 계정으로 확인해주세요.')
  return new Error(`원본 엑셀 저장에 실패했습니다. (${message})`)
}

export const sellerSettlementFileService = {
  validate(file: File) {
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) return { valid: false as const, error: '엑셀 또는 CSV 파일만 등록할 수 있습니다.' }
    if (file.size > MAX_SELLER_EXCEL_SIZE) return { valid: false as const, error: '파일 크기는 25MB 이하여야 합니다.' }
    return { valid: true as const }
  },

  async uploadOriginal(file: File, context: { campaignId: string; salesDataImportId: string; previousPath?: string }) {
    const validation = this.validate(file)
    if (!validation.valid) throw new Error(validation.error)
    if (!supabase) throw new Error('데이터베이스 연결을 확인해주세요.')
    const path = `settlement-exports/campaigns/${toDatabaseUuid(context.campaignId)}/sales-imports/${toDatabaseUuid(context.salesDataImportId)}/${crypto.randomUUID()}-${safeFileName(file.name)}`
    const contentType = /\.csv$/i.test(file.name) ? 'text/csv' : /\.xls$/i.test(file.name) ? 'application/vnd.ms-excel' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    const { error } = await supabase.storage.from(SELLER_DOCUMENTS_BUCKET).upload(path, file, { contentType, upsert: false })
    if (error) throw storageError(error)
    // Originals may be referenced by historical records. Never remove on replacement.
    return path
  },

  // Original retention is attempted independently of export/signing. A failed
  // archive must not discard successfully parsed sales or reuse an older file.
  async storeOriginalForImport(file: File, context: { campaignId: string; salesDataImportId: string; previousPath?: string }) {
    try {
      const path = await this.uploadOriginal(file, context)
      return { originalSalesFileStoragePath: path, originalSalesFileStoredAt: new Date().toISOString(), originalSalesFileStorageError: undefined }
    } catch (error) {
      return { originalSalesFileStoragePath: undefined, originalSalesFileStoredAt: undefined,
        originalSalesFileStorageError: error instanceof Error ? error.message : '원본 주문파일을 보관하지 못했습니다.' }
    }
  },

  async createShareLink(path: string) {
    if (!supabase) throw new Error('데이터베이스 연결을 확인해주세요.')
    const { data, error } = await supabase.storage.from(SELLER_DOCUMENTS_BUCKET).createSignedUrl(path, SELLER_EXCEL_LINK_TTL_SECONDS, { download: true })
    if (error) throw storageError(error)
    const encoded = new URL(data.signedUrl).searchParams.get('token')?.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/')
    if (!encoded) throw new Error('링크의 서버 만료시각을 확인하지 못했습니다.')
    const expires = Number(JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '='))).exp)
    if (!Number.isFinite(expires)) throw new Error('링크의 서버 만료시각이 올바르지 않습니다.')
    return {
      url: data.signedUrl,
      expiresAt: new Date(expires * 1000).toISOString(),
    }
  },

  async revokeGenerated(path: string) {
    if (!supabase) throw new Error('데이터베이스 연결을 확인해주세요.')
    if (!path.startsWith('settlement-exports/seller-safe/')) throw new Error('셀러용 생성 파일만 만료 처리할 수 있습니다.')
    const { error } = await supabase.storage.from(SELLER_DOCUMENTS_BUCKET).remove([path])
    if (error) throw storageError(error)
  },

  async generateSellerExcel(salesImport: SalesDataImport, rows: SalesDataRow[], settlementId: string, version: number) {
    if (!supabase) throw new Error('데이터베이스 연결을 확인해주세요.')
    if (salesImport.originalSalesFileStorageError && !salesImport.originalSalesFileStoragePath) throw new Error('판매데이터는 반영되었지만 원본 주문파일 보관이 미완료입니다. 원본 보관 후 구매내역 링크를 다시 생성해주세요.')
    const bucket = supabase.storage.from(SELLER_DOCUMENTS_BUCKET)
    let bytes: Uint8Array
    if (salesImport.originalSalesFileStoragePath) {
      const { data, error } = await bucket.download(salesImport.originalSalesFileStoragePath)
      if (error || !data) throw storageError(error ?? new Error('원본 파일을 찾을 수 없습니다.'))
      bytes = sanitizeSellerWorkbook(await data.arrayBuffer())
    } else bytes = aggregatedSellerWorkbook(rows)
    const path = `settlement-exports/seller-safe/${toDatabaseUuid(settlementId)}/v${version}/${crypto.randomUUID()}.xlsx`
    const { error } = await bucket.upload(path, bytes, { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', upsert: false, cacheControl: '0' })
    if (error) throw storageError(error)
    const share = await this.createShareLink(path)
    // New artifact is ready before revocation; never offer it if revocation fails.
    if (salesImport.sellerExcelExport?.path) await this.revokeGenerated(salesImport.sellerExcelExport.path)
    return { ...share, path, settlementId, version, sourcePath: salesImport.originalSalesFileStoragePath, createdAt: new Date().toISOString() }
  },
}
