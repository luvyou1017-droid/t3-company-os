// Numeric load timings only: no account, token, or business data is recorded.
export function recordStartupTiming(stage: 'session' | 'profile' | 'workspace') {
  if (typeof document === 'undefined' || typeof performance === 'undefined') return
  const attribute = `data-t3-startup-${stage}-ms`
  if (!document.documentElement.hasAttribute(attribute)) {
    document.documentElement.setAttribute(attribute, String(Math.round(performance.now())))
  }
}
