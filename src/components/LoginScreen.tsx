import type { Theme } from '../types'
import { ThemeToggle } from './ThemeToggle'
import styles from './LoginScreen.module.css'

interface Props {
  theme: Theme
  onToggleTheme: () => void
}

export function LoginScreen({ theme, onToggleTheme }: Props) {
  return (
    <div className={styles.page}>
      <div className={styles.themeBtn}>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>

      <div className={styles.card}>
        <div className={styles.logoMark}>
          <WaveformIcon />
        </div>

        <div>
          <h1 className={styles.title}>Podcast Insighter</h1>
          <p className={styles.subtitle}>
            Turn any podcast into quotes, insights, references, and timelines — instantly.
          </p>
        </div>

        <div className={styles.divider} />

        <a href="/auth/google" className={styles.googleBtn}>
          <GoogleIcon />
          Sign in with Google
        </a>

        <p className={styles.footer}>
          Your account lets you save and share analyses with others.
        </p>
      </div>
    </div>
  )
}

function WaveformIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12h3M5 7v10M9 4v16M13 9v6M17 6v12M21 10v4" />
    </svg>
  )
}

function GoogleIcon() {
  return (
    <svg className={styles.googleIcon} viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}
