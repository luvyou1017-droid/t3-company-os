import type { AccountingRow } from './accountingRows'
import { accountingExportRows } from './accountingRows'
import type { TaxIdentityExport } from '../services/taxIdentityService'
export function taxIdentityExportRows(rows:AccountingRow[], identities:TaxIdentityExport[]) {
 return rows.map(row=> {
  const matches=identities.filter(identity=>identity.requestId===row.paymentRequestId && identity.ownerType===row.ownerType && identity.ownerId===row.ownerId)
  if(matches.length!==1 || !/^\d{13}$/.test(matches[0].number) || !matches[0].realName.trim()) throw new Error('실명·주민번호가 없는 건 또는 연결이 불명확한 건이 있습니다. 제출용 다운로드를 중단했습니다.')
  const identity=matches[0]
  return {...accountingExportRows([row])[0],이름:identity.realName,셀러매니저표시명:row.name,주민등록번호:`${identity.number.slice(0,6)}-${identity.number.slice(6)}`}
 })
}
