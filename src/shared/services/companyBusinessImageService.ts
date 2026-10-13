import { supabase } from '../lib/supabase'

let pending: Promise<Blob> | undefined
supabase?.auth.onAuthStateChange(event => { if (event === 'SIGNED_OUT') pending = undefined })

export function decodeCompanyBusinessImage(data: { mime_type:string; image_base64:string; byte_size:number }) {
  if(data.mime_type !== 'image/png') throw new Error('사업자 정보 이미지 형식을 확인해주세요.')
  const binary=atob(data.image_base64)
  if(binary.length !== data.byte_size) throw new Error('사업자 정보 이미지가 완전하게 로드되지 않았습니다.')
  return new Blob([Uint8Array.from(binary,character=>character.charCodeAt(0))],{type:'image/png'})
}

export function loadCompanyBusinessImage() {
  if(!pending) pending=(async()=> {
    if(!supabase) throw new Error('운영 서버 연결을 확인해주세요.')
    const result=await supabase.from('company_share_assets').select('mime_type,image_base64,byte_size').eq('id','business-registration-bank').single()
    if(result.error || !result.data) throw new Error('사업자 정보 이미지를 불러오지 못했습니다. 로그인 상태를 확인하고 다시 시도해주세요.')
    return decodeCompanyBusinessImage(result.data)
  })().catch(error=>{pending=undefined;throw error})
  return pending
}

export function copyCompanyBusinessImage(load = loadCompanyBusinessImage) {
  if (!window.isSecureContext || !navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('이미지 복사 미지원')
  return navigator.clipboard.write([new ClipboardItem({ 'image/png': load() })])
}
