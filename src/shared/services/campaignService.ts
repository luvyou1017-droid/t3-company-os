import { campaigns } from '../data/campaigns'
import { workItems as mockWorkItems } from '../../features/myWork/mockData'
import {
  DEFAULT_APPROVER_USER_ID,
  DEFAULT_MD_USER_ID,
  DEFAULT_OPERATOR_USER_ID,
  getUserById,
} from '../data/users'
import type { WorkItem, WorkRole, WorkType } from '../../features/myWork/types'
import type { CsNotification } from '../../features/cs/types'
import type { CampaignChecklistEntity, ChecklistCategory } from '../types/checklist'
import type {
  BusinessType,
  Campaign,
  CampaignBusinessTypeInput,
  CampaignLinkOwnerInput,
  CampaignRelatedCounts,
  CampaignSummary,
  LinkOwner,
} from '../types/campaign'
import type { PaymentRecipientType, PaymentRequestStatus } from '../types/sellerSettlement'
import { STORAGE_KEYS, storageService } from './storageService'
import type { CampaignCreationBusinessType, CampaignEvent, CampaignProductProposalSnapshot, CampaignProductSelection } from '../types/campaignCreation'
import { captureProposalSnapshots, generateCampaignName } from './campaignCreationService'

export type CampaignCreateInput = {
  campaignName: string
  sellerName: string
  brandName: string
  productName: string
  managerId: string
  mdId: string
  startDate: string
  endDate: string
  linkOwner: CampaignLinkOwnerInput
  businessType: CampaignBusinessTypeInput | CampaignCreationBusinessType
  totalCommissionRate: number
  sellerCommissionRate: number
  settlementDueDate?: string
  landingPageType?: string
  memo?: string
  salesChannelType?: Campaign['salesChannelType']
  campaignProducts?: CampaignProductSelection[]
  proposalSnapshots?: CampaignProductProposalSnapshot[]
  campaignEvents?: CampaignEvent[]
  settlementDueDateOverridden?: boolean
  nameOverridden?: boolean
  notionImportMetadata?: Campaign['notionImportMetadata']
  aiDraftMetadata?: Campaign['aiDraftMetadata']
}

export type CampaignCreateValidationErrors = Partial<Record<keyof CampaignCreateInput, string>>

const linkOwnerLabels: Record<CampaignLinkOwnerInput, LinkOwner> = {
  company: '자사',
  brand: '브랜드사',
  seller: '셀러',
}

const businessTypeLabels: Record<CampaignBusinessTypeInput, BusinessType> = {
  corporation: '법인사업자',
  sole_proprietor: '개인사업자',
  freelancer: '개인사업자',
}

function toLegacyBusinessType(value: CampaignCreateInput['businessType']): BusinessType {
  if (value === 'general_business') return '법인사업자'
  if (value === 'simplified_business' || value === 'freelancer') return '개인사업자'
  return businessTypeLabels[value]
}

function linkOwnerFromSalesChannel(value?: Campaign['salesChannelType']): LinkOwner {
  if (value === 'seller_checkout') return '셀러'
  if (value === 'supplier_link') return '브랜드사'
  return '자사'
}

const today = '2026-07-16'

