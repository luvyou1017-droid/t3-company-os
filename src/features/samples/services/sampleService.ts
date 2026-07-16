import { notificationService } from '../../cs/services/notificationService'
import { storageService } from '../../cs/services/storageService'
import { workService } from '../../cs/services/workService'
import type { WorkItem } from '../../myWork/types'
import { initialSamples } from '../mockData'
import type { SampleRequest } from '../types'

const SAMPLE_KEY = 't3.samples'

function assigneeId(name: string) {
  if (name === '허수정') return 'u-002'
  if (name === '배민성') return 'u-003'
  if (name === '유시철') return 'u-004'
  if (name === '김병희') return 'u-005'
  return 'u-001'
}

export const sampleService = {
  listSamples() {
    return storageService.get<SampleRequest[]>(SAMPLE_KEY, initialSamples)
  },
  saveSamples(samples: SampleRequest[]) {
    storageService.set(SAMPLE_KEY, samples)
  },
  createSample(sample: SampleRequest) {
    this.saveSamples([sample, ...this.listSamples()])
    this.createSampleWorkItem(sample, '샘플 발주')
    this.createSampleNotification(sample, '신규 샘플 요청')
    return sample
  },
  updateSample(nextSample: SampleRequest) {
    this.saveSamples(this.listSamples().map((item) => (item.id === nextSample.id ? nextSample : item)))
    if (nextSample.status === '발주 완료') this.completeSampleWork(nextSample)
    if (nextSample.status === '정산 반영 대기') this.createSampleWorkItem(nextSample, '정산서 검토')
    return nextSample
  },
  createSampleWorkItem(sample: SampleRequest, workType: WorkItem['workType']) {
    const item: WorkItem = {
      id: `sample-work-${sample.id}-${workType}`,
      title: workType === '샘플 회수' ? `[샘플 회수] ${sample.campaignName}` : workType === '정산서 검토' ? '[정산 반영] 유상 샘플 비용 확인' : `[샘플 발주] ${sample.brandName} ${sample.productName}`,
      description: sample.memo || '샘플 관련 업무입니다.',
      workType,
      status: 'todo',
      campaignId: sample.campaignId,
      campaignName: sample.campaignName,
      sellerName: sample.sellerName,
      brandName: sample.brandName,
      assigneeId: workType === '정산서 검토' ? 'u-002' : assigneeId(sample.orderManagerName),
      assigneeName: workType === '정산서 검토' ? '허수정' : sample.orderManagerName,
      assigneeRole: workType === '정산서 검토' ? '정산 담당자' : '매니저',
      dueDate: sample.returnDueDate || '2026-07-16',
      dueTime: '18:00',
      createdReason: workType === '샘플 회수' ? '회수 예정일 3일 전' : workType === '정산서 검토' ? '유상 샘플 정산 반영 필요' : '신규 샘플 요청',
      relatedMenu: '샘플 관리',
      checklistName: `관련 sampleRequestId ${sample.id}`,
      relatedLink: sample.id,
      activityLogs: [{ id: crypto.randomUUID(), at: '2026.07.15 14:30', message: '샘플 업무가 자동 생성되었습니다.' }],
    }
    workService.saveWorkItems([item, ...workService.listWorkItems().filter((work) => work.id !== item.id)])
  },
  completeSampleWork(sample: SampleRequest) {
    workService.saveWorkItems(workService.listWorkItems().map((item) => item.id === `sample-work-${sample.id}-샘플 발주` ? { ...item, status: 'completed' as const, completedAt: '2026.07.15 14:30' } : item))
  },
  createSampleNotification(sample: SampleRequest, title: string) {
    const notifications = notificationService.list()
    storageService.set('t3.notifications', [{
      id: crypto.randomUUID(),
      recipientId: assigneeId(sample.orderManagerName),
      recipientName: sample.orderManagerName,
      csCaseId: sample.id,
      caseNumber: sample.id,
      title,
      message: `공동구매: ${sample.campaignName}\n상품: ${sample.productName}\n상태: ${sample.status}`,
      createdAt: '2026.07.15 14:30',
      read: false,
    }, ...notifications])
  },
}
