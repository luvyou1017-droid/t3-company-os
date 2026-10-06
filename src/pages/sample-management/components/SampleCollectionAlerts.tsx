import { useEffect, useState } from 'react'
import { useCompanyAuth } from '../../../features/auth/AuthGate'
import { sampleOrderStore } from '../../../features/samples/sampleOrderStore'
import { needsCollection } from '../../../features/samples/sampleProvision'
import { campaignService } from '../../../shared/services/campaignService'
import type { SampleOrder } from '../../../features/samples/sampleOrderModel'
export function SampleCollectionAlerts() {
  const {profile} = useCompanyAuth()
  const [orders,setOrders] = useState<SampleOrder[]>([])
  const [error,setError] = useState('')
  useEffect(() => { let active = true; const load = async () => { try { const rows = await sampleOrderStore.list(); if (active) {setOrders(rows);setError('')} } catch { if (active) setError('대여 회수 알림을 확인하지 못했습니다.') } }; void load(); const timer = window.setInterval(() => void load(),60000); window.addEventListener('focus',load); return () => {active=false;window.clearInterval(timer);window.removeEventListener('focus',load)} },[])
  const campaigns = campaignService.getCampaigns()
  const due = orders.filter(o => (o.managerId === profile.id || o.managerName === profile.display_name) && needsCollection(o,campaigns.find(c => c.id === o.campaignId)))
  if (error) return <p role="status">{error}</p>
  if (!due.length) return null
  return <section className="panel" role="status"><h3>샘플 수거 필요</h3>{due.map(o => <p key={o.id}><a href={`/samples?sampleId=${encodeURIComponent(o.id)}`}>{o.sellerName} · {o.productName} · {o.campaignName}</a> — 공구 종료 후 7일 경과</p>)}</section>
}
