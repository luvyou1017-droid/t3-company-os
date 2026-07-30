import { getDataProviderMode } from '../../../shared/lib/dataProvider'
import { supabase } from '../../../shared/lib/supabase'
import { formatDateWithWeekday } from '../../../shared/services/campaignCreationService'
import { productService } from '../../productMaster/services/productService'
import type { ProductMaster } from '../../productMaster/types'
import { LocalProposalRepository } from '../repositories/LocalProposalRepository'
import { SupabaseProposalRepository } from '../repositories/SupabaseProposalRepository'
import type { ProposalRepository } from '../repositories/proposalRepository'
import type { CampaignProposalSelection, ProposalMaster, ProposalMasterInput, ProposalProductItem, SharedProposalView } from '../types'

const repository: ProposalRepository = getDataProviderMode() === 'supabase' && supabase
  ? new SupabaseProposalRepository(supabase)
  : new LocalProposalRepository()

export function createProposalProductSnapshot(product: ProductMaster, skuIds: string[] = []): ProposalProductItem {
  const selectedSkus = product.skus.filter((sku) => skuIds.includes(sku.id))
  const representativeSku = selectedSkus[0] ?? product.skus.find((sku) => sku.representative) ?? product.skus[0]
  const regularPrice = representativeSku?.regularPrice ?? product.regularPrice
  const groupBuyPrice = representativeSku?.groupBuyPrice ?? product.salePrice
  return {
    id: crypto.randomUUID(), productId: product.id, skuIds: selectedSkus.map((sku) => sku.id),
    vendorId: product.vendorId, vendorName: product.vendorName, brandId: product.brandId, brandName: product.brandName,
    productName: product.productName, imageUrl: product.representativeImageUrl ?? product.imageUrl,
    additionalImageUrls: product.additionalImageUrls, optionSummary: selectedSkus.map((sku) => sku.optionName).join(' · '),
    compositionText: selectedSkus.map((sku) => sku.optionName).join(' / '), regularPrice, groupBuyPrice,
    discountRate: regularPrice > 0 ? Math.round((1 - groupBuyPrice / regularPrice) * 100) : 0,
    sellerCommissionRate: representativeSku?.sellerCommissionRate ?? product.sellerCommissionRate,
    shippingText: product.shippingFee === 0 ? '무료배송' : `배송비 ${product.shippingFee.toLocaleString('ko-KR')}원`,
    sampleText: product.sampleAvailable ? '샘플 가능' : '샘플 협의', keyPoints: [],
    sellerDescription: product.sellerDescription, displayOrder: 0, visibleInSharedView: true, representative: false,
    sourceVersion: product.version, capturedAt: new Date().toISOString(),
    internalSnapshot: {
      supplyPrice: representativeSku?.supplyPrice ?? product.supplyPrice,
      totalCommissionRate: representativeSku?.totalCommissionRate ?? product.totalCommissionRate,
      companyCommissionRate: product.companyCommissionRate,
      brandPgSupportAvailable: representativeSku?.brandPgSupportAvailable ?? product.brandPgSupportAvailable,
      brandPgSupportRate: representativeSku?.brandPgSupportRate ?? product.brandPgSupportRate,
      wiseShopAvailable: representativeSku?.wiseShopAvailable ?? product.wiseShopAvailable,
      sellerCheckoutAvailable: representativeSku?.sellerCheckoutAvailable ?? product.sellerCheckoutAvailable,
      defaultSalesChannelType: representativeSku?.defaultSalesChannelType ?? product.defaultSalesChannelType,
      settlementMemo: product.settlementMemo, internalMemo: product.internalMemo,
    },
  }
}

