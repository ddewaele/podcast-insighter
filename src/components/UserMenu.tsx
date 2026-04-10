import { useState, useRef, useEffect } from 'react'
import type { User } from '../types'
import styles from './UserMenu.module.css'

interface Props {
  user: User
  onLogout: () => void
}

export function UserMenu({ user, onLogout }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className={styles.root} ref={ref}>
      <button className={styles.trigger} onClick={() => setOpen(o => !o)} aria-label="User menu">
        <Avatar user={user} size={28} />
        <span className={styles.name}>{firstName(user.name)}</span>
        <ChevronIcon className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`} />
      </button>

      {open && (
        <div className={styles.dropdown}>
          <div className={styles.profile}>
            <Avatar user={user} size={36} />
            <div className={styles.profileText}>
              <span className={styles.profileName}>{user.name}</span>
              <span className={styles.profileEmail}>{user.email}</span>
            </div>
          </div>
          <div className={styles.separator} />
          <button className={styles.logoutBtn} onClick={() => { setOpen(false); onLogout() }}>
            <LogoutIcon />
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

function firstName(name: string) {
  return name.split(' ')[0]
}

export function Avatar({ user, size }: { user: User; size: number }) {
  const initials = user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  if (user.avatarUrl) {
    return <img src={user.avatarUrl} alt={user.name} width={size} height={size} className={styles.avatar} style={{ width: size, height: size }} />
  }
  return (
    <div className={styles.avatarInitials} style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials}
    </div>
  )
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
      <path d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/>
    </svg>
  )
}

function LogoutIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M10 12.5a.5.5 0 0 1-.5.5h-8a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 .5-.5h8a.5.5 0 0 1 .5.5v2a.5.5 0 0 0 1 0v-2A1.5 1.5 0 0 0 9.5 2h-8A1.5 1.5 0 0 0 0 3.5v9A1.5 1.5 0 0 0 1.5 14h8a1.5 1.5 0 0 0 1.5-1.5v-2a.5.5 0 0 0-1 0v2z"/>
      <path d="M15.854 8.354a.5.5 0 0 0 0-.708l-3-3a.5.5 0 0 0-.708.708L14.293 7.5H5.5a.5.5 0 0 0 0 1h8.793l-2.147 2.146a.5.5 0 0 0 .708.708l3-3z"/>
    </svg>
  )
}
