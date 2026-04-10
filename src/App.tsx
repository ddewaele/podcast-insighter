import { useState, useCallback, useEffect, DragEvent } from 'react'
import type { Theme, TranscriptAnalysis, User } from './types'
import { DropZone } from './components/DropZone'
import { Dashboard } from './components/Dashboard'
import { LoginScreen } from './components/LoginScreen'
import { HomePage } from './components/HomePage'

type View = 'home' | 'upload' | 'dashboard'

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
  const [view, setView] = useState<View>('home')

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
    reader.onload = async (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string) as TranscriptAnalysis

        // Derive a title from the JSON metadata or fall back to the filename
        const title = parsed.metadata?.title || file.name.replace(/\.json$/i, '')

        // Persist to the backend — fire and forget; don't block viewing on save failure
        fetch('/api/transcripts', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, data: parsed }),
        }).catch(() => {/* ignore — transcript still loads locally */})

        setData(parsed)
        setView('dashboard')
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
    setView('home')
  }, [])

  const handleLogout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    setUser(null)
    setData(null)
    setError(null)
    setView('home')
  }, [])

  const handleOpenTranscript = useCallback((transcriptData: TranscriptAnalysis) => {
    setData(transcriptData)
    setView('dashboard')
  }, [])

  const commonProps = { theme, onToggleTheme: toggleTheme, user: user!, onLogout: handleLogout }

  // Blank screen while we check the session (avoids flash of login screen)
  if (!authChecked) return null

  // Not logged in → login screen
  if (!user) {
    return <LoginScreen theme={theme} onToggleTheme={toggleTheme} />
  }

  if (view === 'dashboard' && data) {
    return <Dashboard data={data} onReset={handleReset} {...commonProps} />
  }

  if (view === 'upload') {
    return (
      <DropZone
        onDrop={handleDrop}
        onFile={handleFile}
        error={error}
        onBack={() => { setError(null); setView('home') }}
        {...commonProps}
      />
    )
  }

  return (
    <HomePage
      onOpen={handleOpenTranscript}
      onUpload={() => setView('upload')}
      {...commonProps}
    />
  )
}
