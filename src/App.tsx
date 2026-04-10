import { useState, useCallback, useEffect, DragEvent } from 'react'
import type { Theme, TranscriptAnalysis, User } from './types'
import { DropZone } from './components/DropZone'
import { Dashboard } from './components/Dashboard'
import { LoginScreen } from './components/LoginScreen'

function getInitialTheme(): Theme {
  const stored = localStorage.getItem('theme') as Theme | null
  const theme = stored === 'dark' || stored === 'light'
    ? stored
    : window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  // Set synchronously so the CSS transition doesn't fire on first paint
  document.documentElement.setAttribute('data-theme', theme)
  return theme
}

export default function App() {
  const [data, setData] = useState<TranscriptAnalysis | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  const [user, setUser] = useState<User | null>(null)
  const [authChecked, setAuthChecked] = useState(false)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  // Check if the user already has a session on mount
  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((u: User | null) => {
        setUser(u)
        setAuthChecked(true)
      })
      .catch(() => setAuthChecked(true))
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(t => t === 'dark' ? 'light' : 'dark')
  }, [])

  const handleFile = useCallback((file: File) => {
    setError(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string)
        setData(parsed as TranscriptAnalysis)
      } catch {
        setError('Invalid JSON file. Please drop a valid transcript analysis file.')
      }
    }
    reader.readAsText(file)
  }, [])

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file?.type === 'application/json' || file?.name.endsWith('.json')) {
      handleFile(file)
    } else {
      setError('Please drop a JSON file.')
    }
  }, [handleFile])

  const handleReset = useCallback(() => {
    setData(null)
    setError(null)
  }, [])

  // Blank screen while we check the session (avoids flash of login screen)
  if (!authChecked) return null

  // Not logged in → login screen
  if (!user) {
    return <LoginScreen theme={theme} onToggleTheme={toggleTheme} />
  }

  // Logged in, transcript loaded → dashboard
  if (data) {
    return <Dashboard data={data} onReset={handleReset} theme={theme} onToggleTheme={toggleTheme} />
  }

  // Logged in, no transcript yet → drop zone
  return <DropZone onDrop={handleDrop} onFile={handleFile} error={error} theme={theme} onToggleTheme={toggleTheme} />
}
