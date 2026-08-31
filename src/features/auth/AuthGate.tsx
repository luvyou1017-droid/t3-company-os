import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from '../../shared/lib/supabase'

const CEO_EMAIL = 'solution4834@naver.com'

type AuthGateProps = {
  children: ReactNode
}

export function AuthGate({ children }: AuthGateProps) {
  const [session, setSession] = useState<Session | null>(null)
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
      setChecking(false)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

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

  if (!isSupabaseConfigured()) {
    return <AuthNotice title="데이터베이스 연결 정보가 필요해요" description="관리자에게 환경 설정을 요청해 주세요." />
  }

  if (checking) {
    return <AuthNotice title="로그인 상태를 확인하고 있어요" description="잠시만 기다려 주세요." />
  }

  if (session) return <>{children}</>

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
