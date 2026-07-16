import type { CsCase } from '../../../features/cs/types'

export function createBrandMessage(csCase: CsCase) {
  return `안녕하세요.\n\n아래 CS 건 확인 요청드립니다.\n\n공동구매:\n${csCase.campaignName}\n\n상품:\n${csCase.productName}\n\n옵션:\n${csCase.optionName}\n\n문의 유형:\n${csCase.csType}\n\n문의 내용:\n${csCase.description}\n\n첨부:\n이미지 ${csCase.attachments.filter((item) => item.fileType === 'image').length}개, 영상 ${csCase.attachments.filter((item) => item.fileType === 'video').length}개\n\n재출고 가능 여부와 예상 출고일 확인 부탁드립니다.`
}

export function createCustomerMessage() {
  return `안녕하세요, 고객님.\n\n접수해주신 내용을 브랜드사에 전달하여 확인 중입니다.\n첨부해주신 사진도 함께 전달했습니다.\n\n답변이 확인되는 대로 다시 안내드리겠습니다.\n불편을 드려 죄송합니다.`
}
