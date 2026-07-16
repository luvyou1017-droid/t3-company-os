import type { SampleRequest } from './types'

const userIdByName: Record<string, string> = {
  허윤정: 'u-001',
  허수정: 'u-002',
  배민성: 'u-003',
  유시철: 'u-004',
  김병희: 'u-005',
}

const log = (action: string) => [
  { id: crypto.randomUUID(), at: '2026.07.15 09:00', actor: 'system', action, memo: 'mock 데이터 생성' },
]

export const initialSamples: SampleRequest[] = [
  ['s-001','SCH-001','한나 × 머즈캐리어 3차','한나','머즈캐리어','롤링 토트백','블랙',1,'2026-07-01','유시철','허윤정','허수정','브랜드사 링크','유상','회사',19900,0,'배송 중','배송 중',true,'2026-07-25',false],
  ['s-002','SCH-001','한나 × 머즈캐리어 3차','한나','머즈캐리어','롤링 토트백','실버',1,'2026-07-02','허윤정','허윤정','허수정','발주 프로그램','무상','브랜드사',0,0,'수령 완료','수령 완료',false,'',false],
  ['s-003','SCH-002','스탠다드푸드 뼈용이×전진단','전진단','스탠다드푸드','뼈용이 건강식','기본',3,'2026-07-03','유시철','김병희','김병희','카카오톡 요청','유상','셀러',45000,3000,'발주 대기','발주 대기',false,'',false],
  ['s-004','SCH-003','셀러A×브랜드B','셀러A','브랜드B','이너뷰티 세트','2주분',2,'2026-07-04','김병희','김병희','허수정','직접 구매','유상','미정',32000,3000,'승인 대기','승인 대기',false,'',false],
  ['s-005','SCH-004','주방용품 공동구매','키친온','Maison Cook','조리도구 세트','A세트',1,'2026-07-05','허윤정','박지훈','박지훈','브랜드사 링크','무상','브랜드사',0,0,'회수 예정','회수 예정',true,'2026-07-12',false],
  ['s-006','SCH-005','건강식품 공동구매','헬시윤','Fit Table','단백질 쉐이크','초코',2,'2026-07-06','정다은','허윤정','허수정','발주 프로그램','유상','회사',56000,0,'정산 반영 대기','정산 반영 대기',false,'',false],
  ['s-007','SCH-006','여름 스킨케어 집중 공구','뷰티하린','Lumi Skin','수분 크림','본품',2,'2026-07-07','김민서','최유진','최유진','기타','유상','셀러',38000,2500,'완료','완료',false,'',true],
  ['s-008','SCH-007','홈트 소도구 스타터 세트','운동하는민지','Move Lab','밴드 세트','라이트',1,'2026-07-08','한유리','허윤정','김병희','직접 구매','유상','매니저',18000,3000,'취소','취소',false,'',false],
  ['s-009','SCH-008','베이비 케어 정기 공구','마미노트','Tiny Haus','바디워시','무향',4,'2026-07-09','정다은','윤태호','허수정','브랜드사 링크','무상','브랜드사',0,0,'발주 완료','발주 완료',false,'',false],
  ['s-010','SCH-009','프리미엄 침구 공동구매','라이프지수','Soft Room','냉감 침구','퀸',1,'2026-07-10','김민서','허윤정','허수정','발주 프로그램','유상','브랜드사',79000,0,'수령 완료','수령 완료',true,'2026-07-20',false],
  ['s-011','SCH-010','반려동물 간식 공동구매','댕댕리뷰','Pet Better','동결건조 간식','닭가슴살',5,'2026-07-11','한유리','오세린','오세린','카카오톡 요청','무상','브랜드사',0,0,'요청 접수','요청 접수',false,'',false],
  ['s-012','SCH-011','리빙 수납 박스 공동구매','정리하는수연','Neat Home','모듈 수납 박스','화이트',2,'2026-07-12','정다은','박지훈','박지훈','브랜드사 링크','유상','회사',24000,3000,'배송 중','배송 중',true,'2026-07-28',false],
  ['s-013','SCH-012','가을 아우터 프리오더','옷장유나','Mode Atelier','트렌치 코트','M',1,'2026-07-13','유시철','최유진','유시철','기타','유상','미정',99000,0,'정산 반영 대기','정산 반영 대기',false,'',false],
  ['s-014','SCH-001','한나 × 머즈캐리어 3차','한나','머즈캐리어','롤링 토트백','블랙',1,'2026-07-14','허윤정','허윤정','허수정','발주 프로그램','무상','브랜드사',0,0,'회수 완료','회수 완료',true,'2026-07-14',false],
  ['s-015','SCH-002','스탠다드푸드 뼈용이×전진단','전진단','스탠다드푸드','전진단 세트','기본',1,'2026-07-15','유시철','김병희','허수정','직접 구매','유상','셀러',22000,3000,'발주 대기','발주 대기',false,'',false],
].map((row) => {
  const [id,campaignId,campaignName,sellerName,brandName,productName,optionName,quantity,requestedAt,requestedBy,managerName,orderManagerName,orderMethod,paymentType,costOwner,sampleCost,shippingCost,deliveryStatus,status,returnRequired,returnDueDate,settlementReflected] = row
  return {
    id,campaignId,campaignName,sellerName,brandName,productName,optionName,quantity,requestedAt,requestedBy,managerId: userIdByName[String(managerName)] ?? `manager-${campaignId}`, managerName,orderManagerId: userIdByName[String(orderManagerName)] ?? `order-manager-${campaignId}`, orderManagerName,orderMethod,paymentType,costOwner,sampleCost,shippingCost,deliveryStatus,status,returnRequired,returnDueDate: returnDueDate || undefined, settlementReflected, settlementAmount: paymentType === '유상' ? Number(sampleCost) + Number(shippingCost) : 0, memo: '', attachments: [], activityLogs: log('샘플 요청 생성'),
    trackingNumber: status === '배송 중' ? 'MOCK-TRACK-001' : undefined,
    shippedAt: ['배송 중','수령 완료','회수 예정','회수 완료','정산 반영 대기','완료'].includes(String(status)) ? '2026-07-14' : undefined,
    receivedAt: ['수령 완료','회수 예정','회수 완료','정산 반영 대기','완료'].includes(String(status)) ? '2026-07-15' : undefined,
    returnedAt: status === '회수 완료' ? '2026-07-15' : undefined,
  } as SampleRequest
})
