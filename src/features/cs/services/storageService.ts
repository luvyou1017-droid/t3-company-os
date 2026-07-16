import { storageService as sharedStorageService } from '../../../shared/services/storageService'

export const storageService = {
  get: sharedStorageService.getItem.bind(sharedStorageService),
  set: sharedStorageService.setItem.bind(sharedStorageService),
  remove: sharedStorageService.removeItem.bind(sharedStorageService),
}
