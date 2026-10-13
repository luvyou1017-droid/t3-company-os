import { supabase } from '../lib/supabase'
export type TaxIdentityTarget = { ownerType: 'seller'|'manager'; ownerId: string }
export type TaxIdentityStatus = TaxIdentityTarget & { masked: string|null; updatedAt: string|null }
export type TaxIdentityExport = TaxIdentityTarget & { requestId: string; realName: string; number: string }
const client = () => { if (!supabase) throw new Error('원천세 보안 저장소 연결이 필요합니다.'); return supabase }
const checked = <T>(result:{data:unknown;error:unknown}):T => { if(result.error) { const message=(result.error as {message?:string}).message || ''; if(message.includes('Identity changed'))throw new Error('다른 담당자가 정보를 변경했습니다. 새로고침 후 다시 등록해주세요.'); if(message.includes('Invalid taxpayer'))throw new Error('실명과 주민번호의 생년월일·13자리 형식을 확인해주세요.'); if(message.includes('export blocked'))throw new Error('미등록 주민번호, 미지급 또는 중복 연결이 있어 제출용 다운로드를 중단했습니다.'); throw new Error('주민번호 보안 저장·조회에 실패했습니다. 권한 또는 최신 등록 상태를 확인해주세요.'); } return result.data as T }
export const taxIdentityService = {
 async status(targets:TaxIdentityTarget[]) { return checked<TaxIdentityStatus[]>(await client().rpc('tax_identity_status',{p_targets:targets})) },
 async save(target:TaxIdentityTarget,realName:string,number:string,expected:string|null) {
  const digits=number.replace(/\D/g,'')
  if(!realName.trim() || !/^\d{13}$/.test(digits)) throw new Error('실명과 주민번호 13자리를 입력해주세요.')
  return checked<TaxIdentityStatus>(await client().rpc('tax_identity_save',{p_owner_type:target.ownerType,p_owner_id:target.ownerId,p_real_name:realName.trim(),p_number:digits,p_expected:expected}))
 },
 async export(requestIds:string[]) { return checked<TaxIdentityExport[]>(await client().rpc('tax_identity_export',{p_request_ids:requestIds})) },
}
