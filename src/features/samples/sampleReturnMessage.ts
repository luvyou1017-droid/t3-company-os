import type { SampleOrder } from './sampleOrderModel'
import { itemLoanOrder, sampleItems } from './sampleProvision'

export function sampleReturnMessage(order: SampleOrder) {
  if (order.status === '취소') return ''
  const items = sampleItems(order).filter(item => {
    const view = itemLoanOrder(order, item.itemId)
    const status = view.operations?.loanStatus ?? '대여 요청'
    return item.provision?.method === '대여' && !['반납 완료', '분실/파손'].includes(status)
      && (!!view.operations?.shippedAt || ['배송중', '수령완료'].includes(order.status) || status !== '대여 요청')
  })
  if (!items.length) return ''
  const recipient = order.targetType === 'vendor' ? order.targetDisplayName : order.sellerName
  const brand = order.productId && items.every(item => item.productId === order.productId) ? order.brandName?.trim() : ''
  const lines = items.map(item => {
    const option = [item.optionName, item.detailOption && item.detailOption !== item.optionName ? item.detailOption : ''].filter(Boolean).join(' / ')
    return `- ${item.productName}${option ? ` / ${option}` : ''}: ${item.quantity}개`
  })
  return `안녕하세요!\n\n${recipient ? `${recipient}님` : ''}${brand ? ` / ${brand}` : ''}${recipient || brand ? ' ' : ''}대여 샘플 회수 요청 부탁드립니다~!\n\n[회수 품목]\n${lines.join('\n')}\n총 ${items.reduce((sum, item) => sum + item.quantity, 0)}개입니다.\n\n회수 가능한 일정 확인 부탁드립니다. 감사합니다!`
}
