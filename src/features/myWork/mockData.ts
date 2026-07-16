import type { DailyBriefing, WorkItem, WorkUser } from './types'

export const workUsers: WorkUser[] = [
  { id: 'u-001', name: '허윤정', role: '대표' },
  { id: 'u-002', name: '허수정', role: '정산 담당자' },
  { id: 'u-003', name: '배민성', role: '팀장' },
  { id: 'u-004', name: '유시철', role: 'MD' },
  { id: 'u-005', name: '김병희', role: '매니저' },
]

const log = (message: string) => [{ id: crypto.randomUUID(), at: '2026-07-15 09:10', message }]

export const workItems: WorkItem[] = [
  ['w-001','머즈캐리어 공동구매 링크 최종 검수','링크 가격과 옵션을 최종 확인합니다.','링크 검수','u-001','허윤정','대표','2026-07-15','14:00','한나 × 머즈캐리어 3차','한나','머즈캐리어','내일 오픈 예정이며 판매가 확인이 남아 있습니다.','링크 검수','가격 검수','https://example.com/murz',true,false,true,false,false],
  ['w-002','지급 승인 대기 3건 확인','대표 승인 대기 지급 건을 확인합니다.','지급 승인','u-001','허윤정','대표','2026-07-15','13:00','프리미엄 침구 공동구매','라이프지수','Soft Room','지급 승인 대기 건이 누적되었습니다.','지급','지급 승인','https://example.com/payout',false,false,false,false,false],
  ['w-003','정산 지연 캠페인 확인','정산 지연 사유를 확인합니다.','회사 수익 확인','u-001','허윤정','대표','2026-07-14','18:00','건강식품 공동구매','헬시윤','Fit Table','정산 지연이 발생했습니다.','정산','정산 지연','https://example.com/settlement',false,false,false,true,false],
  ['w-004','예외 수수료 승인','수수료 예외 조건을 승인합니다.','예외 승인','u-001','허윤정','대표','2026-07-16','10:00','셀러A×브랜드B','셀러A','브랜드B','MD가 예외 승인을 요청했습니다.','정산','예외 승인','https://example.com/approve',false,false,false,false,false],
  ['w-005','전체 운영 지연 리포트 확인','팀별 지연 업무를 확인합니다.','회사 수익 확인','u-001','허윤정','대표','2026-07-15','17:30','전체 운영','-','T3','주간 운영 리스크 확인이 필요합니다.','Dashboard','운영 리포트','https://example.com/report',false,false,false,false,false],
  ['w-006','회사 수익 현황 확인','이번 주 예상 수익을 확인합니다.','회사 수익 확인','u-001','허윤정','대표','2026-07-18','11:00','전체 정산','-','T3','대표 주간 확인 항목입니다.','Dashboard','수익 확인','https://example.com/revenue',false,false,false,false,false],
  ['w-007','링크 오류 긴급 승인','링크 수정 후 재검수 승인합니다.','예외 승인','u-001','허윤정','대표','2026-07-15','10:00','반려동물 간식 공동구매','댕댕리뷰','Pet Better','링크 오류가 보고되었습니다.','링크 검수','링크 오류','https://example.com/link-error',true,false,false,false,false],
  ['w-008','판매 데이터 확인','브랜드 전달 판매 데이터를 확인합니다.','판매 데이터 요청','u-002','허수정','정산 담당자','2026-07-15','12:00','주방용품 공동구매','키친온','Maison Cook','정산 전 판매 데이터 확인이 필요합니다.','판매 데이터','판매 데이터','https://example.com/sales-data',false,false,false,false,false],
  ['w-009','업체 정산서 작성','업체 정산 내역을 작성합니다.','정산서 작성','u-002','허수정','정산 담당자','2026-07-15','15:00','건강식품 공동구매','헬시윤','Fit Table','업체 정산 단계에 진입했습니다.','정산','정산서','https://example.com/doc',false,false,false,true,false],
  ['w-010','세금계산서 발행','증빙 기준으로 세금계산서를 발행합니다.','세금계산서 발행','u-002','허수정','정산 담당자','2026-07-14','16:00','여름 스킨케어 집중 공구','뷰티하린','Lumi Skin','발행 예정일을 초과했습니다.','세무','세금계산서','https://example.com/tax',false,false,false,true,false],
  ['w-011','셀러 증빙 확인','셀러 지급 전 증빙을 확인합니다.','셀러 증빙 확인','u-002','허수정','정산 담당자','2026-07-15','17:00','홈트 소도구 스타터 세트','운동하는민지','Move Lab','지급 준비 전 증빙 확인이 필요합니다.','정산','증빙','https://example.com/evidence',false,false,false,false,false],
  ['w-012','매니저 지급 준비','매니저 지급 대상 금액을 확인합니다.','매니저 지급','u-002','허수정','정산 담당자','2026-07-17','11:00','베이비 케어 정기 공구','마미노트','Tiny Haus','매니저 지급 준비일입니다.','지급','매니저 지급','https://example.com/manager-pay',false,false,false,false,false],
  ['w-013','당사 링크 CS 처리','당사 링크로 접수된 CS를 처리합니다.','CS 답변','u-002','허수정','정산 담당자','2026-07-15','09:30','반려동물 간식 공동구매','댕댕리뷰','Pet Better','CS가 24시간 이상 대기 중입니다.','CS','CS 처리','https://example.com/cs',false,false,false,false,true],
  ['w-014','담당자 없는 업무 배정','미배정 링크 요청 업무를 배정합니다.','일정 충돌 확인','u-003','배민성','팀장','2026-07-15','12:30','리빙 수납 박스 공동구매','정리하는수연','Neat Home','담당자 없는 업무가 생성되었습니다.','공동구매 일정','업무 배정','https://example.com/assign',false,false,false,false,false],
  ['w-015','매니저별 지연 업무 확인','매니저별 지연 건수를 확인합니다.','일정 충돌 확인','u-003','배민성','팀장','2026-07-14','19:00','팀 운영','-','T3','지연 업무가 누적되었습니다.','Dashboard','지연 업무','https://example.com/team',false,false,false,false,false],
  ['w-016','일정 충돌 확인','동일 셀러 일정 충돌을 확인합니다.','일정 충돌 확인','u-003','배민성','팀장','2026-07-16','15:00','가을 아우터 프리오더','옷장유나','Mode Atelier','일정 충돌 가능성이 있습니다.','공동구매 일정','일정 충돌','https://example.com/conflict',false,false,false,false,false],
  ['w-017','브랜드 링크 요청','브랜드사에 판매 링크 생성을 요청합니다.','링크 요청','u-004','유시철','MD','2026-07-15','16:00','리빙 수납 박스 공동구매','정리하는수연','Neat Home','오픈 전 링크 요청이 필요합니다.','링크 요청','링크 요청','https://example.com/request',false,false,false,false,false],
  ['w-018','브랜드 답변 확인','브랜드 답변 누락을 확인합니다.','링크 요청','u-004','유시철','MD','2026-07-14','15:00','가을 아우터 프리오더','옷장유나','Mode Atelier','브랜드 답변이 지연되었습니다.','링크 요청','브랜드 답변','https://example.com/brand-reply',false,false,false,false,false],
  ['w-019','링크 수정 요청','가격 오류 링크 수정을 요청합니다.','링크 요청','u-004','유시철','MD','2026-07-15','11:30','머즈캐리어 공동구매','한나','머즈캐리어','가격 오류가 확인되었습니다.','링크 검수','가격 오류','https://example.com/price',false,true,false,false,false],
  ['w-020','제안서 작성','신규 공구 제안서를 작성합니다.','판매 데이터 요청','u-004','유시철','MD','2026-07-18','18:00','신규 뷰티 공구','뷰티셀러','New Beauty','신규 제안서 작성 요청입니다.','제안서','제안서','https://example.com/proposal',false,false,false,false,false],
  ['w-021','10시 매출 전달','셀러에게 10시 매출을 전달합니다.','10시 매출 전달','u-005','김병희','매니저','2026-07-15','10:00','한나 × 머즈캐리어 3차','한나','머즈캐리어','D-DAY 매출 전달 업무입니다.','판매 진행','매출 전달','https://example.com/sales-10',false,false,true,false,false],
  ['w-022','17시 매출 전달','셀러에게 17시 매출을 전달합니다.','17시 매출 전달','u-005','김병희','매니저','2026-07-15','17:00','한나 × 머즈캐리어 3차','한나','머즈캐리어','D-DAY 매출 전달 업무입니다.','판매 진행','매출 전달','https://example.com/sales-17',false,false,true,false,false],
  ['w-023','CS 확인','24시간 이상 미처리 CS를 확인합니다.','CS 답변','u-005','김병희','매니저','2026-07-15','13:30','반려동물 간식 공동구매','댕댕리뷰','Pet Better','CS가 24시간 이상 미처리되었습니다.','CS','CS 확인','https://example.com/cs-manager',false,false,false,false,true],
  ['w-024','샘플 발주 확인','샘플 발주 상태를 확인합니다.','샘플 발주','u-005','김병희','매니저','2026-07-16','11:00','리빙 수납 박스 공동구매','정리하는수연','Neat Home','샘플 발주가 남아 있습니다.','샘플','샘플 발주','https://example.com/sample',false,false,false,false,false],
  ['w-025','최저가 확인 완료','쿠팡 최저가를 확인했습니다.','최저가 확인','u-005','김병희','매니저','2026-07-15','09:00','한나 × 머즈캐리어 3차','한나','머즈캐리어','오픈 전 최저가 확인 업무입니다.','판매 진행','최저가 확인','https://example.com/lowest',false,false,true,false,false],
  ['w-026','정산서 검토','셀러 정산서 초안을 검토합니다.','정산서 검토','u-005','김병희','매니저','2026-07-17','16:00','건강식품 공동구매','헬시윤','Fit Table','셀러 커뮤니케이션 전 검토 필요합니다.','정산','정산서 검토','https://example.com/review',false,false,false,true,false],
].map((row) => {
  const [id,title,description,workType,assigneeId,assigneeName,assigneeRole,dueDate,dueTime,campaignName,sellerName,brandName,createdReason,relatedMenu,checklistName,relatedLink,hasLinkError,hasPriceError,isDdayCampaign,isSettlementDelayed,isCsOver24h] = row
  const completed = id === 'w-025'
  return {
    id, title, description, workType, status: completed ? 'completed' : 'todo',
    campaignId: `CP-${id}`, campaignName, sellerName, brandName, assigneeId, assigneeName,
    assigneeRole, dueDate, dueTime, completedAt: completed ? '2026-07-15 09:20' : undefined,
    createdReason, relatedMenu, checklistName, relatedLink, hasLinkError, hasPriceError,
    isDdayCampaign, isSettlementDelayed, isCsOver24h, activityLogs: log('업무가 생성되었습니다.'),
  } as WorkItem
})

