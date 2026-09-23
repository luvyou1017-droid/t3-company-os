export function sellerAccountText(account?: { bankName?: string; accountNumber?: string; accountHolder?: string }) {
  if (!account?.bankName?.trim() || !account.accountNumber?.trim() || !account.accountHolder?.trim()) return '계좌정보 확인 필요'
  return `은행명: ${account.bankName}\n계좌번호: ${account.accountNumber}\n예금주: ${account.accountHolder}`
}
