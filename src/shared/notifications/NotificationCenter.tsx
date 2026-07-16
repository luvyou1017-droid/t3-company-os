import { useEffect, useState } from 'react'
import { notificationService } from '../../features/cs/services/notificationService'
import type { CsNotification } from '../../features/cs/types'

type NotificationCenterProps = {
  onOpenCsCase: (csCaseId: string) => void
}

export function NotificationCenter({ onOpenCsCase }: NotificationCenterProps) {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<CsNotification[]>(() => notificationService.list())

  useEffect(() => {
    const sync = () => setNotifications(notificationService.list())
    window.addEventListener('t3-storage-updated', sync)
    return () => window.removeEventListener('t3-storage-updated', sync)
  }, [])

  const unreadCount = notifications.filter((item) => !item.read).length

  return (
    <div className="notification-center">
      <button className="notification-button" onClick={() => setOpen((value) => !value)} type="button">
        알림
        {unreadCount > 0 && <span>{unreadCount}</span>}
      </button>
      {open && (
        <section className="notification-popover">
          <h3>알림 센터</h3>
          {notifications.length === 0 ? <p>알림이 없습니다.</p> : notifications.map((notification) => (
            <article className={notification.read ? 'notification-item' : 'notification-item is-unread'} key={notification.id}>
              <strong>{notification.title}</strong>
              <p>{notification.message}</p>
              <button
                className="secondary-button"
                onClick={() => {
                  notificationService.markRead(notification.id)
                  setNotifications(notificationService.list())
                  setOpen(false)
                  onOpenCsCase(notification.csCaseId)
                }}
                type="button"
              >
                바로 확인
              </button>
            </article>
          ))}
        </section>
      )}
    </div>
  )
}
