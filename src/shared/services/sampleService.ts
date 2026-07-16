import { initialSamples } from '../../features/samples/mockData'
import type { SampleRequest, SampleStatus } from '../../features/samples/types'
import { notificationService } from './notificationService'
import { STORAGE_KEYS, storageService } from './storageService'
import { workService } from './workService'

export const sampleService = {
  getSamples() {
    return storageService.getItem<SampleRequest[]>(STORAGE_KEYS.samples, initialSamples)
  },
  saveSamples(samples: SampleRequest[]) {
    storageService.setItem(STORAGE_KEYS.samples, samples)
  },
  getSamplesByCampaignId(campaignId: string) {
    return this.getSamples().filter((sample) => sample.campaignId === campaignId)
  },
  createSample(sample: SampleRequest) {
    this.saveSamples([sample, ...this.getSamples().filter((item) => item.id !== sample.id)])
    workService.syncWorkItemFromSource('sample', sample, '샘플 발주')
    notificationService.createSampleNotification(sample, '신규 샘플 요청')
    return sample
  },
  updateSample(nextSample: SampleRequest) {
    this.saveSamples(this.getSamples().map((item) => (item.id === nextSample.id ? nextSample : item)))
    if (nextSample.status === '발주 완료') workService.completeBySample(nextSample)
    if (nextSample.status === '정산 반영 대기') workService.syncWorkItemFromSource('sample', nextSample, '정산서 검토')
    return nextSample
  },
  updateSampleStatus(sampleId: string, status: SampleStatus) {
    const sample = this.getSamples().find((item) => item.id === sampleId)
    if (!sample) return undefined
    return this.updateSample({ ...sample, status })
  },
}