export const dailyBriefings: DailyBriefing[] = [
  { userId: 'u-001', message: '안녕하세요, 허윤정님.\n\n오늘 가장 먼저 확인할 업무는 “머즈캐리어 링크 최종 검수”입니다.\n오늘 14시까지 완료해야 하며, 이후 17시 매출 전달 업무가 있습니다.\n\n지급 승인 대기 3건, 정산 지연 1건이 있습니다.' },
  { userId: 'u-002', message: '안녕하세요, 허수정님.\n\n판매 데이터 확인과 세금계산서 발행 지연 건을 먼저 처리하세요.\n정산 지연 업무 2건이 오늘 우선순위입니다.' },
  { userId: 'u-003', message: '안녕하세요, 배민성님.\n\n담당자 없는 업무 배정과 매니저별 지연 업무 확인이 필요합니다.\n이번 주 일정 충돌 가능성도 확인하세요.' },
  { userId: 'u-004', message: '안녕하세요, 유시철님.\n\n브랜드 링크 요청과 가격 오류 수정 요청을 먼저 처리하세요.\n신규 제안서 작성은 이번 주 예정 업무입니다.' },
  { userId: 'u-005', message: '안녕하세요, 김병희님.\n\n오늘은 머즈캐리어 D-DAY 업무가 중심입니다.\n10시/17시 매출 전달과 24시간 이상 미처리 CS를 먼저 확인하세요.' },
]
