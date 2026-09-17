const managerHearts: Record<string, string> = {
  서주희: '💙',
  고정원: '💗',
  김방희: '💛',
  김병희: '💛',
  이규빈: '💚',
  유시철: '🤍',
  허윤정: '💜',
  배민성: '🧡',
  허수정: '🤎',
  김수정: '🩷',
  나하서: '🩵',
  이하영: '🩶',
}

const fallbackHearts = ['💜', '🧡', '🩵', '🤎', '🩶', '🤍']

function getHeart(name: string) {
  if (managerHearts[name]) return managerHearts[name]
  const hash = [...name].reduce((sum, character) => sum + (character.codePointAt(0) ?? 0), 0)
  return fallbackHearts[hash % fallbackHearts.length]
}

export function ManagerBadge({ name }: { name: string }) {
  const displayName = name || '확인 필요'
  return <span className="manager-badge"><span aria-hidden="true">{getHeart(displayName)}</span><strong>{displayName}</strong></span>
}
