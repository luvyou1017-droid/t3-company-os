import { STORAGE_KEYS } from '../services/storageService'

const LEGACY_SAMPLE_IDS = new Set(Array.from({ length: 15 }, (_, index) => `s-${String(index + 1).padStart(3, '0')}`))
const LEGACY_CS_IDS = new Set(['cs-seed-001'])

type Identified = { id?: unknown; sourceType?: unknown; sourceId?: unknown; relatedType?: unknown; relatedId?: unknown; csCaseId?: unknown }

export function isLegacySampleFixture(value: Identified) {
  return typeof value.id === 'string' && LEGACY_SAMPLE_IDS.has(value.id)
}

export function isLegacyCsFixture(value: Identified) {
  return typeof value.id === 'string' && LEGACY_CS_IDS.has(value.id)
}

export function removeLegacyFixtures(key: string, value: unknown): unknown {
  if (!Array.isArray(value)) return value
  if (key === STORAGE_KEYS.samples) return value.filter((item) => !isLegacySampleFixture(item as Identified))
  if (key === STORAGE_KEYS.csCases) return value.filter((item) => !isLegacyCsFixture(item as Identified))
  if (key === STORAGE_KEYS.workItems) {
    return value.filter((item) => {
      const work = item as Identified
      return !((work.sourceType === 'sample' && typeof work.sourceId === 'string' && LEGACY_SAMPLE_IDS.has(work.sourceId)) ||
        (work.sourceType === 'cs' && typeof work.sourceId === 'string' && LEGACY_CS_IDS.has(work.sourceId)))
    })
  }
  if (key === STORAGE_KEYS.notifications) {
    return value.filter((item) => {
      const notification = item as Identified
      const relatedId = typeof notification.relatedId === 'string' ? notification.relatedId : ''
      const csCaseId = typeof notification.csCaseId === 'string' ? notification.csCaseId : ''
      return !LEGACY_SAMPLE_IDS.has(relatedId) && !LEGACY_SAMPLE_IDS.has(csCaseId) && !LEGACY_CS_IDS.has(relatedId) && !LEGACY_CS_IDS.has(csCaseId)
    })
  }
  return value
}
