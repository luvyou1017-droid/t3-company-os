import type { WorkItem } from '../../myWork/types'
import type { SampleRequest, SampleStatus } from '../types'
import { sampleService as sharedSampleService } from '../../../shared/services/sampleService'
import { workService } from '../../../shared/services/workService'
import { notificationService } from '../../../shared/services/notificationService'

export const sampleService = {
  listSamples() {
    return sharedSampleService.getSamples()
  },
  saveSamples(samples: SampleRequest[]) {
    sharedSampleService.saveSamples(samples)
  },
  createSample(sample: SampleRequest) {
    return sharedSampleService.createSample(sample)
  },
  updateSample(nextSample: SampleRequest) {
    return sharedSampleService.updateSample(nextSample)
  },
  updateSampleStatus(sampleId: string, status: SampleStatus) {
    return sharedSampleService.updateSampleStatus(sampleId, status)
  },
  createSampleWorkItem(sample: SampleRequest, workType: WorkItem['workType']) {
    return workService.createSampleWorkItem(sample, workType)
  },
  completeSampleWork(sample: SampleRequest) {
    workService.completeBySample(sample)
  },
  createSampleNotification(sample: SampleRequest, title: string) {
    return notificationService.createSampleNotification(sample, title)
  },
}
