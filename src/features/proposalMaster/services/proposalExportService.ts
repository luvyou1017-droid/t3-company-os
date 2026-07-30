import type { ProposalExportService } from '../types'

export const proposalExportService: ProposalExportService = {
  async exportToPng() { return { success: false, message: 'PNG 내보내기 기능 준비 중입니다.' } },
  async exportToPdf() { return { success: false, message: 'PDF 내보내기 기능 준비 중입니다.' } },
  print() { window.print() },
}
