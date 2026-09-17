import type { CsCampaign, CsCase } from './types'
import { campaigns } from '../../shared/data/campaigns'

export const csCampaigns: CsCampaign[] = campaigns.map((campaign) => ({
  campaignId: campaign.id,
  campaignCode: campaign.campaignCode,
  campaignName: campaign.campaignName,
  sellerName: campaign.sellerName,
  brandName: campaign.brandName,
  productName: campaign.productName,
  period: [campaign.startDate, campaign.endDate].filter(Boolean).join(' ~ '),
  supportCompany: campaign.supportCompany ?? 'T3 Company',
  linkOwner: campaign.linkOwner,
  managerName: campaign.managerName,
}))

export const initialCsCases: CsCase[] = [
  {
    id: 'cs-seed-001',
    caseNumber: 'CS-2026-000127',
    campaignId: 'SCH-001',
    campaignCode: 'CAMPAIGN-2026-001',
    campaignName: '한나 × 머즈캐리어 3차',
    sellerName: '한나',
    brandName: '머즈캐리어',
    productName: '롤링 토트백',
    customerName: '테스트고객',
    customerPhone: '010-1234-5678',
    optionName: '블랙',
    quantity: '1',
    csType: '배송 누락',
    desiredResolution: '재발송',
    description: '상품 1개가 누락되었습니다.',
    source: 'direct-form',
    status: '신규',
    priority: 'high',
    assigneeId: 'u-002',
    assigneeName: '허수정',
    receivedAt: '2026.07.15 10:20',
    dueAt: '2026.07.16 10:20',
    privacyConsent: true,
    attachments: [],
    activityLogs: [
      {
        id: 'log-seed-001',
        at: '2026.07.15 10:20',
        actor: 'system',
        action: 'CS 접수',
        memo: '초기 mock CS가 등록되었습니다.',
      },
    ],
  },
]
