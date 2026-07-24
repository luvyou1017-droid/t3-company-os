import { workItems } from '../../features/myWork/mockData'
import type { WorkItem, WorkType } from '../../features/myWork/types'
import type { CsCase } from '../../features/cs/types'
import type { SampleRequest } from '../../features/samples/types'
import { STORAGE_KEYS, storageService } from './storageService'
import { getUserById } from '../data/users'

export type CampaignWorkInput = {
  campaignId: string
  title: string
  description?: string
  assigneeId: string
  assigneeName?: string
  dueDate: string
  priority?: 'urgent' | 'high' | 'medium' | 'low'
  category: string
  campaignName?: string
  sellerName?: string
  brandName?: string
}

export const workService = {
  getWorkItems() {
    return storageService.getItem<WorkItem[]>(STORAGE_KEYS.workItems, workItems)
  },
  saveWorkItems(items: WorkItem[]) {
    storageService.setItem(STORAGE_KEYS.workItems, items)
  },
  getWorkItemsByUserId(userId: string) {
    return this.getWorkItems().filter((item) => item.assigneeId === userId)
  },
  createWorkItem(item: WorkItem) {
    const next = [item, ...this.getWorkItems().filter((work) => work.id !== item.id)]
    this.saveWorkItems(next)
    return item
  },
  createCampaignWorkItem(input: CampaignWorkInput) {
    const user = getUserById(input.assigneeId)
    const item: WorkItem = {
      id: `work-manual-${crypto.randomUUID()}`,
      title: input.title,
      description: input.description ?? '',
      workType: '체크리스트',
      status: 'todo',
      campaignId: input.campaignId,
      sourceType: 'manual',
      sourceId: `manual-${crypto.randomUUID()}`,
      campaignName: input.campaignName ?? input.campaignId,
      sellerName: input.sellerName ?? '-',
      brandName: input.brandName ?? '-',
      assigneeId: input.assigneeId,
      assigneeName: input.assigneeName ?? user?.name ?? '미배정',
      assigneeRole: user?.role ?? '매니저',
      dueDate: input.dueDate,
      dueTime: '18:00',
      dueAt: `${input.dueDate} 18:00`,
      createdReason: `Campaign 상세에서 ${input.category} 업무 생성`,
      relatedMenu: '공동구매 상세',
      checklistName: input.category,
      relatedLink: input.campaignId,
      activityLogs: [{ id: crypto.randomUUID(), at: new Date().toISOString(), message: 'Campaign 상세에서 업무가 생성되었습니다.' }],
    }
    return this.createWorkItem(item)
  },
  completeWorkItem(id: string, completedAt = '2026-07-15 14:30') {
    const next = this.getWorkItems().map((item) => (item.id === id ? { ...item, status: 'completed' as const, completedAt } : item))
    this.saveWorkItems(next)
  },
  syncWorkItemFromSource(sourceType: 'cs' | 'sample', source: CsCase | SampleRequest, workType?: WorkType) {
    if (sourceType === 'cs') return this.createCsWorkItem(source as CsCase)
    return this.createSampleWorkItem(source as SampleRequest, workType ?? '샘플 발주')
  },
  createCsWorkItem(csCase: CsCase) {
    const imageCount = csCase.attachments.filter((item) => item.fileType === 'image').length
    const videoCount = csCase.attachments.filter((item) => item.fileType === 'video').length
    return this.createWorkItem({
      id: `work-${csCase.id}`,
      title: `[신규 CS] ${csCase.csType} 확인`,
      description: csCase.description,
      workType: 'CS 답변',
      status: 'todo',
      campaignId: csCase.campaignId,
      sourceType: 'cs',
      sourceId: csCase.id,
      campaignName: csCase.campaignName,
      sellerName: csCase.sellerName,
      brandName: csCase.brandName,
      assigneeId: csCase.assigneeId,
      assigneeName: csCase.assigneeName,
      assigneeRole: '정산 담당자',
      dueDate: '2026-07-16',
      dueTime: '14:12',
      dueAt: '2026-07-16 14:12',
      createdReason: '외부 고객 CS 폼 접수',
      relatedMenu: 'CS 관리',
      checklistName: `관련 CS 접수번호 ${csCase.caseNumber}`,
      relatedLink: csCase.caseNumber,
      isCsOver24h: false,
      activityLogs: [{ id: crypto.randomUUID(), at: csCase.receivedAt, message: `CS 업무가 자동 생성되었습니다. 첨부 이미지 ${imageCount}개, 영상 ${videoCount}개.` }],
    })
  },
  createSampleWorkItem(sample: SampleRequest, workType: WorkType) {
    const assigneeId = sample.orderManagerName === '허수정' ? 'u-002' : sample.orderManagerName === '김병희' ? 'u-005' : 'u-001'
    return this.createWorkItem({
      id: `sample-work-${sample.id}-${workType}`,
      title: workType === '샘플 회수' ? `[샘플 회수] ${sample.campaignName}` : workType === '정산서 검토' ? '[정산 반영] 유상 샘플 비용 확인' : `[샘플 발주] ${sample.brandName} ${sample.productName}`,
      description: sample.memo || '샘플 관련 업무입니다.',
      workType,
      status: 'todo',
      campaignId: sample.campaignId,
      sourceType: 'sample',
      sourceId: sample.id,
      campaignName: sample.campaignName,
      sellerName: sample.sellerName,
      brandName: sample.brandName,
      assigneeId: workType === '정산서 검토' ? 'u-002' : assigneeId,
      assigneeName: workType === '정산서 검토' ? '허수정' : sample.orderManagerName,
      assigneeRole: workType === '정산서 검토' ? '정산 담당자' : '매니저',
      dueDate: sample.returnDueDate || '2026-07-16',
      dueTime: '11:00',
      dueAt: `${sample.returnDueDate || '2026-07-16'} 11:00`,
      createdReason: workType === '샘플 회수' ? '회수 예정일 3일 전' : workType === '정산서 검토' ? '유상 샘플 정산 반영 필요' : '신규 샘플 요청',
      relatedMenu: '샘플',
      checklistName: `관련 sampleRequestId ${sample.id}`,
      relatedLink: sample.id,
      activityLogs: [{ id: crypto.randomUUID(), at: '2026-07-15 09:10', message: '샘플 업무가 생성되었습니다.' }],
    })
  },
  completeByCsCase(csCase: CsCase) {
    this.completeWorkItem(`work-${csCase.id}`, csCase.completedAt)
  },
  completeBySample(sample: SampleRequest, workType: WorkType = '샘플 발주') {
    this.completeWorkItem(`sample-work-${sample.id}-${workType}`, '2026.07.15 14:30')
  },
}
