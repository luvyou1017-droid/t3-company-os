import type { WorkType } from '../../features/myWork/types'
import type { SampleCostOwner, SampleRequest } from '../../features/samples/types'
import type { SalesDataImport } from '../types/salesData'
import type {
  Settlement,
  SettlementActivityAction,
  SettlementActivityLog,
  SettlementApplyLocation,
  SettlementCostOwner,
  SettlementDeduction,
  SettlementEvidenceStatus,
  SettlementReviewChecklist,
  SettlementStatus,
  SettlementTaxType,
  SettlementVersion,
} from '../types/settlement'
import {
  calculateSettlement,
  canMoveToApproval,
  canMoveToPaymentReady,
  compareSettlementVersions as compareVersions,
  createCalculationSteps,
  isSettlementCompleted,
  validateSettlement,
} from '../utils/settlement'
import { validateSalesRows } from '../utils/salesData'
import { campaignService } from './campaignService'
import { notificationService } from './notificationService'
import { salesDataService } from './salesDataService'
import { sampleService } from './sampleService'
import { STORAGE_KEYS, storageService } from './storageService'
import { workService } from './workService'

const now = () => new Date().toISOString()
const paymentDueDate = '2026-07-22'

const defaultChecklist: SettlementReviewChecklist = {
  salesMatches: false,
  commissionRateConfirmed: false,
  sampleCostReflected: false,
  eventCostReflected: false,
  otherDeductionsConfirmed: false,
  costOwnersConfirmed: false,
  managerShareConfirmed: false,
  taxTypeConfirmed: false,
  evidenceConfirmed: false,
  paymentAccountConfirmed: false,
}

function taxTypeFromBusinessType(businessType?: string): SettlementTaxType {
  if (businessType === '법인사업자') return 'tax_invoice'
  if (businessType === '개인사업자') return 'cash_receipt'
  return 'withholding_3_3'
}

function ownerFromSample(owner: SampleCostOwner): SettlementCostOwner {
  const map: Record<SampleCostOwner, SettlementCostOwner> = {
    회사: 'company',
    셀러: 'seller',
    브랜드사: 'brand',
    매니저: 'manager',
    미정: 'undecided',
  }
  return map[owner]
}

function applyLocationFromOwner(owner: SettlementCostOwner): SettlementApplyLocation {
  if (owner === 'company') return 'net_company_commission'
  if (owner === 'seller') return 'seller_payment'
  if (owner === 'manager') return 'manager_payment'
  if (owner === 'brand') return 'record_only'
  return 'needs_review'
}

function createSampleDeductions(settlementId: string, campaignId: string, samples: SampleRequest[]) {
  const createdAt = now()
  return samples
    .filter((sample) => sample.paymentType === '유상' && !sample.settlementReflected)
    .map<SettlementDeduction>((sample) => {
      const costOwner = ownerFromSample(sample.costOwner)
      return {
        id: `deduction-${sample.id}`,
        settlementId,
        campaignId,
        type: 'sample',
        title: `${sample.productName} ${sample.optionName} 샘플비`,
        amount: Math.max(Math.round(sample.settlementAmount || sample.sampleCost + sample.shippingCost), 0),
        costOwner,
        linkedData: `sample:${sample.id}`,
        evidenceStatus: sample.attachments.length ? 'confirmed' : 'pending',
        applyLocation: applyLocationFromOwner(costOwner),
        reflected: costOwner !== 'brand',
        memo: 'Sample 관리 자동 후보',
        createdAt,
        updatedAt: createdAt,
      }
    })
}

