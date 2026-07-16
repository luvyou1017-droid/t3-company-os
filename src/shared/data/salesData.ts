import { campaigns } from './campaigns'
import type { SalesDataImport, SalesDataRow } from '../types/salesData'
import { calculateSalesRow } from '../utils/salesData'

const campaign = (id: string) => campaigns.find((item) => item.id === id) ?? campaigns[0]

const importSeed = (
  id: string,
  campaignId: string,
  fileName: string,
  sourceType: SalesDataImport['sourceType'],
  reviewStatus: SalesDataImport['reviewStatus'],
  settlementStatus: SalesDataImport['settlementStatus'],
  totalQuantity: number,
  totalSalesAmount: number,
  extra: Partial<SalesDataImport> = {},
): SalesDataImport => {
  const targetCampaign = campaign(campaignId)
  return {
    id,
    campaignId,
    fileName,
    fileSize: fileName ? 482_000 : 0,
    sourceType,
    uploadedBy: extra.uploadedBy ?? '허수정',
    uploadedAt: extra.uploadedAt ?? (fileName ? '2026-07-15 10:30' : ''),
    reviewStatus,
    settlementStatus,
    confirmedAt: extra.confirmedAt,
    confirmedBy: extra.confirmedBy,
    totalQuantity,
    totalSalesAmount,
    notes: extra.notes ?? '',
    uploadedProductName: extra.uploadedProductName ?? targetCampaign.productName,
    salesStartDate: extra.salesStartDate ?? targetCampaign.startDate,
    salesEndDate: extra.salesEndDate ?? targetCampaign.endDate,
    reviewerId: extra.reviewerId ?? 'u-002',
    reviewerName: extra.reviewerName ?? '허수정',
    commissionRate: extra.commissionRate ?? 17,
    sampleDeductionAmount: extra.sampleDeductionAmount ?? 0,
    eventDeductionAmount: extra.eventDeductionAmount ?? 0,
  }
}

const row = (
  id: string,
  salesDataImportId: string,
  campaignId: string,
  optionName: string,
  quantity: number,
  unitPrice: number,
  canceledQuantity = 0,
  refundedQuantity = 0,
): SalesDataRow => calculateSalesRow({ id, salesDataImportId, campaignId, optionName, quantity, unitPrice, canceledQuantity, refundedQuantity })

export const initialSalesDataImports: SalesDataImport[] = [
  importSeed('sales-001', 'SCH-001', 'murz-carrier-3rd-sales.xlsx', 'file', '업로드 완료', '정산 전', 193, 3_840_700, { uploadedAt: '2026-07-16 10:30', sampleDeductionAmount: 19_900, eventDeductionAmount: 50_000 }),
  importSeed('sales-002', 'SCH-002', 'standardfood-sales.csv', 'file', '검수 중', '정산 전', 88, 3_960_000, { uploadedAt: '2026-07-16 09:40' }),
  importSeed('sales-003', 'SCH-003', 'brandb-final.xlsx', 'file', '오류 확인 필요', '정산 전', 67, 2_010_000, { uploadedProductName: '다른 상품명', salesStartDate: '2026-07-11', notes: '상품명과 기간 확인 필요' }),
  importSeed('sales-004', 'SCH-004', 'maison-cook-sales.xlsx', 'file', '확정 완료', '정산 가능', 43, 3_225_000, { confirmedAt: '2026-07-15 13:10', confirmedBy: '허수정', sampleDeductionAmount: 0 }),
  importSeed('sales-005', 'SCH-005', 'fit-table-manual', 'manual', '확정 완료', '정산 생성됨', 112, 3_136_000, { confirmedAt: '2026-07-14 17:20', confirmedBy: '허수정', sampleDeductionAmount: 56_000 }),
  importSeed('sales-006', 'SCH-006', 'lumi-skin-sales.xlsx', 'file', '확정 완료', '정산 완료', 240, 9_120_000, { confirmedAt: '2026-07-04 11:30', confirmedBy: '허수정' }),
  importSeed('sales-007', 'SCH-007', 'move-lab-sales.csv', 'file', '업로드 완료', '정산 전', 55, 990_000, { uploadedAt: '2026-07-16 11:50' }),
  importSeed('sales-008', 'SCH-008', '', 'brand-email', '업로드 대기', '정산 전', 0, 0, { uploadedBy: '', uploadedAt: '', notes: '브랜드사 파일 수신 대기' }),
  importSeed('sales-009', 'SCH-009', 'soft-room-sales.xlsx', 'file', '확정 완료', '정산 가능', 31, 2_449_000, { confirmedAt: '2026-07-16 08:50', confirmedBy: '허수정' }),
  importSeed('sales-010', 'SCH-010', '', 'manual', '업로드 대기', '정산 전', 0, 0, { uploadedBy: '', uploadedAt: '', notes: '오픈 후 수기 입력 예정' }),
]

export const initialSalesDataRows: SalesDataRow[] = [
  row('sales-row-001', 'sales-001', 'SCH-001', '블랙', 119, 19_900),
  row('sales-row-002', 'sales-001', 'SCH-001', '실버', 74, 19_900),
  row('sales-row-003', 'sales-002', 'SCH-002', '기본', 60, 45_000, 2, 1),
  row('sales-row-004', 'sales-002', 'SCH-002', '선물세트', 28, 45_000),
  row('sales-row-005', 'sales-003', 'SCH-003', '2주분', 70, 30_000, 1, 2),
  row('sales-row-006', 'sales-004', 'SCH-004', 'A세트', 25, 75_000),
  row('sales-row-007', 'sales-004', 'SCH-004', 'B세트', 18, 75_000),
  row('sales-row-008', 'sales-005', 'SCH-005', '초코', 70, 28_000, 3, 1),
  row('sales-row-009', 'sales-005', 'SCH-005', '바닐라', 42, 28_000),
  row('sales-row-010', 'sales-006', 'SCH-006', '수분 크림 세트', 240, 38_000, 5, 3),
  row('sales-row-011', 'sales-007', 'SCH-007', '라이트', 55, 18_000),
  row('sales-row-012', 'sales-009', 'SCH-009', '퀸', 31, 79_000),
]
