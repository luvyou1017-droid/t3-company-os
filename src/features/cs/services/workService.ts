import { workItems } from '../../myWork/mockData'
import type { WorkItem } from '../../myWork/types'
import type { CsCase } from '../types'
import { storageService } from './storageService'

const WORK_KEY = 't3.work.items'

export const workService = {
  listWorkItems() {
    return storageService.get<WorkItem[]>(WORK_KEY, workItems)
  },
  saveWorkItems(items: WorkItem[]) {
    storageService.set(WORK_KEY, items)
  },
  createCsWorkItem(csCase: CsCase) {
    const imageCount = csCase.attachments.filter((item) => item.fileType === 'image').length
    const videoCount = csCase.attachments.filter((item) => item.fileType === 'video').length
    const item: WorkItem = {
      id: `work-${csCase.id}`,
      title: `[신규 CS] ${csCase.csType} 확인`,
      description: csCase.description,
      workType: 'CS 답변',
      status: 'todo',
      campaignId: csCase.campaignId,
      campaignName: csCase.campaignName,
      sellerName: csCase.sellerName,
      brandName: csCase.brandName,
      assigneeId: csCase.assigneeId,
      assigneeName: csCase.assigneeName,
      assigneeRole: '정산 담당자',
      dueDate: '2026-07-16',
      dueTime: '14:12',
      createdReason: '외부 고객 CS 폼 접수',
      relatedMenu: 'CS 관리',
      checklistName: `관련 CS 접수번호 ${csCase.caseNumber}`,
      relatedLink: csCase.caseNumber,
      isCsOver24h: false,
      activityLogs: [{ id: crypto.randomUUID(), at: csCase.receivedAt, message: `CS 업무가 자동 생성되었습니다. 첨부 이미지 ${imageCount}개, 영상 ${videoCount}개.` }],
    }
    this.saveWorkItems([item, ...this.listWorkItems()])
    return item
  },
  completeByCsCase(csCase: CsCase) {
    this.saveWorkItems(
      this.listWorkItems().map((item) =>
        item.id === `work-${csCase.id}` ? { ...item, status: 'completed', completedAt: csCase.completedAt } : item,
      ),
    )
  },
}