export function toSharedProposalView(proposal: ProposalMaster): SharedProposalView {
  const guide = proposal.shippingGuide
  const shippingParts = [
    guide.shippingFee === 0 ? '무료배송' : guide.shippingFee !== undefined ? `기본 배송비 ${guide.shippingFee.toLocaleString('ko-KR')}원` : undefined,
    guide.freeShippingThreshold ? `${guide.freeShippingThreshold.toLocaleString('ko-KR')}원 이상 무료` : undefined,
    guide.shippingSchedule, guide.bundleShippingAvailable ? '합배송 가능' : undefined,
  ].filter(Boolean)
  return {
    id: proposal.id, companyLabel: 'WISE · T3 COMPANY', title: proposal.title,
    subtitle: proposal.subtitle, category: proposal.category,
    vendorOrBrand: proposal.brandNames.join(' · ') || proposal.vendorName,
    referenceDateLabel: formatDateWithWeekday(proposal.referenceDate),
    representativeImageUrl: proposal.representativeImageUrl,
    sellingPoints: proposal.sellingPoints.slice(0, 5),
    shippingGuide: {
      courierName: guide.courierName, shippingText: shippingParts.join(' · ') || '배송 조건 협의',
      sampleText: guide.sampleAvailable ? `샘플 가능${guide.sampleConditions ? ` · ${guide.sampleConditions}` : ''}` : '샘플 별도 협의',
      exchangeReturnNotes: guide.exchangeReturnNotes, operationNotes: guide.operationNotes,
    },
    contact: { managerName: proposal.managerName || '김병희', managerContact: proposal.managerContact },
    products: proposal.productItems.filter((item) => item.visibleInSharedView).sort((a, b) => a.displayOrder - b.displayOrder).map((item) => ({
      id: item.id, brandName: item.brandName, productName: item.displayProductName || item.productName,
      imageUrl: item.imageUrl, compositionText: item.compositionText, regularPrice: item.regularPrice,
      groupBuyPrice: item.groupBuyPrice, discountRate: item.discountRate,
      sellerCommissionRate: item.sellerCommissionRate, shippingText: item.shippingText,
      sampleText: item.sampleText, keyPoints: item.keyPoints.slice(0, 5), representative: item.representative,
    })),
  }
}

export const proposalService = {
  list: () => repository.list(),
  getById: (id: string) => repository.getById(id),
  listProductMasters: () => productService.listProducts(),
  async save(input: ProposalMasterInput) {
    const current = await repository.getById(input.id)
    const now = new Date().toISOString()
    const proposal: ProposalMaster = { ...input, createdAt: current?.createdAt ?? now, updatedAt: now, version: (current?.version ?? 0) + 1 }
    return repository.save(proposal)
  },
  async archive(id: string) {
    const current = await repository.getById(id)
    if (!current) throw new Error('제안서를 찾을 수 없습니다.')
    return repository.save({ ...current, status: 'archived', updatedAt: new Date().toISOString(), version: current.version + 1 })
  },
  async duplicate(id: string) {
    const current = await repository.getById(id)
    if (!current) throw new Error('제안서를 찾을 수 없습니다.')
    const now = new Date().toISOString()
    const copy: ProposalMaster = {
      ...structuredClone(current), id: crypto.randomUUID(), proposalName: `${current.proposalName} · 복사본`,
      status: 'draft', sourceProposalId: current.id, previewImageUrls: [], sharedImageUrls: [],
      internalBoardSharedAt: undefined, createdAt: now, updatedAt: now, version: 1,
      productItems: current.productItems.map((item) => ({ ...item, id: crypto.randomUUID(), proposalId: undefined })),
    }
    return repository.save(copy)
  },
  async getSharedView(id: string) {
    const proposal = await repository.getById(id)
    return proposal ? toSharedProposalView(proposal) : null
  },
  async listCampaignReadyProposals(): Promise<CampaignProposalSelection[]> {
    const proposals = await repository.list()
    return proposals.filter((proposal) => proposal.status === 'shareable' && proposal.campaignCreationReady).map((proposal) => ({
      proposalId: proposal.id, proposalName: proposal.proposalName, sourceVersion: proposal.version,
      products: proposal.productItems.map((item) => ({ productId: item.productId, skuIds: item.skuIds, productName: item.productName, brandName: item.brandName })),
    }))
  },
}