function toDate(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function addDays(date: string, days: number) {
  const value = toDate(date)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function now() {
  return new Date().toISOString()
}

function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`
}

function getAssigneeForTitle(title: string, campaign: Campaign) {
  if (title.includes('브랜드사') || title.includes('브랜드')) return DEFAULT_MD_USER_ID
  if (title.includes('CS')) return DEFAULT_OPERATOR_USER_ID
  if (title.includes('판매 데이터')) return DEFAULT_OPERATOR_USER_ID
  if (title.includes('정산서 작성') || title.includes('정산서 전달')) return DEFAULT_OPERATOR_USER_ID
  if (title.includes('정산 검토')) return campaign.managerId
  if (title.includes('대표 승인')) return DEFAULT_APPROVER_USER_ID
  if (title.includes('샘플') || title.includes('링크') || title.includes('최저가')) return campaign.managerId
  return campaign.managerId
}

function getWorkType(title: string): WorkType {
  if (title.includes('샘플')) return '샘플 발주'
  if (title.includes('링크')) return title.includes('검수') ? '링크 검수' : '링크 요청'
  if (title.includes('배너')) return '배너 검수'
  if (title.includes('매출')) return '10시 매출 전달'
  if (title.includes('CS')) return 'CS 답변'
  if (title.includes('판매 데이터')) return '판매 데이터 검수'
  if (title.includes('정산서 작성') || title.includes('정산서 전달')) return '정산서 작성'
  if (title.includes('지급')) return '지급 승인'
  if (title.includes('최저가')) return '최저가 확인'
  if (title.includes('재고')) return '재고 확인'
  return '체크리스트'
}

function getRelatedMenu(category: ChecklistCategory) {
  const menus: Record<ChecklistCategory, string> = {
    sample: '샘플',
    banner: '공동구매 상세',
    link: '공동구매 상세',
    faq: '공동구매 상세',
    sales: '판매 데이터',
    cs: 'CS 관리',
    settlement: '정산 관리',
    payment: '지급',
    approval: '공동구매 상세',
  }
  return menus[category]
}

function toWorkRole(userId: string): WorkRole {
  return getUserById(userId)?.role ?? '매니저'
}

function createChecklistWorkItem(campaign: Campaign, item: CampaignChecklistEntity): WorkItem {
  const assignee = getUserById(item.assigneeId) ?? getUserById(campaign.managerId)
  return {
    id: `work-${item.id}`,
    title: `[체크리스트] ${item.title}`,
    description: `${campaign.campaignName} 운영 체크리스트입니다.`,
    workType: getWorkType(item.title),
    status: 'pending',
    campaignId: campaign.id,
    sourceType: 'checklist',
    sourceId: item.id,
    campaignName: campaign.campaignName,
    sellerName: campaign.sellerName,
    brandName: campaign.brandName,
    assigneeId: item.assigneeId,
    assigneeName: assignee?.name ?? campaign.managerName,
    assigneeRole: toWorkRole(item.assigneeId),
    dueDate: item.dueDate,
    dueTime: '18:00',
    dueAt: `${item.dueDate} 18:00`,
    createdReason: 'Campaign 생성 시 자동 체크리스트 생성',
    relatedMenu: getRelatedMenu(item.category),
    checklistName: item.title,
    relatedLink: campaign.id,
    activityLogs: [{ id: crypto.randomUUID(), at: item.createdAt, message: 'Campaign 체크리스트에서 업무가 자동 생성되었습니다.' }],
  }
}

const checklistSeeds: Array<{ offsetFrom: 'start' | 'end'; offset: number; group: string; category: ChecklistCategory; title: string }> = [
  { offsetFrom: 'start', offset: -14, group: 'D-14', category: 'sample', title: '샘플 발송 확인' },
  { offsetFrom: 'start', offset: -14, group: 'D-14', category: 'sample', title: '추가 샘플 필요 여부 확인' },
  { offsetFrom: 'start', offset: -13, group: 'D-13', category: 'banner', title: '배너 제작' },
  { offsetFrom: 'start', offset: -13, group: 'D-13', category: 'banner', title: '판매가·옵션·구성 확인' },
  { offsetFrom: 'start', offset: -13, group: 'D-13', category: 'banner', title: '이벤트 진행 여부 확인' },
  { offsetFrom: 'start', offset: -12, group: 'D-12', category: 'link', title: '판매 링크 제작' },
  { offsetFrom: 'start', offset: -12, group: 'D-12', category: 'link', title: '오픈 시간 확인' },
  { offsetFrom: 'start', offset: -11, group: 'D-11', category: 'link', title: '최종 링크 전달' },
  { offsetFrom: 'start', offset: -11, group: 'D-11', category: 'banner', title: '배너 전달' },
  { offsetFrom: 'start', offset: -11, group: 'D-11', category: 'link', title: '가격 검수' },
  { offsetFrom: 'start', offset: -10, group: 'D-10', category: 'faq', title: 'FAQ 전달' },
  { offsetFrom: 'start', offset: -10, group: 'D-10', category: 'faq', title: '소구 포인트 정리' },
  { offsetFrom: 'start', offset: -10, group: 'D-10', category: 'cs', title: 'CS 주의사항 정리' },
  { offsetFrom: 'start', offset: -7, group: 'D-7', category: 'sales', title: '제품 소구점 전달' },
  { offsetFrom: 'start', offset: -7, group: 'D-7', category: 'sales', title: '옵션별 추천 구성 전달' },
  { offsetFrom: 'start', offset: -5, group: 'D-5 ~ D-3', category: 'sales', title: '오픈글 전달' },
  { offsetFrom: 'start', offset: -5, group: 'D-5 ~ D-3', category: 'sales', title: '예고글 전달' },
  { offsetFrom: 'start', offset: -3, group: 'D-5 ~ D-3', category: 'link', title: '오탈자와 링크 최종 검수' },
  { offsetFrom: 'start', offset: -1, group: 'D-1', category: 'link', title: '최저가 확인' },
  { offsetFrom: 'start', offset: -1, group: 'D-1', category: 'link', title: '오픈 시간 확인' },
  { offsetFrom: 'start', offset: -1, group: 'D-1', category: 'cs', title: 'CS 링크 전달' },
  { offsetFrom: 'start', offset: -1, group: 'D-1', category: 'sales', title: '배송 마감시간 전달' },
  { offsetFrom: 'start', offset: 0, group: 'D-DAY', category: 'link', title: '링크 정상 오픈 확인' },
  { offsetFrom: 'start', offset: 0, group: 'D-DAY', category: 'sales', title: '매출 확인' },
  { offsetFrom: 'start', offset: 0, group: 'D-DAY', category: 'sales', title: '배송 이슈 확인' },
  { offsetFrom: 'start', offset: 0, group: 'D-DAY', category: 'sales', title: '재고 확인' },
  { offsetFrom: 'end', offset: 1, group: '종료 다음 날', category: 'sales', title: '종료 인사' },
  { offsetFrom: 'end', offset: 1, group: '종료 다음 날', category: 'sales', title: '최종 매출 공유' },
  { offsetFrom: 'end', offset: 1, group: '종료 다음 날', category: 'settlement', title: '정산 예정일 안내' },
  { offsetFrom: 'end', offset: 14, group: 'D+14', category: 'sales', title: '이벤트 당첨자 선정' },
  { offsetFrom: 'end', offset: 21, group: 'D+21 ~ D+28', category: 'settlement', title: '정산서 작성' },
  { offsetFrom: 'end', offset: 21, group: 'D+21 ~ D+28', category: 'settlement', title: '정산서 전달' },
  { offsetFrom: 'end', offset: 28, group: 'D+21 ~ D+28', category: 'payment', title: '지급 요청 확인' },
]

const toSummary = (campaign: Campaign): CampaignSummary => ({
  id: campaign.id,
  campaignCode: campaign.campaignCode,
  campaignName: campaign.campaignName,
  sellerName: campaign.sellerName,
  brandName: campaign.brandName,
  productName: campaign.productName,
  managerName: campaign.managerName,
  mdName: campaign.mdName,
  period: [campaign.startDate, campaign.endDate].filter(Boolean).join(' ~ '),
  linkOwner: campaign.linkOwner,
  businessType: campaign.businessType,
})

export const campaignService = {
  getCampaigns() {
    return storageService.getItem<Campaign[]>(STORAGE_KEYS.campaigns, campaigns)
  },
  saveCampaigns(nextCampaigns: Campaign[]) {
    storageService.setItem(STORAGE_KEYS.campaigns, nextCampaigns)
  },
  getCampaignById(id: string) {
    return this.getCampaigns().find((campaign) => campaign.id === id)
  },
  updatePaymentRequestStatus(id: string, recipientType: PaymentRecipientType, status: PaymentRequestStatus, completedAt?: string) {
    const statusKey = recipientType === 'seller' ? 'sellerPaymentRequestStatus' : 'managerPaymentRequestStatus'
    const completedKey = recipientType === 'seller' ? 'sellerPaymentCompletedAt' : 'managerPaymentCompletedAt'
    const next = this.getCampaigns().map((campaign) => campaign.id === id
      ? { ...campaign, [statusKey]: status, ...(completedAt ? { [completedKey]: completedAt } : {}), updatedAt: new Date().toISOString() }
      : campaign)
    this.saveCampaigns(next)
    return next.find((campaign) => campaign.id === id)
  },
  getCampaignByCode(campaignCode: string) {
    return this.getCampaigns().find((campaign) => campaign.campaignCode === campaignCode)
  },
  getCampaignSummary(id: string) {
    const campaign = this.getCampaignById(id)
    return campaign ? toSummary(campaign) : undefined
  },
  isDuplicateCampaignCode(campaignCode: string) {
    return this.getCampaigns().some((campaign) => campaign.campaignCode === campaignCode)
  },
  generateNextCampaignCode(year = new Date().getFullYear()) {
    const prefix = `CAMPAIGN-${year}-`
    const maxNumber = this.getCampaigns().reduce((max, campaign) => {
      if (!campaign.campaignCode.startsWith(prefix)) return max
      const value = Number(campaign.campaignCode.replace(prefix, ''))
      return Number.isFinite(value) ? Math.max(max, value) : max
    }, 0)
    return `${prefix}${String(maxNumber + 1).padStart(4, '0')}`
  },
  validateCampaign(input: CampaignCreateInput): CampaignCreateValidationErrors {
    const errors: CampaignCreateValidationErrors = {}

    if (!input.campaignName.trim()) errors.campaignName = '공동구매명을 입력해주세요.'
    if (!input.sellerName.trim()) errors.sellerName = '셀러를 입력해주세요.'
    if (!input.brandName.trim()) errors.brandName = '브랜드를 입력해주세요.'
    if (!input.productName.trim()) errors.productName = '상품을 입력해주세요.'
    if (!input.managerId) errors.managerId = '담당 매니저를 선택해주세요.'
    if (!input.mdId) errors.mdId = 'MD를 선택해주세요.'
    if (!input.startDate) errors.startDate = '시작일을 선택해주세요.'
    if (!input.endDate) errors.endDate = '종료일을 선택해주세요.'
    if (!input.linkOwner) errors.linkOwner = '링크 주체를 선택해주세요.'
    if (!input.businessType) errors.businessType = '사업자 유형을 선택해주세요.'
    if (input.campaignProducts?.length) {
      try { captureProposalSnapshots(input.campaignProducts) } catch (error) {
        errors.productName = error instanceof Error ? error.message : '상품 수수료 정책을 확인해주세요.'
      }
    }

    if (input.startDate && input.endDate && input.endDate < input.startDate) {
      errors.endDate = '종료일은 시작일보다 빠를 수 없습니다.'
    }

    if (!input.campaignProducts?.length && input.totalCommissionRate <= 0) {
      errors.totalCommissionRate = '총수수료율은 0보다 커야 합니다.'
    }

    if (!input.campaignProducts?.length && input.sellerCommissionRate < 0) {
      errors.sellerCommissionRate = '셀러 수수료율은 음수일 수 없습니다.'
    }

    if (!input.campaignProducts?.length && input.totalCommissionRate > 100) {
      errors.totalCommissionRate = '수수료율은 100을 초과할 수 없습니다.'
    }

    if (!input.campaignProducts?.length && input.sellerCommissionRate > 100) {
      errors.sellerCommissionRate = '수수료율은 100을 초과할 수 없습니다.'
    }

    if (
      !input.campaignProducts?.length &&
      input.totalCommissionRate >= 0 &&
      input.sellerCommissionRate >= 0 &&
      input.totalCommissionRate < input.sellerCommissionRate
    ) {
      errors.sellerCommissionRate = '총수수료율은 셀러 수수료율 이상이어야 합니다.'
    }

    if (
      !input.campaignProducts?.length &&
      input.totalCommissionRate > 0 &&
      input.sellerCommissionRate >= 0 &&
      input.totalCommissionRate === input.sellerCommissionRate
    ) {
      errors.sellerCommissionRate = '총수수료율과 셀러 수수료율은 서로 다른 값이어야 합니다.'
    }

    return errors
  },
  getChecklistItems() {
    return storageService.getItem<CampaignChecklistEntity[]>(STORAGE_KEYS.campaignChecklistItems, [])
  },
  getChecklistItemsByCampaignId(campaignId: string) {
    return this.getChecklistItems().filter((item) => item.campaignId === campaignId)
  },
  createDefaultChecklist(campaign: Campaign) {
    const createdAt = now()
    return checklistSeeds.map((seed): CampaignChecklistEntity => {
      const dueDate = addDays(seed.offsetFrom === 'start' ? campaign.startDate : campaign.endDate, seed.offset)
      return {
        id: createId('checklist'),
        campaignId: campaign.id,
        title: seed.title,
        category: seed.category,
        group: seed.group,
        dueDate,
        assigneeId: getAssigneeForTitle(seed.title, campaign),
        status: dueDate < today ? 'overdue' : 'pending',
        createdAt,
      }
    })
  },
  saveChecklistItems(items: CampaignChecklistEntity[]) {
    storageService.setItem(STORAGE_KEYS.campaignChecklistItems, items)
  },
  createWorkItemsFromChecklist(campaign: Campaign, checklistItems: CampaignChecklistEntity[]) {
    const currentItems = storageService.getItem<WorkItem[]>(STORAGE_KEYS.workItems, mockWorkItems)
    const existingSourceIds = new Set(currentItems.map((item) => item.sourceId))
    const nextItems = checklistItems
      .filter((item) => !existingSourceIds.has(item.id))
      .map((item) => createChecklistWorkItem(campaign, item))

    storageService.setItem(STORAGE_KEYS.workItems, [...nextItems, ...currentItems])
    return nextItems
  },
  createCampaignNotifications(campaign: Campaign) {
    const recipients = [
      { userId: campaign.managerId, title: '새 공동구매 일정이 등록되었습니다.' },
      { userId: DEFAULT_MD_USER_ID, title: '브랜드사 확인이 필요한 공동구매가 등록되었습니다.' },
      { userId: DEFAULT_OPERATOR_USER_ID, title: '신규 공동구매 운영 일정이 생성되었습니다.' },
    ]
    const currentNotifications = storageService.getItem<CsNotification[]>(STORAGE_KEYS.notifications, [])
    const createdAt = now()
    const notifications = recipients.map((recipient): CsNotification => {
      const user = getUserById(recipient.userId)
      return {
        id: crypto.randomUUID(),
        campaignId: campaign.id,
        relatedType: 'campaign',
        relatedId: campaign.id,
        recipientId: recipient.userId,
        recipientName: user?.name ?? '',
        csCaseId: campaign.id,
        caseNumber: campaign.campaignCode,
        title: recipient.title,
        message: `공동구매: ${campaign.campaignName}\n기간: ${campaign.startDate} ~ ${campaign.endDate}`,
        createdAt,
        read: false,
        isRead: false,
      }
    })
    storageService.setItem(STORAGE_KEYS.notifications, [...notifications, ...currentNotifications])
    return notifications
  },
  createCampaign(input: CampaignCreateInput) {
    const errors = this.validateCampaign(input)
    if (Object.keys(errors).length > 0) {
      return { campaign: undefined, errors }
    }

    const manager = getUserById(input.managerId)
    const md = getUserById(input.mdId)
    const createdAt = now()
    const campaignCode = this.generateNextCampaignCode(new Date(input.startDate).getFullYear())
    const campaign: Campaign = {
      id: createId('SCH'),
      campaignCode,
      campaignName: input.campaignName.trim() || generateCampaignName({ sellerName: input.sellerName, selectedProducts: input.campaignProducts ?? [] }),
      sellerId: createId('seller'),
      sellerName: input.sellerName.trim(),
      brandId: input.campaignProducts?.[0]?.brandId ?? createId('brand'),
      brandName: input.brandName.trim(),
      productId: input.campaignProducts?.[0]?.productId ?? createId('product'),
      productName: input.productName.trim(),
      managerId: input.managerId,
      managerName: manager?.name ?? '',
      mdId: input.mdId,
      mdName: md?.name ?? '',
      startDate: input.startDate,
      endDate: input.endDate,
      linkOwner: input.salesChannelType ? linkOwnerFromSalesChannel(input.salesChannelType) : linkOwnerLabels[input.linkOwner],
      businessType: toLegacyBusinessType(input.businessType),
      totalCommissionRate: input.totalCommissionRate,
      sellerCommissionRate: input.sellerCommissionRate,
      settlementDueDate: input.settlementDueDate ?? '',
      landingPageType: input.landingPageType,
      salesChannelType: input.salesChannelType,
      memo: input.memo,
      createdAt,
      updatedAt: createdAt,
      status: 'preparing',
      landingPageCompleted: false,
      pendingTaskCount: checklistSeeds.length,
      pendingCsCount: 0,
      pendingSampleCount: 0,
      linkReviewPending: true,
      orderPending: true,
      vendorSettlementCompleted: false,
      settlementDocumentCompleted: false,
      sellerPaymentCompleted: false,
      managerPaymentCompleted: false,
      todayTask: '자동 체크리스트 확인',
      campaignProducts: input.campaignProducts,
      proposalSnapshots: input.proposalSnapshots ?? (input.campaignProducts?.length ? captureProposalSnapshots(input.campaignProducts) : undefined),
      campaignEvents: input.campaignEvents,
      creationBusinessType: input.businessType === 'corporation' || input.businessType === 'sole_proprietor' ? 'general_business' : input.businessType,
      settlementDueDateOverridden: input.settlementDueDateOverridden,
      notionImportMetadata: input.notionImportMetadata,
      aiDraftMetadata: input.aiDraftMetadata,
    }

    if (this.isDuplicateCampaignCode(campaign.campaignCode)) {
      return { campaign: undefined, errors: { campaignName: 'Campaign Code가 중복되었습니다. 다시 시도해주세요.' } }
    }

    this.saveCampaigns([campaign, ...this.getCampaigns()])
    const checklistItems = this.createDefaultChecklist(campaign)
    this.saveChecklistItems([...checklistItems, ...this.getChecklistItems()])
    const workItems = this.createWorkItemsFromChecklist(campaign, checklistItems)
    const notifications = this.createCampaignNotifications(campaign)
    storageService.removeItem(STORAGE_KEYS.campaignCreateDraft)

    return { campaign, checklistItems, workItems, notifications, errors: {} }
  },
  getCampaignRelatedCounts(campaignId: string): CampaignRelatedCounts {
    const csCases = storageService.getItem<Array<{ campaignId: string }>>(STORAGE_KEYS.csCases, [])
    const samples = storageService.getItem<Array<{ campaignId: string }>>(STORAGE_KEYS.samples, [])
    const workItems = storageService.getItem<Array<{ campaignId: string }>>(STORAGE_KEYS.workItems, [])
    const notifications = storageService.getItem<Array<{ campaignId?: string }>>(STORAGE_KEYS.notifications, [])

    return {
      csCount: csCases.filter((item) => item.campaignId === campaignId).length,
      sampleCount: samples.filter((item) => item.campaignId === campaignId).length,
      workItemCount: workItems.filter((item) => item.campaignId === campaignId).length,
      notificationCount: notifications.filter((item) => item.campaignId === campaignId).length,
    }
  },
}