function createSalesDeductions(settlementId: string, salesImport: SalesDataImport) {
  const createdAt = now()
  const items: SettlementDeduction[] = []
  if (salesImport.eventDeductionAmount) {
    items.push({
      id: `deduction-${salesImport.id}-event`,
      settlementId,
      campaignId: salesImport.campaignId,
      type: 'event',
      title: '이벤트 비용',
      amount: Math.max(Math.round(salesImport.eventDeductionAmount), 0),
      costOwner: 'company',
      linkedData: `sales_data:${salesImport.id}`,
      evidenceStatus: 'pending',
      applyLocation: 'net_company_commission',
      reflected: true,
      memo: '이벤트 비용 수기 입력',
      createdAt,
      updatedAt: createdAt,
    })
  }
  if (salesImport.sampleDeductionAmount) {
    items.push({
      id: `deduction-${salesImport.id}-sample-manual`,
      settlementId,
      campaignId: salesImport.campaignId,
      type: 'sample',
      title: '판매 데이터 샘플비 차감',
      amount: Math.max(Math.round(salesImport.sampleDeductionAmount), 0),
      costOwner: 'company',
      linkedData: `sales_data:${salesImport.id}`,
      evidenceStatus: 'pending',
      applyLocation: 'net_company_commission',
      reflected: true,
      memo: '담당자 수정 가능',
      createdAt,
      updatedAt: createdAt,
    })
  }
  return items
}

function getCampaignText(campaignId: string) {
  const campaign = campaignService.getCampaignById(campaignId)
  return {
    campaignName: campaign?.campaignName ?? campaignId,
    sellerName: campaign?.sellerName ?? '-',
    brandName: campaign?.brandName ?? '-',
    managerId: campaign?.managerId ?? 'u-001',
    managerName: campaign?.managerName ?? '허윤정',
    mdName: campaign?.mdName ?? '유시철',
  }
}

function createSettlementWork(settlement: Settlement, title: string, workType: WorkType, assigneeName: string, assigneeId: string, role: '대표' | '매니저' | 'MD' | '정산 담당자') {
  const campaign = getCampaignText(settlement.campaignId)
  return workService.createWorkItem({
    id: `settlement-work-${settlement.id}-${workType}-${assigneeId}`,
    title,
    description: '정산 계산값, 차감 항목, 증빙 상태를 확인합니다.',
    workType,
    status: 'todo',
    campaignId: settlement.campaignId,
    sourceType: 'settlement',
    sourceId: settlement.id,
    campaignName: campaign.campaignName,
    sellerName: campaign.sellerName,
    brandName: campaign.brandName,
    assigneeId,
    assigneeName,
    assigneeRole: role,
    dueDate: paymentDueDate,
    dueTime: '18:00',
    dueAt: `${paymentDueDate} 18:00`,
    createdReason: '정산 상태 변경에 따른 자동 업무',
    relatedMenu: '정산 관리',
    checklistName: `settlementId ${settlement.id}`,
    relatedLink: settlement.id,
    activityLogs: [{ id: crypto.randomUUID(), at: now(), message: '정산 업무가 자동 생성되었습니다.' }],
  })
}

function createSettlementNotification(settlement: Settlement, title: string, message: string, recipientId = 'u-002', recipientName = '허수정') {
  return notificationService.createNotification({
    id: crypto.randomUUID(),
    campaignId: settlement.campaignId,
    relatedType: 'settlement',
    relatedId: settlement.id,
    recipientId,
    recipientName,
    csCaseId: settlement.id,
    caseNumber: settlement.id,
    title,
    message,
    createdAt: now(),
    read: false,
    isRead: false,
  })
}

function isEligibleSalesData(salesImport: SalesDataImport) {
  const rows = salesDataService.getRowsByImportId(salesImport.id)
  const validation = validateSalesRows(salesImport, rows, campaignService.getCampaignById(salesImport.campaignId))
  return salesImport.reviewStatus === '확정 완료' && salesImport.settlementStatus === '정산 가능' && Boolean(salesImport.campaignId) && validation.status !== 'error'
}

function withRecalculation(settlement: Settlement, reason = '계산 실행'): Settlement {
  const salesImport = salesDataService.getSalesDataImportById(settlement.salesDataImportId)
  if (!salesImport) return settlement
  const rows = salesDataService.getRowsByImportId(salesImport.id)
  const deductions = settlementService.getDeductionsBySettlementId(settlement.id)
  const currentCalculation = calculateSettlement(salesImport, rows, deductions, settlement.taxType)
  const calculationSteps = createCalculationSteps(currentCalculation)
  const next: Settlement = { ...settlement, currentCalculation, calculationSteps, updatedAt: now() }
  settlementService.saveSettlements(settlementService.getSettlements().map((item) => (item.id === next.id ? next : item)))
  settlementService.addActivity(next, 'calculation_run', settlement.status, next.status, reason)
  return next
}

