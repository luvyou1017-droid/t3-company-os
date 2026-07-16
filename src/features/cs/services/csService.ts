import type { CsCase } from '../types'
import { csService as sharedCsService } from '../../../shared/services/csService'

export const csService = {
  listCases() {
    return sharedCsService.getCsCases()
  },
  saveCases(cases: CsCase[]) {
    sharedCsService.saveCsCases(cases)
  },
  createCase(csCase: CsCase) {
    return sharedCsService.createCsCase(csCase)
  },
  updateCase(nextCase: CsCase) {
    return sharedCsService.updateCsCase(nextCase)
  },
  getCasesByCampaignId(campaignId: string) {
    return sharedCsService.getCsCasesByCampaignId(campaignId)
  },
}
