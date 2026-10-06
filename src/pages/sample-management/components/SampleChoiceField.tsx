import { useState } from 'react'
export const ORDER_METHODS = ['카카오톡','발주모아','이메일','공급사 사이트','전화']
export const SAMPLE_PURPOSES = ['촬영','제품 체험','공구 진행 검토','테스트','이벤트/사은품','콘텐츠 제작']
export function SampleChoiceField({label,value,options,required=false,onChange}:{label:string;value:string;options:string[];required?:boolean;onChange:(value:string)=>void}) {
  const [other,setOther] = useState(!!value && !options.includes(value))
  return <label>{label}<select aria-label={label} required={required} value={other ? '기타' : value} onChange={e=>{setOther(e.target.value==='기타');onChange(e.target.value==='기타' ? '' : e.target.value)}}><option value="">선택</option>{options.map(v=><option key={v}>{v}</option>)}<option>기타</option></select>{other && <input aria-label={`${label} 기타 입력`} required={required} value={value} onChange={e=>onChange(e.target.value)} placeholder="직접 입력" />}</label>
}