export const settlementService = {
  getSettlements() {
    const stored = storageService.getItem<Settlement[]>(STORAGE_KEYS.settlements, [])
    if (stored.length) return this.refreshRevisionFlags(stored)
    return this.seedInitialSettlements()
  },
  saveSettlements(settlements: Settlement[]) {
    storageService.setItem(STORAGE_KEYS.settlements, settlements)
  },
  getDeductions() {
    return storageService.getItem<SettlementDeduction[]>(STORAGE_KEYS.settlementDeductions, [])
  },
  saveDeductions(deductions: SettlementDeduction[]) {
    storageService.setItem(STORAGE_KEYS.settlementDeductions, deductions)
  },
  getActivityLogs() {
    return storageService.getItem<SettlementActivityLog[]>(STORAGE_KEYS.settlementActivityLogs, [])
  },
  saveActivityLogs(logs: SettlementActivityLog[]) {
    storageService.setItem(STORAGE_KEYS.settlementActivityLogs, logs)
  },
  getSettlementVersions() {
    return storageService.getItem<SettlementVersion[]>(STORAGE_KEYS.settlementVersions, [])
  },
  saveVersions(versions: SettlementVersion[]) {
    storageService.setItem(STORAGE_KEYS.settlementVersions, versions)
  },
  getSettlementById(id: string) {
    return this.getSettlements().find((item) => item.id === id)
  },
  getSettlementByCampaignId(campaignId: string) {
    return this.getSettlements().filter((item) => item.campaignId === campaignId)
  },
  getSettlementVersionsBySettlementId(settlementId: string) {
    return this.getSettlementVersions().filter((item) => item.settlementId === settlementId).sort((a, b) => b.version - a.version)
  },
  getDeductionsBySettlementId(settlementId: string) {
    return this.getDeductions().filter((item) => item.settlementId === settlementId)
  },
  getActivityLogsBySettlementId(settlementId: string) {
    return this.getActivityLogs().filter((item) => item.settlementId === settlementId).sort((a, b) => b.at.localeCompare(a.at))
  },
  addActivity(settlement: Settlement, action: SettlementActivityAction, previousStatus: SettlementStatus | undefined, nextStatus: SettlementStatus | undefined, reason: string) {
    const log: SettlementActivityLog = {
      id: crypto.randomUUID(),
      settlementId: settlement.id,
      campaignId: settlement.campaignId,
      at: now(),
      actor: settlement.assigneeName,
      action,
      previousStatus,
      nextStatus,
      reason,
      version: settlement.settlementVersion,
    }
    this.saveActivityLogs([log, ...this.getActivityLogs()])
    return log
  },
  seedInitialSettlements() {
    const readyImports = salesDataService.getSalesDataImports().filter((item) => item.reviewStatus === '확정 완료' && (item.settlementStatus === '정산 가능' || item.settlementStatus === '정산 생성됨' || item.settlementStatus === '정산 완료'))
    const settlements: Settlement[] = []
    const deductions: SettlementDeduction[] = []
    const versions: SettlementVersion[] = []
    const logs: SettlementActivityLog[] = []

    readyImports.slice(0, 3).forEach((salesImport, index) => {
      const campaign = campaignService.getCampaignById(salesImport.campaignId)
      const id = `settlement-${salesImport.id}`
      const createdAt = now()
      const itemDeductions = [...createSampleDeductions(id, salesImport.campaignId, sampleService.getSamplesByCampaignId(salesImport.campaignId)), ...createSalesDeductions(id, salesImport)]
      const status: SettlementStatus = index === 2 ? 'approved' : index === 1 ? 'review_pending' : 'draft'
      const taxType = taxTypeFromBusinessType(campaign?.businessType)
      const currentCalculation = calculateSettlement(salesImport, salesDataService.getRowsByImportId(salesImport.id), itemDeductions, taxType)
      const snapshot = status === 'approved' ? currentCalculation : undefined
      const settlement: Settlement = {
        id,
        campaignId: salesImport.campaignId,
        salesDataImportId: salesImport.id,
        settlementVersion: 1,
        status,
        createdAt,
        updatedAt: createdAt,
        createdBy: '허수정',
        assigneeName: '허수정',
        paymentDueDate: campaign?.settlementDueDate ?? paymentDueDate,
        taxType,
        evidenceStatus: status === 'approved' ? 'confirmed' : 'pending',
        accountConfirmed: status === 'approved',
        taxEvidenceConfirmed: status === 'approved',
        sellerPaymentCompleted: false,
        managerPaymentCompleted: false,
        companySettlementCompleted: false,
        reviewChecklist: status === 'draft' ? defaultChecklist : Object.fromEntries(Object.keys(defaultChecklist).map((key) => [key, true])) as SettlementReviewChecklist,
        calculationSnapshot: snapshot,
        originalSnapshot: snapshot,
        currentCalculation,
        calculationSteps: createCalculationSteps(currentCalculation),
        hasSourceChanged: false,
      }
      settlements.push(settlement)
      deductions.push(...itemDeductions)
      versions.push({
        id: `settlement-version-${settlement.id}-1`,
        settlementId: settlement.id,
        campaignId: settlement.campaignId,
        version: 1,
        changedAt: createdAt,
        changedBy: '허수정',
        reason: 'v1 초안 생성',
        beforeAmount: 0,
        afterAmount: settlement.currentCalculation.finalPaymentAmount,
        status: settlement.status,
        snapshot: settlement.currentCalculation,
      })
      logs.push({
        id: crypto.randomUUID(),
        settlementId: settlement.id,
        campaignId: settlement.campaignId,
        at: createdAt,
        actor: '허수정',
        action: 'draft_created',
        nextStatus: settlement.status,
        reason: '정산 초안 생성',
        version: 1,
      })
    })

    storageService.setItem(STORAGE_KEYS.settlements, settlements)
    storageService.setItem(STORAGE_KEYS.settlementDeductions, deductions)
    storageService.setItem(STORAGE_KEYS.settlementVersions, versions)
    storageService.setItem(STORAGE_KEYS.settlementActivityLogs, logs)
    return settlements
  },
  refreshRevisionFlags(settlements: Settlement[]) {
    const next = settlements.map((settlement) => {
      const salesImport = salesDataService.getSalesDataImportById(settlement.salesDataImportId)
      if (!salesImport) return settlement
      const deductions = this.getDeductionsBySettlementId(settlement.id)
      const current = calculateSettlement(salesImport, salesDataService.getRowsByImportId(salesImport.id), deductions, settlement.taxType)
      if (!settlement.calculationSnapshot || settlement.status === 'revision_required') return { ...settlement, currentCalculation: current, calculationSteps: createCalculationSteps(current) }
      const changed = current.grossSales !== settlement.calculationSnapshot.grossSales || current.grossCommission !== settlement.calculationSnapshot.grossCommission || current.sellerCommissionAmount !== settlement.calculationSnapshot.sellerCommissionAmount || current.deductionTotal !== settlement.calculationSnapshot.deductionTotal
      if (!changed) return { ...settlement, currentCalculation: current, calculationSteps: createCalculationSteps(current), hasSourceChanged: false }
      return { ...settlement, status: 'revision_required' as const, currentCalculation: current, calculationSteps: createCalculationSteps(current), hasSourceChanged: true, sourceChangeReason: '원본 데이터 변경됨' }
    })
    if (JSON.stringify(next) !== JSON.stringify(settlements)) this.saveSettlements(next)
    return next
  },
  createSettlementFromSalesData(salesDataImportId: string, initialStatus: SettlementStatus = 'draft') {
    const salesImport = salesDataService.getSalesDataImportById(salesDataImportId)
    if (!salesImport || !isEligibleSalesData(salesImport)) return undefined
    const campaign = campaignService.getCampaignById(salesImport.campaignId)
    const id = `settlement-${salesImport.id}`
    const createdAt = now()
    const deductions = [...createSampleDeductions(id, salesImport.campaignId, sampleService.getSamplesByCampaignId(salesImport.campaignId)), ...createSalesDeductions(id, salesImport)]
    const taxType = taxTypeFromBusinessType(campaign?.businessType)
    const currentCalculation = calculateSettlement(salesImport, salesDataService.getRowsByImportId(salesImport.id), deductions, taxType)
    const snapshot = initialStatus === 'draft' || initialStatus === 'review_pending' ? undefined : currentCalculation
    const settlement: Settlement = {
      id,
      campaignId: salesImport.campaignId,
      salesDataImportId: salesImport.id,
      settlementVersion: 1,
      status: initialStatus,
      createdAt,
      updatedAt: createdAt,
      createdBy: '허수정',
      assigneeName: '허수정',
      paymentDueDate: campaign?.settlementDueDate ?? paymentDueDate,
      taxType,
      evidenceStatus: deductions.every((item) => item.evidenceStatus === 'confirmed' || item.evidenceStatus === 'not_required') ? 'confirmed' : 'pending',
      accountConfirmed: initialStatus === 'approved',
      taxEvidenceConfirmed: initialStatus === 'approved',
      sellerPaymentCompleted: false,
      managerPaymentCompleted: false,
      companySettlementCompleted: false,
      reviewChecklist: initialStatus === 'draft' ? defaultChecklist : Object.fromEntries(Object.keys(defaultChecklist).map((key) => [key, true])) as SettlementReviewChecklist,
      calculationSnapshot: snapshot,
      originalSnapshot: snapshot,
      currentCalculation,
      calculationSteps: createCalculationSteps(currentCalculation),
      hasSourceChanged: false,
    }
    const currentSettlements = storageService.getItem<Settlement[]>(STORAGE_KEYS.settlements, [])
    this.saveDeductions([...deductions, ...this.getDeductions().filter((item) => item.settlementId !== id)])
    this.saveSettlements([settlement, ...currentSettlements.filter((item) => item.id !== id)])
    this.createSettlementVersion(settlement, 'v1 초안 생성')
    this.addActivity(settlement, 'draft_created', undefined, settlement.status, '정산 초안 생성')
    createSettlementWork(settlement, '[정산] 정산서 작성', '정산서 작성', '허수정', 'u-002', '정산 담당자')
    createSettlementNotification(settlement, '정산 초안이 생성되었습니다.', `${getCampaignText(settlement.campaignId).campaignName} 정산서를 확인하세요.`)
    salesDataService.markSettlementReady(salesImport.id)
    return settlement
  },
  recalculateSettlement(settlementId: string, reason = '재계산') {
    const settlement = this.getSettlementById(settlementId)
    return settlement ? withRecalculation(settlement, reason) : undefined
  },
  createSettlementVersion(settlement: Settlement, reason: string, changedBy = '허수정') {
    const versions = this.getSettlementVersionsBySettlementId(settlement.id)
    const previous = versions[0]
    const version: SettlementVersion = {
      id: `settlement-version-${settlement.id}-${settlement.settlementVersion}`,
      settlementId: settlement.id,
      campaignId: settlement.campaignId,
      version: settlement.settlementVersion,
      changedAt: now(),
      changedBy,
      reason,
      beforeAmount: previous?.snapshot.finalPaymentAmount ?? 0,
      afterAmount: settlement.currentCalculation.finalPaymentAmount,
      status: settlement.status,
      snapshot: settlement.currentCalculation,
    }
    this.saveVersions([version, ...this.getSettlementVersions().filter((item) => item.id !== version.id)])
    return version
  },
  compareSettlementVersions(beforeId: string, afterId: string) {
    const versions = this.getSettlementVersions()
    const before = versions.find((item) => item.id === beforeId)
    const after = versions.find((item) => item.id === afterId)
    return before && after ? compareVersions(before, after) : []
  },
  addDeduction(settlementId: string, deduction: Omit<SettlementDeduction, 'id' | 'settlementId' | 'createdAt' | 'updatedAt'>, reason = '차감 항목 추가') {
    const settlement = this.getSettlementById(settlementId)
    if (!settlement) return undefined
    const createdAt = now()
    const nextDeduction: SettlementDeduction = { ...deduction, id: crypto.randomUUID(), settlementId, createdAt, updatedAt: createdAt }
    this.saveDeductions([nextDeduction, ...this.getDeductions()])
    const next = this.bumpVersion(settlement, reason)
    this.addActivity(next, 'deduction_added', settlement.status, next.status, reason)
    return this.recalculateSettlement(settlementId, reason)
  },
  updateDeduction(nextDeduction: SettlementDeduction, reason = '차감 항목 수정') {
    const settlement = this.getSettlementById(nextDeduction.settlementId)
    if (!settlement) return undefined
    this.saveDeductions(this.getDeductions().map((item) => (item.id === nextDeduction.id ? { ...nextDeduction, updatedAt: now() } : item)))
    const next = this.bumpVersion(settlement, reason)
    this.addActivity(next, 'deduction_updated', settlement.status, next.status, reason)
    return this.recalculateSettlement(nextDeduction.settlementId, reason)
  },
  removeDeduction(settlementId: string, deductionId: string, reason = '차감 항목 삭제') {
    const settlement = this.getSettlementById(settlementId)
    if (!settlement) return undefined
    this.saveDeductions(this.getDeductions().filter((item) => item.id !== deductionId))
    const next = this.bumpVersion(settlement, reason)
    this.addActivity(next, 'deduction_removed', settlement.status, next.status, reason)
    return this.recalculateSettlement(settlementId, reason)
  },
  bumpVersion(settlement: Settlement, reason: string) {
    const previousStatus = settlement.status
    const nextStatus: SettlementStatus = settlement.calculationSnapshot ? 'revision_required' : settlement.status
    const next: Settlement = { ...settlement, settlementVersion: settlement.settlementVersion + 1, status: nextStatus, updatedAt: now(), hasSourceChanged: nextStatus === 'revision_required', sourceChangeReason: nextStatus === 'revision_required' ? '승인본 이후 정산 항목 변경' : settlement.sourceChangeReason }
    this.saveSettlements(this.getSettlements().map((item) => (item.id === settlement.id ? next : item)))
    this.createSettlementVersion(next, reason)
    if (nextStatus === 'revision_required') {
      createSettlementWork(next, '[재검토] 판매 데이터 또는 비용 변경 확인', '정산서 검토', '허수정', 'u-002', '정산 담당자')
      createSettlementNotification(next, '원본 데이터 변경됨', `${getCampaignText(next.campaignId).campaignName} 재검토가 필요합니다.`)
      this.addActivity(next, 'revision_requested', previousStatus, next.status, reason)
    }
    return next
  },
  updateReviewChecklist(settlementId: string, checklist: SettlementReviewChecklist) {
    const settlement = this.getSettlementById(settlementId)
    if (!settlement) return undefined
    const next = { ...settlement, reviewChecklist: checklist, updatedAt: now() }
    this.saveSettlements(this.getSettlements().map((item) => (item.id === settlementId ? next : item)))
    return next
  },
  requestReview(settlementId: string) {
    const settlement = this.recalculateSettlement(settlementId, '매니저 검토 요청')
    if (!settlement) return undefined
    const salesImport = salesDataService.getSalesDataImportById(settlement.salesDataImportId)
    if (!salesImport || !validateSettlement(settlement).valid) return undefined
    const next = { ...settlement, status: 'review_pending' as const, updatedAt: now() }
    this.saveSettlements(this.getSettlements().map((item) => (item.id === settlementId ? next : item)))
    this.addActivity(next, 'manager_review_requested', settlement.status, next.status, '매니저 검토 요청')
    const campaign = getCampaignText(settlement.campaignId)
    createSettlementWork(next, '[정산 검토] 수수료 및 차감 확인', '정산서 검토', campaign.managerName, campaign.managerId, '매니저')
    return next
  },
  completeManagerReview(settlementId: string) {
    const settlement = this.getSettlementById(settlementId)
    if (!settlement || !Object.values(settlement.reviewChecklist).every(Boolean)) return undefined
    const snapshot = settlement.currentCalculation
    const next = { ...settlement, status: 'manager_reviewed' as const, calculationSnapshot: snapshot, originalSnapshot: settlement.originalSnapshot ?? snapshot, updatedAt: now() }
    this.saveSettlements(this.getSettlements().map((item) => (item.id === settlementId ? next : item)))
    this.createSettlementVersion(next, '매니저 검토 완료')
    this.addActivity(next, 'manager_review_completed', settlement.status, next.status, '매니저 검토 완료')
    return next
  },
  requestApproval(settlementId: string) {
    const settlement = this.getSettlementById(settlementId)
    if (!settlement || !canMoveToApproval(settlement)) return undefined
    const next = { ...settlement, status: 'approval_pending' as const, calculationSnapshot: settlement.currentCalculation, updatedAt: now() }
    this.saveSettlements(this.getSettlements().map((item) => (item.id === settlementId ? next : item)))
    this.createSettlementVersion(next, '대표 승인 요청')
    this.addActivity(next, 'approval_requested', settlement.status, next.status, '대표 승인 요청')
    createSettlementWork(next, '[지급 승인] 셀러·매니저 지급 승인', '지급 승인', '허윤정', 'u-001', '대표')
    return next
  },
  approveSettlement(settlementId: string) {
    const settlement = this.getSettlementById(settlementId)
    if (!settlement || settlement.status !== 'approval_pending') return undefined
    const next = { ...settlement, status: 'approved' as const, calculationSnapshot: settlement.currentCalculation, updatedAt: now() }
    this.saveSettlements(this.getSettlements().map((item) => (item.id === settlementId ? next : item)))
    this.createSettlementVersion(next, '대표 승인')
    this.addActivity(next, 'approved', settlement.status, next.status, '대표 승인')
    createSettlementWork(next, '[증빙 확인] 세금계산서 또는 현금영수증', '셀러 증빙 확인', '유시철 MD', 'u-004', 'MD')
    return next
  },
  markPaymentReady(settlementId: string) {
    const settlement = this.getSettlementById(settlementId)
    if (!settlement || !canMoveToPaymentReady(settlement)) return undefined
    const next = { ...settlement, status: 'payment_ready' as const, updatedAt: now() }
    this.saveSettlements(this.getSettlements().map((item) => (item.id === settlementId ? next : item)))
    this.addActivity(next, 'payment_ready', settlement.status, next.status, '지급 준비')
    return next
  },
  markSellerPaymentCompleted(settlementId: string) {
    return this.markPaymentFlag(settlementId, 'sellerPaymentCompleted', 'seller_payment_completed', '셀러 지급 완료')
  },
  markManagerPaymentCompleted(settlementId: string) {
    return this.markPaymentFlag(settlementId, 'managerPaymentCompleted', 'manager_payment_completed', '매니저 지급 완료')
  },
  markCompanySettlementCompleted(settlementId: string) {
    return this.markPaymentFlag(settlementId, 'companySettlementCompleted', 'company_settlement_completed', '업체 정산 완료')
  },
  markPaymentFlag(settlementId: string, key: 'sellerPaymentCompleted' | 'managerPaymentCompleted' | 'companySettlementCompleted', action: SettlementActivityAction, reason: string) {
    const settlement = this.getSettlementById(settlementId)
    if (!settlement) return undefined
    const partial = { ...settlement, [key]: true, status: 'partially_paid' as const, updatedAt: now() }
    const next = isSettlementCompleted(partial) ? { ...partial, status: 'completed' as const } : partial
    this.saveSettlements(this.getSettlements().map((item) => (item.id === settlementId ? next : item)))
    this.addActivity(next, action, settlement.status, next.status, reason)
    if (next.status === 'completed') this.addActivity(next, 'completed', partial.status, 'completed', '최종 완료')
    return next
  },
  completeSettlement(settlementId: string) {
    const settlement = this.getSettlementById(settlementId)
    if (!settlement) return undefined
    const next = { ...settlement, sellerPaymentCompleted: true, managerPaymentCompleted: true, companySettlementCompleted: true, status: 'completed' as const, updatedAt: now() }
    this.saveSettlements(this.getSettlements().map((item) => (item.id === settlementId ? next : item)))
    this.addActivity(next, 'completed', settlement.status, next.status, '최종 완료')
    return next
  },
  updateEvidence(settlementId: string, evidenceStatus: SettlementEvidenceStatus, taxEvidenceConfirmed: boolean, accountConfirmed: boolean) {
    const settlement = this.getSettlementById(settlementId)
    if (!settlement) return undefined
    const next = { ...settlement, evidenceStatus, taxEvidenceConfirmed, accountConfirmed, updatedAt: now() }
    this.saveSettlements(this.getSettlements().map((item) => (item.id === settlementId ? next : item)))
    return next
  },
}
