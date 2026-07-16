import { initialCsCases } from '../mockData'
import type { CsCase } from '../types'
import { storageService } from './storageService'

const CS_KEY = 't3.cs.cases'

export const csService = {
  listCases() {
    return storageService.get<CsCase[]>(CS_KEY, initialCsCases)
  },
  saveCases(cases: CsCase[]) {
    storageService.set(CS_KEY, cases)
  },
  createCase(csCase: CsCase) {
    const cases = this.listCases()
    this.saveCases([csCase, ...cases])
    return csCase
  },
  updateCase(nextCase: CsCase) {
    const cases = this.listCases().map((item) => (item.id === nextCase.id ? nextCase : item))
    this.saveCases(cases)
    return nextCase
  },
}
