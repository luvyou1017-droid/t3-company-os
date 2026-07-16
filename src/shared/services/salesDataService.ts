import { initialSalesDataImports, initialSalesDataRows } from '../data/salesData'
import type { SalesDataImport, SalesDataRow } from '../types/salesData'
import { calculateSalesTotals, validateSalesRows } from '../utils/salesData'
import { campaignService } from './campaignService'
import { STORAGE_KEYS, storageService } from './storageService'
import { workService } from './workService'

const now = () => '2026-07-16 14:30'

function getCampaignText(campaignId: string) {
  const campaign = campaignService.getCampaignById(campaignId)
  return {
    campaignName: campaign?.campaignName ?? campaignId,
    sellerName: campaign?.sellerName ?? '-',
    brandName: campaign?.brandName ?? '-',
  }
}

function createSalesDataWorkItem(salesImport: SalesDataImport, type: 'upload' | 'review' | 'error' | 'settlement') {
  const campaign = getCampaignText(salesImport.campaignId)
  const title =
    type === 'upload'
      ? `[판매 데이터 업로드 대기] ${campaign.campaignName}`
      : type === 'error'
        ? `[판매 데이터 오류 확인] ${campaign.campaignName}`
        : type === 'settlement'
          ? `[정산 준비] ${campaign.campaignName}`
          : `[판매 데이터 검수] ${campaign.campaignName}`

  return workService.createWorkItem({
    id: `sales-data-work-${salesImport.id}-${type}`,
    title,
    description: salesImport.notes || '브랜드사 판매 데이터를 확인하고 정산 가능 상태로 준비합니다.',
    workType: type === 'settlement' ? '정산서 작성' : type === 'upload' ? '판매 데이터 요청' : '판매 데이터 검수',
    status: 'todo',
    campaignId: salesImport.campaignId,
    sourceType: 'sales_data',
    sourceId: salesImport.id,
    campaignName: campaign.campaignName,
    sellerName: campaign.sellerName,
    brandName: campaign.brandName,
    assigneeId: salesImport.reviewerId ?? 'u-002',
    assigneeName: salesImport.reviewerName ?? '허수정',
    assigneeRole: '정산 담당자',
    dueDate: '2026-07-17',
    dueTime: type === 'upload' ? '10:00' : '18:00',
    dueAt: `2026-07-17 ${type === 'upload' ? '10:00' : '18:00'}`,
    createdReason: type === 'upload' ? '브랜드사 판매 데이터 수신 대기' : type === 'error' ? '판매 데이터 검증 오류 발생' : type === 'settlement' ? '정산 생성 준비 필요' : '업로드 후 1영업일 내 검수',
    relatedMenu: '판매 데이터',
    checklistName: `salesDataImportId ${salesImport.id}`,
    relatedLink: salesImport.id,
    activityLogs: [{ id: crypto.randomUUID(), at: now(), message: '판매 데이터 업무가 자동 생성되었습니다.' }],
  })
}

export const salesDataService = {
  getSalesDataImports() {
    return storageService.getItem<SalesDataImport[]>(STORAGE_KEYS.salesDataImports, initialSalesDataImports)
  },
  getSalesDataRows() {
    return storageService.getItem<SalesDataRow[]>(STORAGE_KEYS.salesDataRows, initialSalesDataRows)
  },
  saveImports(imports: SalesDataImport[]) {
    storageService.setItem(STORAGE_KEYS.salesDataImports, imports)
  },
  saveRows(rows: SalesDataRow[]) {
    storageService.setItem(STORAGE_KEYS.salesDataRows, rows)
  },
  getSalesDataByCampaignId(campaignId: string) {
    const imports = this.getSalesDataImports().filter((item) => item.campaignId === campaignId)
    const rows = this.getSalesDataRows().filter((row) => imports.some((item) => item.id === row.salesDataImportId))
    return { imports, rows }
  },
  getSalesDataImportById(id: string) {
    return this.getSalesDataImports().find((item) => item.id === id)
  },
  getRowsByImportId(id: string) {
    return this.getSalesDataRows().filter((row) => row.salesDataImportId === id)
  },
  createSalesDataImport(salesImport: SalesDataImport) {
    this.saveImports([salesImport, ...this.getSalesDataImports().filter((item) => item.id !== salesImport.id)])
    if (salesImport.reviewStatus === '업로드 대기') createSalesDataWorkItem(salesImport, 'upload')
    return salesImport
  },
  updateSalesDataImport(nextImport: SalesDataImport) {
    this.saveImports(this.getSalesDataImports().map((item) => (item.id === nextImport.id ? nextImport : item)))
    if (nextImport.reviewStatus === '검수 중') createSalesDataWorkItem(nextImport, 'review')
    if (nextImport.reviewStatus === '오류 확인 필요') createSalesDataWorkItem(nextImport, 'error')
    return nextImport
  },
  addSalesDataRows(salesDataImportId: string, rows: SalesDataRow[]) {
    const currentRows = this.getSalesDataRows().filter((row) => row.salesDataImportId !== salesDataImportId)
    const targetImport = this.getSalesDataImportById(salesDataImportId)
    const totals = calculateSalesTotals(rows, targetImport)
    this.saveRows([...rows, ...currentRows])
    if (targetImport) {
      this.updateSalesDataImport({
        ...targetImport,
        totalQuantity: totals.totalQuantity,
        totalSalesAmount: totals.totalSalesAmount,
        reviewStatus: targetImport.reviewStatus === '업로드 대기' ? '업로드 완료' : targetImport.reviewStatus,
      })
    }
    return rows
  },
  validateSalesData(salesDataImportId: string) {
    const targetImport = this.getSalesDataImportById(salesDataImportId)
    if (!targetImport) return undefined
    const campaign = campaignService.getCampaignById(targetImport.campaignId)
    const validation = validateSalesRows(targetImport, this.getRowsByImportId(salesDataImportId), campaign)
    this.saveRows([...validation.rows, ...this.getSalesDataRows().filter((row) => row.salesDataImportId !== salesDataImportId)])
    const reviewStatus = validation.status === 'error' ? '오류 확인 필요' : validation.status === 'warning' ? '검수 중' : '검수 중'
    this.updateSalesDataImport({ ...targetImport, reviewStatus })
    return validation
  },
  confirmSalesData(salesDataImportId: string, confirmedBy = '허수정') {
    const targetImport = this.getSalesDataImportById(salesDataImportId)
    if (!targetImport) return undefined
    const validation = validateSalesRows(targetImport, this.getRowsByImportId(salesDataImportId), campaignService.getCampaignById(targetImport.campaignId))
    if (validation.status === 'error') return undefined
    const nextImport: SalesDataImport = {
      ...targetImport,
      reviewStatus: '확정 완료',
      settlementStatus: '정산 가능',
      confirmedAt: now(),
      confirmedBy,
    }
    this.updateSalesDataImport(nextImport)
    workService.completeWorkItem(`sales-data-work-${targetImport.id}-review`, now())
    return nextImport
  },
  markSettlementReady(salesDataImportId: string) {
    const targetImport = this.getSalesDataImportById(salesDataImportId)
    if (!targetImport) return undefined
    const nextImport = { ...targetImport, settlementStatus: '정산 생성됨' as const }
    this.updateSalesDataImport(nextImport)
    createSalesDataWorkItem(nextImport, 'settlement')
    return nextImport
  },
}
