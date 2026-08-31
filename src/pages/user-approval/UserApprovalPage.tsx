import { useEffect, useState } from 'react'
import { useCompanyAuth, type CompanyProfile } from '../../features/auth/AuthGate'
import { supabase } from '../../shared/lib/supabase'

type UserRole = CompanyProfile['role']
type PendingProfile = CompanyProfile & { requested_at?: string | null }

const roleLabels: Record<UserRole, string> = {
  ceo: '대표', admin: '관리자', settlement_cs: '정산·CS', team_lead: '팀장', md: 'MD', manager: '매니저',
}

export function UserApprovalPage() {
  const { profile } = useCompanyAuth()
  const [users, setUsers] = useState<PendingProfile[]>([])
  const [roles, setRoles] = useState<Record<string, UserRole>>({})
  const [message, setMessage] = useState('')
  const canApprove = profile.role === 'ceo' || profile.role === 'admin'

  const loadUsers = async () => {
    if (!supabase || !canApprove) return
    const { data, error } = await supabase.from('profiles')
      .select('id, display_name, email, role, active, approval_status, requested_at')
      .eq('approval_status', 'pending')
      .order('requested_at', { ascending: true })
    if (error) setMessage(`신청 목록을 불러오지 못했어요: ${error.message}`)
    else setUsers((data ?? []) as PendingProfile[])
  }

  useEffect(() => { void loadUsers() }, [canApprove])

  const decide = async (user: PendingProfile, approvalStatus: 'approved' | 'rejected') => {
    if (!supabase) return
    setMessage('')
    const role = roles[user.id] ?? 'manager'
    const { error } = await supabase.from('profiles').update({
      approval_status: approvalStatus,
      active: approvalStatus === 'approved',
      role,
      approved_at: new Date().toISOString(),
      approved_by: profile.id,
    }).eq('id', user.id)
    if (error) setMessage(`처리하지 못했어요: ${error.message}`)
    else {
      setMessage(`${user.display_name || user.email} 계정을 ${approvalStatus === 'approved' ? '승인' : '거절'}했습니다.`)
      await loadUsers()
    }
  }

  if (!canApprove) return <section className="panel"><h2>사용자 승인</h2><p>대표 또는 관리자만 접근할 수 있습니다.</p></section>

  return (
    <section className="approval-page">
      <div className="panel__header"><div><h2>사용자 승인</h2><p>구글 로그인을 신청한 직원에게 역할을 정해 승인합니다.</p></div><span className="approval-count">대기 {users.length}명</span></div>
      {message && <p className="auth-message">{message}</p>}
      {!users.length && <div className="approval-empty">현재 승인 대기 중인 사용자가 없습니다.</div>}
      <div className="approval-list">
        {users.map((user) => (
          <article className="approval-card" key={user.id}>
            <div><strong>{user.display_name || '이름 미등록'}</strong><span>{user.email}</span></div>
            <select value={roles[user.id] ?? 'manager'} onChange={(event) => setRoles((current) => ({ ...current, [user.id]: event.target.value as UserRole }))}>
              {Object.entries(roleLabels).filter(([role]) => role !== 'ceo').map(([role, label]) => <option key={role} value={role}>{label}</option>)}
            </select>
            <div className="approval-actions">
              <button className="approval-reject" onClick={() => void decide(user, 'rejected')} type="button">거절</button>
              <button className="approval-accept" onClick={() => void decide(user, 'approved')} type="button">승인</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
