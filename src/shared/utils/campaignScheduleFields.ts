import type { Campaign } from '../types/campaign'

export type ScheduleDisplayFields = { linkOpenTime: string; linkCloseTime: string; winnerAnnouncementDate: string }
export const scheduleDisplayFields = (campaign: Campaign): ScheduleDisplayFields => ({ linkOpenTime: campaign.linkOpenTime ?? '', linkCloseTime: campaign.linkCloseTime ?? '', winnerAnnouncementDate: campaign.winnerAnnouncementDate ?? '' })
export function applyScheduleDisplayFields(campaign: Campaign, fields: ScheduleDisplayFields): Campaign {
  if ((['linkOpenTime', 'linkCloseTime'] as const).some(key => fields[key] !== (campaign[key] ?? '') && fields[key] && !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(fields[key]))) throw new Error('링크 시간을 확인해주세요.')
  if (fields.winnerAnnouncementDate && !/^\d{4}-\d{2}-\d{2}$/.test(fields.winnerAnnouncementDate)) throw new Error('당첨자 발표일을 확인해주세요.')
  return { ...campaign, ...fields, winnerAnnouncementDateOverride: campaign.winnerAnnouncementDate !== fields.winnerAnnouncementDate ? true : campaign.winnerAnnouncementDateOverride }
}
