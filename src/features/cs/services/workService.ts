import type { WorkItem } from '../../myWork/types'
import type { CsCase } from '../types'
import { workService as sharedWorkService } from '../../../shared/services/workService'

export const workService = {
  listWorkItems() {
    return sharedWorkService.getWorkItems()
  },
  saveWorkItems(items: WorkItem[]) {
    sharedWorkService.saveWorkItems(items)
  },
  createCsWorkItem(csCase: CsCase) {
    return sharedWorkService.createCsWorkItem(csCase)
  },
  completeByCsCase(csCase: CsCase) {
    sharedWorkService.completeByCsCase(csCase)
  },
}
