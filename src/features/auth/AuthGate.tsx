import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from '../../shared/lib/supabase'

const CEO_EMAIL = 'solution4834@naver.com'

type AuthGateProps = {
  children: ReactNode
}

export type CompanyProfile = {
  id: string
  display_name: string
  email: string | null
  role: 'ceo' | 'settlement_cs' | 'team_lead' | 'md' | 'manager' | 'admin'
  active: boolean
  approval_status: 'pending' | 'approved' | 'rejected'
}

const AuthContext = createContext<{ profile: CompanyProfile; signOut: () => Promise<void> } | null>(null)

export function useCompanyAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useCompanyAuth must be used inside AuthGate')
  return context
}

export function AuthGate({ children }: AuthGateProps) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<CompanyProfile | null>(null)
  const [checking, setChecking] = useState(true)
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!supabase) {
      setChecking(false)
      return
    }

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setChecking(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (!nextSession) setProfile(null)
      setChecking(false)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!supabase || !session) return
    setChecking(true)
    void supabase.from('profiles')
      .select('id, display_name, email, role, active, approval_status')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        setProfile(data as CompanyProfile | null)
        setChecking(false)
      })
  }, [session])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase) return
    setSubmitting(true)
    setMessage('')

    const result = mode === 'signup'
      ? await supabase.auth.signUp({ email: CEO_EMAIL, password })
      : await supabase.auth.signInWithPassword({ email: CEO_EMAIL, password })

    if (result.error) {
      setMessage(translateAuthError(result.error.message))
    } else if (mode === 'signup' && !result.data.session) {
      setMessage('네이버 메일로 인증 링크를 보냈어요. 메일 인증 후 로그인해 주세요.')
      setMode('login')
      setPassword('')
    }
    setSubmitting(false)
  }

  const handleGoogleLogin = async () => {
    if (!supabase) return
    setMessage('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) setMessage(`구글 로그인 연결 중 문제가 생겼어요: ${error.message}`)
  }

  const signOut = async () => {
    await supabase?.auth.signOut()
  }

  if (!isSupabaseConfigured()) {
    return <AuthNotice title="데이터베이스 연결 정보가 필요해요" description="관리자에게 환경 설정을 요청해 주세요." />
  }

  if (checking) {
    return <AuthNotice title="로그인 상태를 확인하고 있어요" description="잠시만 기다려 주세요." />
  }

  if (session && (!profile || profile.approval_status !== 'approved' || !profile.active)) {
    return (
      <main className="auth-page">
        <section className="auth-card auth-card--notice">
          <div className="auth-brand" aria-hidden="true">W</div>
          <p className="auth-eyebrow">가입 신청 완료</p>
          <h1>관리자 승인을 기다리고 있어요</h1>
          <p className="auth-description">{session.user.email} 계정의 신청이 접수됐습니다. 대표님이 승인하면 회사 운영 화면이 열립니다.</p>
          <button className="auth-mode-button" type="button" onClick={() => void signOut()}>다른 계정으로 로그인</button>
        </section>
      </main>
    )
  }

  if (session && profile) return <AuthContext.Provider value={{ profile, signOut }}>{children}</AuthContext.Provider>

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-brand" aria-hidden="true">W</div>
        <p className="auth-eyebrow">WISE VENDOR · T3 COMPANY OS</p>
        <h1>{mode === 'login' ? '와이즈벤더 운영 시스템' : '대표 관리자 계정 만들기'}</h1>
        <p className="auth-description">
          {mode === 'login'
            ? '공동구매 일정, 매출, 정산을 한 곳에서 관리합니다.'
            : '처음 한 번만 비밀번호를 설정하면 됩니다.'}
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            이메일
            <input value={CEO_EMAIL} type="email" autoComplete="username" readOnly />
          </label>
          <label>
            비밀번호
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={8}
              placeholder="8자 이상 입력"
              required
            />
          </label>
          {message && <p className="auth-message" role="status">{message}</p>}
          <button className="auth-primary-button" type="submit" disabled={submitting}>
            {submitting ? '처리 중…' : mode === 'login' ? '로그인' : '관리자 계정 만들기'}
          </button>
        </form>

        <div className="auth-divider"><span>또는</span></div>
        <button className="auth-google-button" type="button" onClick={() => void handleGoogleLogin()}>
          <span aria-hidden="true">G</span> Google 계정으로 로그인
        </button>

        <button className="auth-mode-button" type="button" onClick={() => {
          setMode((current) => current === 'login' ? 'signup' : 'login')
          setMessage('')
          setPassword('')
        }}>
          {mode === 'login' ? '처음이신가요? 관리자 계정 만들기' : '이미 계정이 있나요? 로그인'}
        </button>
        <p className="auth-security">비밀번호는 와이즈벤더나 담당자가 볼 수 없으며 안전하게 암호화됩니다.</p>
      </section>
    </main>
  )
}

function AuthNotice({ title, description }: { title: string; description: string }) {
  return (
    <main className="auth-page">
      <section className="auth-card auth-card--notice">
        <div className="auth-brand" aria-hidden="true">W</div>
        <h1>{title}</h1>
        <p className="auth-description">{description}</p>
      </section>
    </main>
  )
}

function translateAuthError(message: string) {
  if (message.includes('Invalid login credentials')) return '이메일 또는 비밀번호를 확인해 주세요.'
  if (message.includes('User already registered')) return '이미 만들어진 계정이에요. 로그인으로 진행해 주세요.'
  if (message.includes('Password should be')) return '비밀번호를 8자 이상 입력해 주세요.'
  if (message.includes('Email not confirmed')) return '네이버 메일에서 인증 링크를 먼저 눌러 주세요.'
  return `로그인 처리 중 문제가 생겼어요: ${message}`
}
