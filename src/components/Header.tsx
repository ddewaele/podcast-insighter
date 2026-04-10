import type { Theme, TranscriptAnalysis, User } from '../types'
import { ThemeToggle } from './ThemeToggle'
import { UserMenu } from './UserMenu'
import styles from './Header.module.css'

interface Props {
  data: TranscriptAnalysis
  onReset: () => void
  theme: Theme
  onToggleTheme: () => void
  user: User
  onLogout: () => void
}

export function Header({ data, onReset, theme, onToggleTheme, user, onLogout }: Props) {
  const { metadata } = data

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <div className={styles.meta}>
          <div className={styles.titleRow}>
            <div className={styles.waveIcon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <rect x="2" y="10" width="2.5" height="4" rx="1.25" fill="#818cf8" />
                <rect x="6.5" y="7" width="2.5" height="10" rx="1.25" fill="#818cf8" />
                <rect x="11" y="4" width="2.5" height="16" rx="1.25" fill="#6366f1" />
                <rect x="15.5" y="7" width="2.5" height="10" rx="1.25" fill="#818cf8" />
                <rect x="20" y="9" width="2.5" height="6" rx="1.25" fill="#818cf8" />
              </svg>
            </div>
            <h1 className={styles.title}>{metadata.title}</h1>
          </div>

          <div className={styles.chips}>
            <span className={styles.chip}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8zm7.5-3.5a.5.5 0 0 1 .5.5v3.793l2.146 2.147a.5.5 0 0 1-.708.708l-2.5-2.5A.5.5 0 0 1 6.5 9V5a.5.5 0 0 1 .5-.5z" />
              </svg>
              {metadata.estimated_duration_minutes} min
            </span>
            <span className={styles.chip}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M3 14s-1 0-1-1 1-4 6-4 6 3 6 4-1 1-1 1H3zm5-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
              </svg>
              {metadata.speakers.length} speakers
            </span>
            <span className={styles.chip}>{metadata.date_hint}</span>
          </div>

          <div className={styles.speakers}>
            {metadata.speakers.map((s) => (
              <span key={s} className={styles.speaker}>{s}</span>
            ))}
          </div>
        </div>

        <div className={styles.actions}>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />

          <button className={styles.resetBtn} onClick={onReset} title="Back to transcript list">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 3L5 8l5 5" />
            </svg>
            My Transcripts
          </button>

          <div className={styles.divider} />
          <UserMenu user={user} onLogout={onLogout} />
        </div>
      </div>
    </header>
  )
}
