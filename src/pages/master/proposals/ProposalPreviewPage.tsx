import { useEffect, useState } from 'react'
import { ProposalPreviewDocument } from '../../../features/proposalMaster/components/ProposalPreviewDocument'
import { proposalExportService } from '../../../features/proposalMaster/services/proposalExportService'
import { proposalService } from '../../../features/proposalMaster/services/proposalService'
import type { SharedProposalView } from '../../../features/proposalMaster/types'

export function ProposalPreviewPage({ proposalId, onBack }: { proposalId: string; onBack: () => void }) {
  const [proposal, setProposal] = useState<SharedProposalView | null>()
  const [notice, setNotice] = useState('')
  useEffect(() => { void proposalService.getSharedView(proposalId).then(setProposal) }, [proposalId])
  const prepare = async (type: 'png' | 'pdf') => {
    const result = type === 'png' ? await proposalExportService.exportToPng(proposalId) : await proposalExportService.exportToPdf(proposalId)
    setNotice(result.message)
  }
  if (proposal === undefined) return <div className="proposal-preview-empty">제안서를 불러오는 중입니다.</div>
  if (proposal === null) return <div className="proposal-preview-empty"><h1>제안서를 찾을 수 없습니다.</h1><button onClick={onBack}>제안서 목록</button></div>
  return <div className="proposal-preview-mode">
    <div className="proposal-preview-toolbar no-print"><button onClick={onBack}>← 내부 제안서 DB</button><div><button onClick={() => void prepare('png')}>PNG로 저장</button><button onClick={() => void prepare('pdf')}>PDF로 저장</button><button onClick={() => proposalExportService.print(proposalId)}>인쇄</button><button onClick={() => void document.documentElement.requestFullscreen?.()}>전체 화면 미리보기</button></div></div>
    {notice && <p className="proposal-export-notice no-print">{notice}</p>}
    <ProposalPreviewDocument proposal={proposal} />
  </div>
}
